import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { Worker } from 'node:worker_threads'
import ts from 'typescript'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Article } from '@mw/content'
import type { Locale } from '../app/i18n/config'
import { getHelpfulnessConfig, getHelpfulnessState, submitHelpfulness } from '../app/lib/helpfulness.server'
import { readHelpfulnessVote, writeHelpfulnessVote } from '../app/lib/helpfulness-store.server'
import type { HelpfulnessKey, HelpfulnessStoreConfig } from '../app/lib/helpfulness-store.server'

const mocks = vi.hoisted(() => ({ getArticle: vi.fn(), getEnv: vi.fn() }))
vi.mock('../app/lib/content.server', () => ({ getArticle: mocks.getArticle }))
vi.mock('../app/lib/env.server', () => ({ getEnv: mocks.getEnv }))

const article: Article = {
  _id: 'published-guide', slug: 'guide', title: 'Guide', summary: '', language: 'en',
  productSlugs: [], contentType: 'guide', body: [],
}
const token = 'a'.repeat(64)
const hash = createHash('sha256').update(token).digest('hex')
const key: HelpfulnessKey = { articleId: article._id, locale: 'en', visitorHash: hash }
const epoch = 1_800_000_000_000
const retention = 90 * 24 * 60 * 60 * 1000
let directory: string
let config: HelpfulnessStoreConfig

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'mw-helpfulness-'))
  config = { path: join(directory, 'private', 'feedback.sqlite'), source: 'demo' }
  vi.stubEnv('FEEDBACK_DB_PATH', config.path)
  mocks.getEnv.mockReset().mockReturnValue({ CONTENT_MODE: 'demo' })
  mocks.getArticle.mockReset().mockResolvedValue(article)
})

afterEach(() => {
  vi.unstubAllEnvs()
  rmSync(directory, { recursive: true, force: true })
})

function post(body: BodyInit = 'vote=yes', options: RequestInit & { duplex?: 'half' } = {}): Request {
  const headers = new Headers({ Origin: 'https://help.test', 'Content-Type': 'application/x-www-form-urlencoded' })
  new Headers(options.headers).forEach((value, name) => headers.set(name, value))
  return new Request('https://help.test/en/articles/guide?private-query=never-store', { method: 'POST', ...options, body, headers })
}

function inspect(sql: string) {
  const db = new DatabaseSync(config.path)
  try { return db.prepare(sql).all() } finally { db.close() }
}

function execute(sql: string) {
  const db = new DatabaseSync(config.path)
  try { db.exec(sql) } finally { db.close() }
}

async function expectFailure(response: Response, status: number, error: string) {
  expect(response.status).toBe(status)
  expect(await response.json()).toEqual({ ok: false, error })
  expect(response.headers.get('Cache-Control')).toBe('no-store')
  expect(response.headers.get('Content-Type')).toBe('application/json; charset=utf-8')
  expect(response.headers.has('Set-Cookie')).toBe(false)
}

describe('helpfulness local configuration and passive state', () => {
  it('uses the demo default only in demo mode; CMS mode requires an explicit local path', () => {
    vi.stubEnv('FEEDBACK_DB_PATH', '')
    expect(getHelpfulnessConfig()).toEqual({ source: 'demo', path: resolve('data/helpfulness-demo.sqlite') })
    mocks.getEnv.mockReturnValue({ CONTENT_MODE: 'sanity' })
    expect(getHelpfulnessConfig()).toBeNull()
    vi.stubEnv('FEEDBACK_DB_PATH', '   ')
    expect(getHelpfulnessConfig()).toBeNull()
    vi.stubEnv('FEEDBACK_DB_PATH', config.path)
    expect(getHelpfulnessConfig()).toEqual({ ...config, source: 'sanity' })
  })

  it('does not create a cookie or store a visitor on passive reads', async () => {
    const state = await getHelpfulnessState(new Request('https://help.test/en/articles/guide'), article._id, 'en')
    expect(state).toMatchObject({ enabled: true, demo: true, vote: null, reason: '' })
    expect(state.headers.get('Cache-Control')).toBe('no-store')
    expect(state.headers.has('Set-Cookie')).toBe(false)
    expect(inspect('SELECT * FROM helpfulness_votes')).toEqual([])
    expect(inspect('SELECT * FROM helpfulness_rate_events')).toEqual([])
    expect(mocks.getArticle).not.toHaveBeenCalled()
  })

  it('reads a hashed visitor vote, scopes it to the article/locale/source, and exposes no token', async () => {
    writeHelpfulnessVote(config, key, { vote: 'no', reason: 'missing' })
    const request = new Request('https://help.test', { headers: { Cookie: `other=x; mw_helpfulness=${token}` } })
    const state = await getHelpfulnessState(request, article._id, 'en')
    expect(state).toMatchObject({ enabled: true, demo: true, vote: 'no', reason: 'missing' })
    expect(JSON.stringify(state)).not.toContain(token)
    expect(JSON.stringify(state)).not.toContain(hash)
    expect(state.headers.has('Set-Cookie')).toBe(false)
    expect((await getHelpfulnessState(request, article._id, 'ja')).vote).toBeNull()
    expect((await getHelpfulnessState(request, 'different', 'en')).vote).toBeNull()
    mocks.getEnv.mockReturnValue({ CONTENT_MODE: 'sanity' })
    expect(await getHelpfulnessState(request, article._id, 'en')).toMatchObject({ enabled: true, demo: false, vote: null })
  })

  it.each(['mw_helpfulness=bad', `mw_helpfulness=${token.toUpperCase()}`, `mw_helpfulness=${token}; mw_helpfulness=${token}`, `mw_helpfulness=%61${token.slice(1)}`])('ignores malformed or ambiguous cookies: %s', async (cookie) => {
    writeHelpfulnessVote(config, key, { vote: 'yes', reason: '' })
    const state = await getHelpfulnessState(new Request('https://help.test', { headers: { Cookie: cookie } }), article._id, 'en')
    expect(state.vote).toBeNull()
    expect(state.headers.has('Set-Cookie')).toBe(false)
  })

  it('disabled CMS mode touches neither disk nor content provider', async () => {
    mocks.getEnv.mockReturnValue({ CONTENT_MODE: 'sanity' })
    vi.stubEnv('FEEDBACK_DB_PATH', '')
    expect(await getHelpfulnessState(new Request('https://help.test'), article._id, 'en')).toMatchObject({ enabled: false, demo: false })
    await expectFailure(await submitHelpfulness(post(), 'en', 'guide'), 503, 'unavailable')
    expect(existsSync(config.path)).toBe(false)
    expect(mocks.getArticle).not.toHaveBeenCalled()
  })

  it.each(['configuration', 'database'])('contains %s failures without crashing a page or leaking errors', async (kind) => {
    if (kind === 'configuration') mocks.getEnv.mockImplementation(() => { throw new Error('secret-provider-token') })
    else vi.stubEnv('FEEDBACK_DB_PATH', directory)
    expect(await getHelpfulnessState(new Request('https://help.test'), article._id, 'en')).toMatchObject({ enabled: false, vote: null, reason: '' })
    await expectFailure(await submitHelpfulness(post(), 'en', 'guide'), 503, 'unavailable')
    expect(mocks.getArticle).not.toHaveBeenCalled()
  })
})

describe('helpfulness POST boundary', () => {
  it('persists only approved data, returns JSON, and issues a secure cookie only after success', async () => {
    const response = await submitHelpfulness(post('vote=no&reason=unclear&website=', {
      headers: { 'User-Agent': 'private-agent', 'X-Forwarded-For': '192.0.2.1', 'Sec-Fetch-Site': 'same-origin' },
    }), 'en', 'guide')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, vote: 'no', reason: 'unclear' })
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(response.headers.get('Content-Type')).toBe('application/json; charset=utf-8')
    const cookie = response.headers.get('Set-Cookie')!
    expect(cookie).toMatch(/^mw_helpfulness=[0-9a-f]{64}; Max-Age=2592000; Path=\/; HttpOnly; SameSite=Lax; Secure$/)
    const rawToken = cookie.split(';')[0].split('=')[1]
    const rows = inspect('SELECT * FROM helpfulness_votes')
    expect(rows).toEqual([{ source: 'demo', article_id: article._id, locale: 'en', visitor_hash: createHash('sha256').update(rawToken).digest('hex'), vote: 'no', reason: 'unclear', updated_at: expect.any(Number) }])
    for (const privateValue of [rawToken, 'private-agent', '192.0.2.1', 'private-query']) {
      expect(readFileSync(config.path).includes(Buffer.from(privateValue))).toBe(false)
    }
    expect(mocks.getArticle).toHaveBeenCalledWith('en', 'guide')
    const state = await getHelpfulnessState(new Request('https://help.test', { headers: { Cookie: cookie.split(';')[0] } }), article._id, 'en')
    expect(state.vote).toBe('no')
    expect(state.headers.has('Set-Cookie')).toBe(false)
  })

  it('updates an existing browser vote without adding a row or renewing its cookie; yes clears reason', async () => {
    const options = { headers: { Cookie: `mw_helpfulness=${token}` } }
    await submitHelpfulness(post('vote=no&reason=outdated', options), 'en', 'guide')
    const response = await submitHelpfulness(post('vote=yes&reason=other', options), 'en', 'guide')
    expect(await response.json()).toEqual({ ok: true, vote: 'yes', reason: '' })
    expect(response.headers.has('Set-Cookie')).toBe(false)
    expect(inspect('SELECT vote, reason FROM helpfulness_votes')).toEqual([{ vote: 'yes', reason: '' }])
  })

  it.each(['', 'unclear', 'missing', 'outdated', 'other'])('accepts the optional no reason %j', async (reason) => {
    const response = await submitHelpfulness(post(`vote=no&reason=${reason}`), 'en', 'guide')
    expect(await response.json()).toEqual({ ok: true, vote: 'no', reason })
  })

  it('does not mark an HTTP cookie Secure and replaces an invalid cookie only after success', async () => {
    const request = new Request('http://help.test/en/articles/guide', { method: 'POST', headers: { Origin: 'http://help.test', 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', Cookie: 'mw_helpfulness=invalid' }, body: 'vote=yes' })
    const response = await submitHelpfulness(request, 'en', 'guide')
    expect(response.status).toBe(200)
    expect(response.headers.get('Set-Cookie')).toMatch(/HttpOnly; SameSite=Lax$/)
  })

  it.each(['GET', 'PUT', 'DELETE', 'HEAD'])('rejects %s with Allow POST', async (method) => {
    const response = await submitHelpfulness(new Request('https://help.test', { method }), 'en', 'guide')
    await expectFailure(response, 405, 'invalid')
    expect(response.headers.get('Allow')).toBe('POST')
    expect(mocks.getArticle).not.toHaveBeenCalled()
  })

  it.each([null, 'null', 'https://evil.test', 'http://help.test', 'https://help.test.evil.test', 'https://help.test/'])('rejects Origin %j', async (origin) => {
    const request = post()
    if (origin === null) request.headers.delete('Origin')
    else request.headers.set('Origin', origin)
    await expectFailure(await submitHelpfulness(request, 'en', 'guide'), 403, 'forbidden')
    expect(mocks.getArticle).not.toHaveBeenCalled()
    expect(existsSync(config.path)).toBe(false)
  })

  it('rejects cross-site fetches even with a matching Origin', async () => {
    await expectFailure(await submitHelpfulness(post('vote=yes', { headers: { 'Sec-Fetch-Site': 'cross-site' } }), 'en', 'guide'), 403, 'forbidden')
    expect(mocks.getArticle).not.toHaveBeenCalled()
  })

  it('rejects null Origin even when the request URL also has an opaque origin', async () => {
    const request = new Request('file:///help/guide', { method: 'POST', headers: { Origin: 'null', 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'vote=yes' })
    await expectFailure(await submitHelpfulness(request, 'en', 'guide'), 403, 'forbidden')
    expect(mocks.getArticle).not.toHaveBeenCalled()
    expect(existsSync(config.path)).toBe(false)
  })

  it.each(['application/json', 'multipart/form-data', 'text/plain', '', 'application/x-www-form-urlencoded; charset=iso-8859-1'])('rejects content type %j', async (type) => {
    await expectFailure(await submitHelpfulness(post('vote=yes', { headers: { 'Content-Type': type } }), 'en', 'guide'), 415, 'invalid')
    expect(mocks.getArticle).not.toHaveBeenCalled()
  })

  it.each([
    '', 'vote=', 'vote=YES', 'vote=%20yes', 'vote=yes&vote=no', 'vote=yes&%76ote=yes',
    'vote=no&reason=missing&reason=other', 'vote=yes&website=&website=', 'vote=yes&website=bot',
    'vote=yes&website=%20', 'vote=yes&articleId=forged', 'vote=yes&email=private', 'vote=no&reason=free-text',
    'vote=yes&reason=free-text', 'vote=yes&unknown=', 'reason=missing', 'vote=no&reason=Missing',
  ])('rejects invalid form %j before content resolution', async (body) => {
    await expectFailure(await submitHelpfulness(post(body), 'en', 'guide'), 400, 'invalid')
    expect(mocks.getArticle).not.toHaveBeenCalled()
    expect(existsSync(config.path)).toBe(false)
  })

  it('prechecks Content-Length and cancels the body', async () => {
    const cancel = vi.fn()
    const request = post(new ReadableStream({ cancel }), { duplex: 'half', headers: { 'Content-Length': '2049' } })
    await expectFailure(await submitHelpfulness(request, 'en', 'guide'), 413, 'tooLarge')
    expect(cancel).toHaveBeenCalled()
    expect(mocks.getArticle).not.toHaveBeenCalled()
  })

  it.each(['-1', 'garbage', '1.5', '2048, 2048'])('rejects malformed Content-Length %s', async (length) => {
    await expectFailure(await submitHelpfulness(post('vote=yes', { headers: { 'Content-Length': length } }), 'en', 'guide'), 400, 'invalid')
  })

  it.each([undefined, '8'])('bounds streamed bytes even with absent/understated length %j', async (length) => {
    let chunk = 0
    const cancel = vi.fn()
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) { controller.enqueue(new TextEncoder().encode(chunk++ === 0 ? 'vote=yes&' : '&'.repeat(1024))) }, cancel,
    })
    const response = await submitHelpfulness(post(stream, { duplex: 'half', headers: length ? { 'Content-Length': length } : {} }), 'en', 'guide')
    await expectFailure(response, 413, 'tooLarge')
    expect(cancel).toHaveBeenCalled()
    expect(chunk).toBeLessThanOrEqual(4)
    expect(mocks.getArticle).not.toHaveBeenCalled()
  })

  it('accepts exactly 2048 bytes, but counts UTF-8 bytes rather than characters', async () => {
    expect((await submitHelpfulness(post('vote=yes' + '&'.repeat(2040)), 'en', 'guide')).status).toBe(200)
    await expectFailure(await submitHelpfulness(post('vote=yes&website=' + 'あ'.repeat(700)), 'en', 'guide'), 413, 'tooLarge')
  })

  it('handles broken streams and invalid UTF-8 without leaking errors', async () => {
    const stream = new ReadableStream({ start(controller) { controller.error(new Error('secret-stream-details')) } })
    await expectFailure(await submitHelpfulness(post(stream, { duplex: 'half' }), 'en', 'guide'), 400, 'invalid')
    await expectFailure(await submitHelpfulness(post(new Uint8Array([0xff])), 'en', 'guide'), 400, 'invalid')
  })

  it.each([null, { ...article, _id: 'drafts.guide' }, { ...article, _id: 'versions.release.guide' }, { ...article, _id: '' }, { ...article, language: 'ja' }, { ...article, slug: 'different' }])('returns 404 for unpublished/wrong articles: %j', async (value) => {
    mocks.getArticle.mockResolvedValue(value)
    await expectFailure(await submitHelpfulness(post(), 'en', 'guide'), 404, 'notFound')
    expect(inspect('SELECT * FROM helpfulness_votes')).toEqual([])
    expect(inspect('SELECT * FROM helpfulness_rate_events')).toEqual([])
  })

  it('rejects unsupported locales and resolves Japanese articles server-side', async () => {
    await expectFailure(await submitHelpfulness(post(), 'fr' as Locale, 'guide'), 404, 'notFound')
    expect(mocks.getArticle).not.toHaveBeenCalled()
    mocks.getArticle.mockResolvedValue({ ...article, language: 'ja' })
    expect((await submitHelpfulness(post(), 'ja', 'guide')).status).toBe(200)
    expect(mocks.getArticle).toHaveBeenCalledWith('ja', 'guide')
    expect(inspect('SELECT locale FROM helpfulness_votes')).toEqual([{ locale: 'ja' }])
  })

  it('returns safe 503 for provider and corrupt database failures', async () => {
    mocks.getArticle.mockRejectedValue(new Error('private-provider-url-and-token'))
    await expectFailure(await submitHelpfulness(post(), 'en', 'guide'), 503, 'unavailable')
    expect(inspect('SELECT * FROM helpfulness_votes')).toEqual([])
    writeFileSync(config.path, 'not a SQLite database')
    await expectFailure(await submitHelpfulness(post(), 'en', 'guide'), 503, 'unavailable')
    expect((await getHelpfulnessState(new Request('https://help.test'), article._id, 'en')).enabled).toBe(false)
  })

  it('never sets a cookie on a failed write after successful content resolution', async () => {
    mocks.getArticle.mockImplementation(async () => {
      execute("CREATE TRIGGER fail_vote BEFORE INSERT ON helpfulness_votes BEGIN SELECT RAISE(ABORT, 'secret-db-error'); END")
      return article
    })
    await expectFailure(await submitHelpfulness(post(), 'en', 'guide'), 503, 'unavailable')
    expect(inspect('SELECT * FROM helpfulness_rate_events')).toEqual([])
  })

  it('limits a browser to ten accepted votes per rolling minute', async () => {
    for (let index = 0; index < 10; index++) {
      expect((await submitHelpfulness(post('vote=yes', { headers: { Cookie: `mw_helpfulness=${token}`, 'X-Forwarded-For': `192.0.2.${index}` } }), 'en', 'guide')).status).toBe(200)
    }
    const response = await submitHelpfulness(post('vote=no', { headers: { Cookie: `mw_helpfulness=${token}` } }), 'en', 'guide')
    await expectFailure(response, 429, 'rateLimited')
    expect(response.headers.get('Retry-After')).toBe('60')
    expect(inspect('SELECT vote FROM helpfulness_votes')).toEqual([{ vote: 'yes' }])
  })

  it('counts first-time/no-cookie browsers globally, including the initial vote', async () => {
    for (let index = 0; index < 100; index++) expect((await submitHelpfulness(post(), 'en', 'guide')).status).toBe(200)
    const response = await submitHelpfulness(post(), 'en', 'guide')
    await expectFailure(response, 429, 'rateLimited')
    expect(response.headers.get('Retry-After')).toBe('60')
    expect(inspect('SELECT COUNT(*) AS count FROM helpfulness_votes')).toEqual([{ count: 100 }])
    expect(inspect('SELECT COUNT(*) AS count FROM helpfulness_rate_events')).toEqual([{ count: 100 }])
  })
})

describe('SQLite durability, privacy, expiry and atomicity', () => {
  it('persists across reopen, updates rather than accumulates, and isolates source/locale/article/visitor', () => {
    writeHelpfulnessVote(config, key, { vote: 'no', reason: 'missing' }, epoch)
    expect(readHelpfulnessVote(config, key, epoch)).toEqual({ vote: 'no', reason: 'missing' })
    writeHelpfulnessVote(config, key, { vote: 'yes', reason: 'other' }, epoch + 1)
    expect(inspect('SELECT vote, reason, updated_at FROM helpfulness_votes')).toEqual([{ vote: 'yes', reason: '', updated_at: epoch + 1 }])
    const variants: Array<[HelpfulnessStoreConfig, HelpfulnessKey]> = [
      [{ ...config, source: 'sanity' }, key], [config, { ...key, locale: 'ja' }],
      [config, { ...key, articleId: 'another' }], [config, { ...key, visitorHash: 'b'.repeat(64) }],
    ]
    for (const [store, variant] of variants) {
      expect(readHelpfulnessVote(store, variant, epoch + 2)).toBeNull()
      writeHelpfulnessVote(store, variant, { vote: 'no', reason: 'unclear' }, epoch + 2)
      expect(readHelpfulnessVote(store, variant, epoch + 2)).toEqual({ vote: 'no', reason: 'unclear' })
    }
    expect(readHelpfulnessVote(config, key, epoch + 2)).toEqual({ vote: 'yes', reason: '' })
    expect(inspect('SELECT COUNT(*) AS count FROM helpfulness_votes')).toEqual([{ count: 5 }])
  })

  it('creates private directories/database and retains WAL mode', () => {
    readHelpfulnessVote(config, null)
    if (process.platform !== 'win32') {
      expect(statSync(join(directory, 'private')).mode & 0o777).toBe(0o700)
      expect(statSync(config.path).mode & 0o777).toBe(0o600)
    }
    expect(inspect('PRAGMA journal_mode')).toEqual([{ journal_mode: 'wal' }])
  })

  it('hides expired votes on reads and deletes old votes and short-lived counters on writes', () => {
    writeHelpfulnessVote(config, key, { vote: 'yes', reason: '' }, epoch)
    expect(readHelpfulnessVote(config, key, epoch + retention - 1)?.vote).toBe('yes')
    expect(readHelpfulnessVote(config, key, epoch + retention)).toBeNull()
    expect(inspect('SELECT COUNT(*) AS count FROM helpfulness_votes')).toEqual([{ count: 1 }])
    writeHelpfulnessVote({ ...config, source: 'sanity' }, { ...key, visitorHash: 'b'.repeat(64) }, { vote: 'no', reason: '' }, epoch + retention)
    expect(inspect('SELECT source FROM helpfulness_votes')).toEqual([{ source: 'sanity' }])
    expect(inspect('SELECT submitted_at FROM helpfulness_rate_events')).toEqual([{ submitted_at: epoch + retention }])
  })

  it('uses rolling rather than calendar-minute limits and expires events at 60 seconds', () => {
    for (let index = 0; index < 10; index++) expect(writeHelpfulnessVote(config, key, { vote: 'yes', reason: '' }, epoch + 59_999)).toBe('saved')
    expect(writeHelpfulnessVote(config, key, { vote: 'no', reason: '' }, epoch + 60_000)).toBe('rateLimited')
    expect(writeHelpfulnessVote(config, key, { vote: 'no', reason: '' }, epoch + 119_998)).toBe('rateLimited')
    expect(inspect('SELECT COUNT(*) AS count FROM helpfulness_rate_events')).toEqual([{ count: 10 }])
    expect(writeHelpfulnessVote(config, key, { vote: 'no', reason: '' }, epoch + 119_999)).toBe('saved')
    expect(inspect('SELECT COUNT(*) AS count FROM helpfulness_rate_events')).toEqual([{ count: 1 }])
  })

  it('shares the browser limiter across articles/locales/sources in the same database', () => {
    for (let index = 0; index < 10; index++) writeHelpfulnessVote(config, { ...key, articleId: `guide-${index}` }, { vote: 'yes', reason: '' }, epoch)
    expect(writeHelpfulnessVote({ ...config, source: 'sanity' }, { ...key, locale: 'ja' }, { vote: 'no', reason: '' }, epoch)).toBe('rateLimited')
  })

  it('rolls back rate accounting and pruning if vote persistence fails, then closes the connection', () => {
    writeHelpfulnessVote(config, key, { vote: 'yes', reason: '' }, epoch)
    execute("CREATE TRIGGER fail_vote BEFORE INSERT ON helpfulness_votes BEGIN SELECT RAISE(ABORT, 'test failure'); END")
    expect(() => writeHelpfulnessVote(config, key, { vote: 'no', reason: 'other' }, epoch + retention)).toThrow()
    expect(inspect('SELECT vote, updated_at FROM helpfulness_votes')).toEqual([{ vote: 'yes', updated_at: epoch }])
    expect(inspect('SELECT submitted_at FROM helpfulness_rate_events')).toEqual([{ submitted_at: epoch }])
    execute('DROP TRIGGER fail_vote')
    expect(writeHelpfulnessVote(config, key, { vote: 'no', reason: '' }, epoch + retention)).toBe('saved')
  })

  it.each([{ sameBrowser: true, expected: 10, attempts: 8 }, { sameBrowser: false, expected: 100, attempts: 30 }])('enforces atomic limits across concurrent connections: %j', async ({ sameBrowser, expected, attempts }) => {
    // Compile just the owned store in memory: workers run native SQLite without
    // importing content, configuration, application routes, or any CMS client.
    const compiled = ts.transpileModule(readFileSync(new URL('../app/lib/helpfulness-store.server.ts', import.meta.url), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText
    const settled = await Promise.allSettled(Array.from({ length: 4 }, (_, workerIndex) => new Promise<string[]>((accept, reject) => {
      const worker = new Worker(`${compiled}
        const { parentPort, workerData } = require('node:worker_threads');
        const results = [];
        for (let i = 0; i < workerData.attempts; i++) {
          const hash = workerData.sameBrowser ? 'a'.repeat(64) : String(workerData.workerIndex * 100 + i).padStart(64, '0');
          results.push(writeHelpfulnessVote(workerData.config, { articleId: 'guide', locale: 'en', visitorHash: hash }, { vote: 'yes', reason: '' }, workerData.epoch));
        }
        parentPort.postMessage(results);
      `, { eval: true, workerData: { config, epoch, sameBrowser, attempts, workerIndex } })
      let values: string[] | undefined
      worker.once('message', (message: string[]) => { values = message })
      worker.once('error', reject)
      worker.once('exit', (code) => code === 0 && values ? accept(values) : reject(new Error('SQLite worker failed')))
    })))
    const results = settled.map((result) => {
      if (result.status === 'rejected') throw result.reason
      return result.value
    })
    expect(results.flat().filter((result) => result === 'saved')).toHaveLength(expected)
    expect(results.flat().filter((result) => result === 'rateLimited')).toHaveLength(4 * attempts - expected)
    expect(inspect('SELECT COUNT(*) AS count FROM helpfulness_rate_events')).toEqual([{ count: expected }])
    expect(inspect('SELECT COUNT(*) AS count FROM helpfulness_votes')).toEqual([{ count: sameBrowser ? 1 : expected }])
  }, 20_000)
})