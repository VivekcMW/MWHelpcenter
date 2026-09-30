import { describe, expect, test } from 'vitest'
import { createI18n } from '../app/i18n/instance'
import { formatDate, isLocale, localeFromPath, localePath, requireLocale } from '../app/i18n/config'

describe('internationalization foundation', () => {
  test('initializes translated resources synchronously for SSR', () => {
    const i18n = createI18n('en')
    expect(i18n.isInitialized).toBe(true)
    expect(i18n.t('siteTitle')).toBe('Moving Walls Help Center')
    expect(i18n.t('label', { ns: 'search' })).toBe('Search help articles')
    expect(i18n.t('loading', { ns: 'navigation' })).toBe('Loading page…')
    expect(i18n.t('articleCount', { count: 1 })).toBe('1 guide')
    expect(i18n.t('articleCount', { count: 2 })).toBe('2 guides')
  })
  test('isolates instances and resource mutation between render trees', () => {
    const first = createI18n('en')
    const second = createI18n('en')
    expect(first).not.toBe(second)
    first.addResource('en', 'common', 'private-test-key', 'private')
    expect(second.exists('private-test-key')).toBe(false)
  })
  test('accepts only enabled locales', () => {
    expect(isLocale('en')).toBe(true)
    expect(isLocale('ja')).toBe(true)
    expect(isLocale('fr')).toBe(false)
    expect(isLocale(undefined)).toBe(false)
    try { requireLocale('fr'); throw new Error('Expected locale rejection') } catch (error) {
      expect(error).toBeInstanceOf(Response)
      expect((error as Response).status).toBe(404)
    }
  })
  test('creates localized URLs and timezone-stable editorial dates', () => {
    expect(localePath('en')).toBe('/en')
    expect(localePath('en', '/articles/test')).toBe('/en/articles/test')
    expect(formatDate('2026-09-29T00:00:00Z', 'en')).toContain('29')
    expect(formatDate('invalid', 'en')).toBe('')
    expect(localePath('ja', 'articles/test')).toBe('/ja/articles/test')
    expect(formatDate('2026-09-29T00:00:00Z', 'ja')).toBe('2026年9月29日')
    expect(localeFromPath('/ja/missing')).toBe('ja')
    expect(localeFromPath('/fr')).toBe('en')
    expect(localeFromPath('/')).toBe('en')
  })
  test('renders Japanese resources synchronously with Japanese count rules', () => {
    const i18n = createI18n('ja')
    expect(i18n.isInitialized).toBe(true)
    expect(i18n.t('siteTitle')).toBe('Moving Walls ヘルプセンター')
    for (const count of [0, 1, 2]) expect(i18n.t('articleCount', { count })).toBe(`${count} 件のガイド`)
    expect(createI18n('en').t('siteTitle')).toBe('Moving Walls Help Center')
  })
  test('keeps all Japanese keys and interpolation placeholders aligned with English', () => {
    const i18n = createI18n('ja')
    function flatten(value: Record<string, unknown>, prefix = ''): Record<string, string> {
      return Object.fromEntries(Object.entries(value).flatMap(([key, item]) => {
        const fullKey = `${prefix}${key}`
        return typeof item === 'string' ? [[fullKey, item]] : Object.entries(flatten(item as Record<string, unknown>, `${fullKey}.`))
      }))
    }
    for (const namespace of ['common', 'navigation', 'search', 'feedback']) {
      const en = flatten(i18n.getResourceBundle('en', namespace))
      const ja = flatten(i18n.getResourceBundle('ja', namespace))
      expect(Object.keys(ja).sort()).toEqual(Object.keys(en).sort())
      for (const key of Object.keys(en)) {
        expect(ja[key].trim()).not.toBe('')
        expect(ja[key].match(/{{.*?}}/g)?.sort()).toEqual(en[key].match(/{{.*?}}/g)?.sort())
      }
    }
  })
})