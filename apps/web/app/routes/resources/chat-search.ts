import type { ActionFunctionArgs } from 'react-router'
import { requireLocale } from '../../i18n/config'
import { getSearchCatalog } from '../../lib/content.server'
import { searchArticles } from '../../features/search/rank'
import { MAX_QUERY_LENGTH, queryTerms } from '../../features/search/text'

export type ChatSearchResult = { title: string; slug: string; summary: string }
export type ChatSearchResponse = { ok: true; results: ChatSearchResult[] } | { ok: false; error: 'invalid' | 'unavailable' }

const MAX_BODY_BYTES = 2048

function respond(result: ChatSearchResponse, status: number) {
  return Response.json(result, {status, headers: {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'}})
}

async function readBody(request: Request): Promise<string | null> {
  const length = request.headers.get('content-length')
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_BODY_BYTES)) return null
  const reader = request.body?.getReader()
  if (!reader) return null
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const {value, done} = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_BODY_BYTES) {
        await reader.cancel()
        return null
      }
      chunks.push(value)
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    return new TextDecoder('utf-8', {fatal: true}).decode(bytes)
  } catch (error) {
    if (error instanceof TypeError) return null
    throw error
  } finally {
    reader.releaseLock()
  }
}

export async function action({request, params}: ActionFunctionArgs) {
  const locale = requireLocale(params.locale)
  const origin = request.headers.get('origin')
  if (!origin || origin !== new URL(request.url).origin || request.headers.get('sec-fetch-site')?.toLowerCase() === 'cross-site') {
    return respond({ok: false, error: 'invalid'}, 403)
  }
  if (!/^application\/x-www-form-urlencoded(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/i.test(request.headers.get('content-type') ?? '')) {
    return respond({ok: false, error: 'invalid'}, 415)
  }
  const body = await readBody(request)
  if (body === null) return respond({ok: false, error: 'invalid'}, 400)
  const fields = new URLSearchParams(body)
  const values = fields.getAll('query')
  const query = values[0]?.trim() ?? ''
  if ([...fields.keys()].some((key) => key !== 'query') || values.length !== 1 || values[0].length > MAX_QUERY_LENGTH || !queryTerms(query, locale).length) {
    return respond({ok: false, error: 'invalid'}, 400)
  }

  try {
    const {articles} = await getSearchCatalog(locale)
    const results = searchArticles(articles, query, '', locale).slice(0, 3).map(({title, slug, summary}) => ({title, slug, summary}))
    return respond({ok: true, results}, 200)
  } catch (error) {
    console.error('Help chat article search failed:', error instanceof Error ? error.name : 'unknown error')
    return respond({ok: false, error: 'unavailable'}, 503)
  }
}
