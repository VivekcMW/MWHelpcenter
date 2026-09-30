import { createInstance } from 'i18next'
import { defaultLocale, locales, type Locale } from './config'
import common from './locales/en/common.json'
import navigation from './locales/en/navigation.json'
import search from './locales/en/search.json'
import japaneseCommon from './locales/ja/common.json'
import japaneseNavigation from './locales/ja/navigation.json'
import japaneseSearch from './locales/ja/search.json'
import feedback from './locales/en/feedback.json'
import japaneseFeedback from './locales/ja/feedback.json'

// A fresh, synchronous instance per rendered tree: never mutate a server singleton.
// Bundled resources keep SSR and hydration identical; add lazy locale bundles as needed.
export function createI18n(locale: Locale) {
  const instance = createInstance()
  void instance.init({
    lng: locale,
    fallbackLng: defaultLocale,
    supportedLngs: locales.map((item) => item.code),
    resources: structuredClone({
      en: { common, navigation, search, feedback },
      ja: { common: japaneseCommon, navigation: japaneseNavigation, search: japaneseSearch, feedback: japaneseFeedback },
    }),
    ns: ['common', 'navigation', 'search', 'feedback'],
    defaultNS: 'common',
    initAsync: false,
    interpolation: { escapeValue: false }, // React escapes text.
    react: { useSuspense: false },
  })
  return instance
}