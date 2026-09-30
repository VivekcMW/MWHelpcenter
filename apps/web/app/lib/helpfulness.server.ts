import { createHash, randomBytes } from 'node:crypto'
import { resolve } from 'node:path'
import { isLocale, type Locale } from '../i18n/config'
import { getArticle } from './content.server'
import { getEnv } from './env.server'
import { readHelpfulnessVote, writeHelpfulnessVote } from './helpfulness-store.server'
import type { HelpfulnessReason, HelpfulnessStoreConfig, HelpfulnessVote, StoredHelpfulness } from './helpfulness-store.server'

const COOKIE_NAME = 'mw_helpfulness'
const MAX_BODY_BYTES = 2048
const REASONS = new Set(['unclear', 'missing', 'outdated', 'other'])
type FeedbackError = 'invalid' | 'forbidden' | 'tooLarge' | 'rateLimited' | 'unavailable' | 'notFound'

export interface HelpfulnessState {
  enabled: boolean
  demo: boolean
  vote: HelpfulnessVote | null
  reason: string
  headers: Headers
}

// Never fall back to the demo database when CMS mode is selected. This setting
// is independent of the shared environment schema and does not provision a DB service.
export function getHelpfulnessConfig(): HelpfulnessStoreConfig | null {
  const source = getEnv().CONTENT_MODE
  const configuredPath = process.env.FEEDBACK_DB_PATH?.trim()
  if (!configuredPath && source !== 'demo') return null
  return { source, path: resolve(configuredPath || 'data/helpfulness-demo.sqlite') }
}

function visitorToken(request: Request): string | null {
  const matches = (request.headers.get('Cookie') ?? '').split(';')
    .map((part) => part.trim()).filter((part) => part.split('=', 1)[0] === COOKIE_NAME)
  if (matches.length !== 1) return null
  const value = matches[0].slice(COOKIE_NAME.length + 1)
  return /^[0-9a-f]{64}$/.test(value) ? value : null
}

function hashVisitor(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function getHelpfulnessState(request: Request, articleId: string, locale: Locale): Promise<HelpfulnessState> {
  const state: HelpfulnessState = { enabled: false, demo: false, vote: null, reason: '', headers: new Headers({ 'Cache-Control': 'no-store' }) }
  try {
    const config = getHelpfulnessConfig()
    if (!config) return state
    state.demo = config.source === 'demo'
    if (!isLocale(locale) || !publishedId(articleId)) return state
    const token = visitorToken(request)
    const stored = readHelpfulnessVote(config, token ? { articleId, locale, visitorHash: hashVisitor(token) } : null)
    return { ...state, enabled: true, vote: stored?.vote ?? null, reason: stored?.reason ?? '' }
  } catch {
    // A feedback database must never make an article unavailable.
    return state
  }
}

function publishedId(id: string): boolean {
  return typeof id === 'string' && id.trim().length > 0 && !id.startsWith('drafts.') && !id.startsWith('versions.')
}

function json(body: { ok: true; vote: HelpfulnessVote; reason: string } | { ok: false; error: FeedbackError }, status: number, extra?: HeadersInit): Response {
  const headers = new Headers(extra)
  headers.set('Cache-Control', 'no-store')
  headers.set('Content-Type', 'application/json; charset=utf-8')
  return new Response(JSON.stringify(body), { status, headers })
}

function failure(error: FeedbackError, status: number, headers?: HeadersInit): Response {
  return json({ ok: false, error }, status, headers)
}

class InvalidBody extends Error {
  constructor(readonly tooLarge = false) { super('Invalid feedback body') }
}

async function readBoundedBody(request: Request): Promise<Uint8Array> {
  const length = request.headers.get('Content-Length')
  if (length !== null) {
    if (!/^\d+$/.test(length)) throw new InvalidBody()
    if (Number(length) > MAX_BODY_BYTES) {
      void request.body?.cancel().catch(() => {})
      throw new InvalidBody(true)
    }
  }
  const reader = request.body?.getReader()
  if (!reader) throw new InvalidBody()
  const bytes = new Uint8Array(MAX_BODY_BYTES)
  let size = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_BODY_BYTES) {
        void reader.cancel().catch(() => {})
        throw new InvalidBody(true)
      }
      bytes.set(value, size - value.byteLength)
    }
  } finally {
    reader.releaseLock()
  }
  return bytes.subarray(0, size)
}

async function readFeedback(request: Request): Promise<StoredHelpfulness> {
  const form = new URLSearchParams(new TextDecoder('utf-8', { fatal: true }).decode(await readBoundedBody(request)))
  const fields = new Set<string>()
  for (const [name] of form) {
    if (!['vote', 'reason', 'website'].includes(name) || fields.has(name)) throw new InvalidBody()
    fields.add(name)
  }
  const vote = form.get('vote')
  const reason = form.get('reason') ?? ''
  if ((vote !== 'yes' && vote !== 'no') || (reason !== '' && !REASONS.has(reason)) || (form.get('website') ?? '') !== '') {
    throw new InvalidBody()
  }
  return { vote, reason: vote === 'yes' ? '' : reason as HelpfulnessReason }
}

export async function submitHelpfulness(request: Request, locale: Locale, slug: string): Promise<Response> {
  if (request.method !== 'POST') return failure('invalid', 405, { Allow: 'POST' })
  const origin = request.headers.get('Origin')
  if (!origin || origin === 'null' || origin !== new URL(request.url).origin || request.headers.get('Sec-Fetch-Site')?.toLowerCase() === 'cross-site') {
    return failure('forbidden', 403)
  }
  if (!/^application\/x-www-form-urlencoded(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/i.test(request.headers.get('Content-Type') ?? '')) {
    return failure('invalid', 415)
  }
  let feedback: StoredHelpfulness
  try {
    feedback = await readFeedback(request)
  } catch (error) {
    return error instanceof InvalidBody && error.tooLarge ? failure('tooLarge', 413) : failure('invalid', 400)
  }
  if (!isLocale(locale) || !slug) return failure('notFound', 404)
  try {
    const config = getHelpfulnessConfig()
    if (!config) return failure('unavailable', 503)
    readHelpfulnessVote(config, null)
    const article = await getArticle(locale, slug)
    // getArticle is published-only; still enforce the boundary if a provider
    // unexpectedly returns a draft, release version, or different translation.
    if (!article || !publishedId(article._id) || article.language !== locale || article.slug !== slug) {
      return failure('notFound', 404)
    }
    const existingToken = visitorToken(request)
    const token = existingToken ?? randomBytes(32).toString('hex')
    const result = writeHelpfulnessVote(config, { articleId: article._id, locale, visitorHash: hashVisitor(token) }, feedback)
    if (result === 'rateLimited') return failure('rateLimited', 429, { 'Retry-After': '60' })
    const headers = new Headers()
    if (!existingToken) {
      headers.set('Set-Cookie', `${COOKIE_NAME}=${token}; Max-Age=2592000; Path=/; HttpOnly; SameSite=Lax${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`)
    }
    return json({ ok: true, ...feedback }, 200, headers)
  } catch {
    return failure('unavailable', 503)
  }
}