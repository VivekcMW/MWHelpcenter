import { describe, expect, it } from 'vitest'
import { safeHref, sanityFileUrl, sanityImageUrl } from '../app/lib/security/urls'
import { parseEnv } from '../app/lib/env.server'

describe('safe content URLs', () => {
  it.each(['javascript:alert(1)', 'data:text/html,test', '//evil.test', '\\evil.test', 'java\nscript:alert(1)', ' https://example.com'])('rejects %s', (url) => {
    expect(safeHref(url)).toBeUndefined()
  })
  it.each(['/en/articles/test', '#section-test', 'https://example.com', 'mailto:help@example.com'])('accepts %s', (url) => {
    expect(safeHref(url)).toBe(url)
  })
  it('allows images only from the managed Sanity image CDN', () => {
    expect(sanityImageUrl('https://evil.test/image.png')).toBeUndefined()
    expect(sanityImageUrl('http://cdn.sanity.io/images/id/test.png')).toBeUndefined()
    expect(sanityImageUrl('https://cdn.sanity.io/images/id/test.png')).toContain('w=1200')
  })
  it('allows files only from the managed Sanity file CDN and can force downloads', () => {
    expect(sanityFileUrl('https://evil.test/files/project/id/video.mp4')).toBeUndefined()
    expect(sanityFileUrl('http://cdn.sanity.io/files/project/id/video.mp4')).toBeUndefined()
    expect(sanityFileUrl('https://cdn.sanity.io/images/project/id/video.mp4')).toBeUndefined()
    expect(sanityFileUrl('https://cdn.sanity.io/files/project/id/video.mp4?secret=value#fragment')).toBe('https://cdn.sanity.io/files/project/id/video.mp4')
    expect(sanityFileUrl('https://cdn.sanity.io/files/project/id/guide.pdf', true)).toBe('https://cdn.sanity.io/files/project/id/guide.pdf?dl=')
  })
})

describe('server configuration', () => {
  it('has an explicit demo default', () => { expect(parseEnv({}).CONTENT_MODE).toBe('demo') })
  it('requires a real project ID in Sanity mode', () => {
    expect(() => parseEnv({ CONTENT_MODE: 'sanity' })).toThrow('SANITY_PROJECT_ID')
  })
  it.each(['javascript:alert(1)', 'https://user:secret@example.com', 'https://example.com/path', 'https://example.com/?secret=test'])('rejects unsafe site origin %s', (SITE_URL) => {
    expect(() => parseEnv({ SITE_URL })).toThrow('SITE_URL')
  })
  it('does not leak secret values in configuration errors', () => {
    expect(() => parseEnv({ SUPPORT_EMAIL: 'sensitive-invalid-value' })).toThrow('Invalid configuration: SUPPORT_EMAIL')
  })
})