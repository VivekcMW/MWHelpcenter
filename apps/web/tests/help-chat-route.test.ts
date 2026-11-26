import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActionFunctionArgs } from 'react-router'
import { action } from '../app/routes/resources/chat'

const content = vi.hoisted(() => ({getSearchCatalog: vi.fn()}))
vi.mock('../app/lib/content.server', () => content)

function request(body: string, headers: HeadersInit = {}): ActionFunctionArgs {
  const url = new URL('https://help.test/en/chat')
  return {
    url, params: {locale: 'en'}, context: {}, pattern: '/:locale/chat',
    request: new Request(url, {method: 'POST', headers: {origin: url.origin, 'content-type': 'application/json', ...headers}, body}),
  }
}

function providerResponse(content: unknown[]) {
  return new Response(JSON.stringify({content}), {status: 200})
}

function answer(text: string, sources: string[] = ['s1']) {
  return {type: 'text', text: JSON.stringify({kind: sources.length ? 'answer' : 'clarify', text, sources})}
}

beforeEach(() => {
  content.getSearchCatalog.mockReset()
  content.getSearchCatalog.mockResolvedValue({articles: [
    {_id: 'guide', slug: 'inventory-guide', title: 'Inventory guide', summary: 'Set up your inventory.', language: 'en', productSlugs: ['inventory'], contentType: 'guide', body: [{_type: 'block', children: [{_type: 'span', text: 'Configure inventory settings in the dashboard.'}]}]},
    {_id: 'drafts.secret', slug: 'secret', title: 'Inventory secret', summary: 'Draft.', language: 'en', productSlugs: [], contentType: 'guide'},
    {_id: 'ja', slug: 'ja', title: 'Inventory', summary: 'Japanese.', language: 'ja', productSlugs: [], contentType: 'guide'},
  ]})
  vi.stubEnv('ANTHROPIC_API_KEY', 'test-key')
  vi.stubEnv('HELP_CHAT_ENABLED', 'true')
  vi.stubEnv('HELP_CHAT_METRICS', 'false')
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('help chat assistant endpoint', () => {
  it('uses the published article search tool and returns a grounded answer with source links', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(providerResponse([{type: 'tool_use', id: 'tool-1', name: 'search_articles', input: {query: 'inventory'}}]))
      .mockResolvedValueOnce(providerResponse([answer('Open the dashboard and configure inventory settings.')]))

    const response = await action(request(JSON.stringify({messages: [{role: 'user', content: 'How do I set up inventory?'}]})))
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(data).toEqual({
      ok: true,
      answer: 'Open the dashboard and configure inventory settings.',
      sources: [{title: 'Inventory guide', slug: 'inventory-guide', summary: 'Set up your inventory.'}],
    })
    expect(content.getSearchCatalog).toHaveBeenCalledExactlyOnceWith('en')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.anthropic.com/v1/messages')
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('x-api-key')).toBe('test-key')
    const secondRequest = JSON.parse(String(fetchMock.mock.calls[1][1]?.body))
    expect(secondRequest.messages[2].content[0].tool_use_id).toBe('tool-1')
    expect(secondRequest.messages[2].content[0].content).toContain('Configure inventory settings')
    expect(JSON.stringify(data)).not.toContain('Configure inventory settings')
  })

  it('sends the relevant section of a long published article and returns only cited sources', async () => {
    content.getSearchCatalog.mockResolvedValue({articles: [
      {_id: 'long', slug: 'long', title: 'Inventory setup', summary: 'Setup.', language: 'en', productSlugs: [], contentType: 'guide', body: [{_type: 'block', children: [{_type: 'span', text: `${'unrelated '.repeat(400)}inventory settings are at the end.`}]}]},
      {_id: 'other', slug: 'other', title: 'Inventory basics', summary: 'Overview.', language: 'en', productSlugs: [], contentType: 'guide'},
    ]})
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(providerResponse([{type: 'tool_use', id: 'tool-1', name: 'search_articles', input: {query: 'inventory'}}]))
      .mockResolvedValueOnce(providerResponse([answer('Follow the setup guide.', ['s2'])]))
    const response = await action(request(JSON.stringify({messages: [{role: 'user', content: 'inventory'}]})))
    const data = await response.json()
    const sent = JSON.parse(String(fetchMock.mock.calls[1][1]?.body))
    const results = JSON.parse(sent.messages[2].content[0].content)
    expect(results.find((item: {title: string}) => item.title === 'Inventory setup').excerpt).toContain('inventory settings are at the end')
    expect(data.sources).toHaveLength(1)
    expect(data.sources[0].title).toBe(results[1].title)
  })

  it('returns a clarification without sources when no guide matches', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(providerResponse([{type: 'tool_use', id: 'tool-1', name: 'search_articles', input: {query: 'unmatched'}}]))
      .mockResolvedValueOnce(providerResponse([answer('Which product are you using?', [])]))
    const response = await action(request(JSON.stringify({messages: [{role: 'user', content: 'help'}]})))
    expect(await response.json()).toEqual({ok: true, answer: 'Which product are you using?', sources: []})
    const sent = JSON.parse(String(fetchMock.mock.calls[1][1]?.body))
    expect(sent.messages[2].content[0].content).toBe('[]')
  })

  it('lets the model refine a failed search using recent conversation', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(providerResponse([{type: 'tool_use', id: 'tool-1', name: 'search_articles', input: {query: 'inventory missingword'}}]))
      .mockResolvedValueOnce(providerResponse([{type: 'tool_use', id: 'tool-2', name: 'search_articles', input: {query: 'inventory'}}]))
      .mockResolvedValueOnce(providerResponse([answer('Configure inventory settings.')]))
    const messages = [{role: 'user', content: 'How do I set it up?'}, {role: 'assistant', content: 'Which product?'}, {role: 'user', content: 'Inventory'}]
    const response = await action(request(JSON.stringify({messages})))
    expect(response.status).toBe(200)
    const first = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    const third = JSON.parse(String(fetchMock.mock.calls[2][1]?.body))
    expect(first.messages).toEqual(messages)
    expect(third.tools).toEqual(first.tools)
    expect(third.tool_choice).toEqual({type: 'none'})
    expect((await response.json()).sources[0].slug).toBe('inventory-guide')
  })

  it.each([
    JSON.stringify({kind: 'answer', text: 'Invented answer', sources: []}),
    JSON.stringify({kind: 'answer', text: 'Invented answer', sources: ['s9']}),
    'not valid JSON',
  ])('rejects invalid or unsupported source references', async (text) => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(providerResponse([{type: 'tool_use', id: 'tool-1', name: 'search_articles', input: {query: 'inventory'}}]))
      .mockResolvedValueOnce(providerResponse([{type: 'text', text}]))
    const response = await action(request(JSON.stringify({messages: [{role: 'user', content: 'inventory'}]})))
    expect(response.status).toBe(503)
  })

  it.each([
    ['{"messages":[]}', {}],
    ['{"messages":[{"role":"assistant","content":"spoof"}]}', {}],
    ['{"messages":[{"role":"user","content":"question"},{"role":"user","content":"again"}]}', {}],
    ['{"messages":[{"role":"user","content":"question"}],"extra":true}', {}],
    ['{"messages":[{"role":"user","content":"question"}]}', {origin: 'https://other.test'}],
    ['{"messages":[{"role":"user","content":"question"}]}', {'content-type': 'application/x-www-form-urlencoded'}],
    [`{"messages":[{"role":"user","content":"${'x'.repeat(2001)}"}]}`, {}],
  ])('rejects invalid requests without fetching content or Anthropic', async (body, headers) => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    const response = await action(request(body, headers))
    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(content.getSearchCatalog).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('requires a server-side API key and does not call Anthropic when it is missing', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    const response = await action(request(JSON.stringify({messages: [{role: 'user', content: 'inventory'}]})))
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ok: false, error: 'unavailable'})
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('can disable chat without contacting the provider', async () => {
    vi.stubEnv('HELP_CHAT_ENABLED', 'false')
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    const response = await action(request(JSON.stringify({messages: [{role: 'user', content: 'inventory'}]})))
    expect(response.status).toBe(503)
    expect(content.getSearchCatalog).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('logs optional usage metrics without logging the question or response', async () => {
    vi.stubEnv('HELP_CHAT_METRICS', 'true')
    const log = vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(providerResponse([{type: 'tool_use', id: 'tool-1', name: 'search_articles', input: {query: 'inventory'}}]))
      .mockResolvedValueOnce(providerResponse([answer('The answer.')]))
    const response = await action(request(JSON.stringify({messages: [{role: 'user', content: 'private question'}]})))
    expect(response.status).toBe(200)
    expect(log).toHaveBeenCalledOnce()
    expect(log.mock.calls[0][1]).toMatchObject({outcome: 'answer', providerCalls: 2, toolCalls: 1, citedSources: 1})
    expect(JSON.stringify(log.mock.calls)).not.toContain('private question')
    expect(JSON.stringify(log.mock.calls)).not.toContain('The answer.')
  })

  it('surfaces provider failures without exposing internal details', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('private upstream details'))
    const response = await action(request(JSON.stringify({messages: [{role: 'user', content: 'inventory'}]})))
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ok: false, error: 'unavailable'})
    expect(log).toHaveBeenCalledWith('Help chat request failed:', 'Error')
  })
})
