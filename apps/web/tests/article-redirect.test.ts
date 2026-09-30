import {beforeEach, describe, expect, it, vi} from 'vitest'
import {REDIRECT_QUERY} from '@mw/content/queries'

const cms = vi.hoisted(() => ({fetch: vi.fn(), mode: 'sanity'}))
vi.mock('../app/lib/env.server', () => ({getEnv: () => ({CONTENT_MODE: cms.mode})}))
vi.mock('../app/lib/sanity/client.server', () => ({getPublishedClient: () => ({fetch: cms.fetch})}))

import {getArticleRedirect} from '../app/lib/content.server'

beforeEach(() => {
  cms.mode = 'sanity'
  cms.fetch.mockReset()
})

describe('published article redirects', () => {
  it('looks up the exact locale/path and accepts a safe local destination', async () => {
    cms.fetch.mockResolvedValue({from: '/en/articles/legacy-guide', to: '/en/articles/current-guide', statusCode: 301, language: 'en'})

    await expect(getArticleRedirect('en', '/en/articles/legacy-guide')).resolves.toEqual({
      from: '/en/articles/legacy-guide', to: '/en/articles/current-guide', statusCode: 301, language: 'en',
    })
    expect(cms.fetch).toHaveBeenCalledWith(REDIRECT_QUERY, {language: 'en', from: '/en/articles/legacy-guide'})
  })

  it.each(['https://evil.test', '//evil.test', '/en/articles/next?secret=1', '/en/articles/next#part', '/en/articles/next\\evil'])('rejects unsafe redirect target %s', async (to) => {
    cms.fetch.mockResolvedValue({from: '/en/articles/legacy', to, statusCode: 301, language: 'en'})
    await expect(getArticleRedirect('en', '/en/articles/legacy')).resolves.toBeNull()
  })

  it('rejects a language mismatch or unsupported status code', async () => {
    cms.fetch.mockResolvedValue({from: '/en/articles/legacy', to: '/en/articles/current', statusCode: 300, language: 'ja'})
    await expect(getArticleRedirect('en', '/en/articles/legacy')).resolves.toBeNull()
  })

  it('does not query Sanity for demo content', async () => {
    cms.mode = 'demo'
    await expect(getArticleRedirect('en', '/en/articles/legacy')).resolves.toBeNull()
    expect(cms.fetch).not.toHaveBeenCalled()
  })
})
