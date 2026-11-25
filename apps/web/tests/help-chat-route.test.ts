import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActionFunctionArgs } from 'react-router'
import { action } from '../app/routes/resources/chat-search'

const content = vi.hoisted(() => ({getSearchCatalog: vi.fn()}))
vi.mock('../app/lib/content.server', () => content)

function request(body: string, headers: HeadersInit = {}): ActionFunctionArgs {
  const url = new URL('https://help.test/en/chat-search')
  return {
    url, params: {locale: 'en'}, context: {}, pattern: '/:locale/chat-search',
    request: new Request(url, {method: 'POST', headers: {origin: url.origin, 'content-type': 'application/x-www-form-urlencoded', ...headers}, body}),
  }
}

beforeEach(() => {
  content.getSearchCatalog.mockReset()
})

describe('help chat search endpoint', () => {
  it('returns at most three matching published guide summaries without article bodies', async () => {
    content.getSearchCatalog.mockResolvedValue({articles: [
      ...['one', 'two', 'three', 'four'].map((id) => ({_id: id, slug: id, title: `Inventory ${id}`, summary: 'Setup guide', language: 'en', productSlugs: ['inventory'], contentType: 'guide', body: [{_type: 'block', children: [{_type: 'span', text: 'Private-looking body'}]}]})),
      {_id: 'drafts.secret', slug: 'secret', title: 'Inventory secret', summary: 'Draft', language: 'en', productSlugs: [], contentType: 'guide'},
      {_id: 'ja', slug: 'ja', title: 'Inventory', summary: 'Japanese', language: 'ja', productSlugs: [], contentType: 'guide'},
    ]})
    const response = await action(request('query=inventory'))
    const data = await response.json()
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(data.results).toHaveLength(3)
    expect(data.results.every((item: object) => Object.keys(item).sort().join(',') === 'slug,summary,title')).toBe(true)
    expect(JSON.stringify(data)).not.toContain('Private-looking body')
    expect(content.getSearchCatalog).toHaveBeenCalledExactlyOnceWith('en')
  })

  it.each([
    ['query=', {}],
    [`query=${'a'.repeat(201)}`, {}],
    ['query=one&query=two', {}],
    ['query=one&other=two', {}],
    ['query=one', {origin: 'https://other.test'}],
    ['query=one', {'content-type': 'application/json'}],
    ['query=one', {'content-length': '3000'}],
    [`query=${'a'.repeat(2050)}`, {}],
  ])('rejects invalid requests without fetching the catalog', async (body, headers) => {
    const response = await action(request(body, headers))
    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(content.getSearchCatalog).not.toHaveBeenCalled()
  })

  it('surfaces content service failures without exposing internal details', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    content.getSearchCatalog.mockRejectedValue(new Error('private upstream details'))
    const response = await action(request('query=inventory'))
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ok: false, error: 'unavailable'})
    expect(log).toHaveBeenCalled()
    log.mockRestore()
  })
})
