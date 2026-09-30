import { getEnv } from '../../lib/env.server'
import { getCatalog } from '../../lib/content.server'
import { locales, localePath } from '../../i18n/config'

export function xmlEscape(value: string) {
  return value.replace(/[<>&"']/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[char]!)
}

export async function loader() {
  const env = getEnv()
  const paths: string[] = []
  if (env.CONTENT_MODE === 'sanity') {
    for (const locale of locales) {
      const catalog = await getCatalog(locale.code)
      paths.push(localePath(locale.code))
      for (const [kind, items] of [['products', catalog.products], ['collections', catalog.collections], ['articles', catalog.articles]] as const) {
        paths.push(...items.map((item) => localePath(locale.code, `${kind}/${encodeURIComponent(item.slug)}`)))
      }
    }
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map((path) => `<url><loc>${xmlEscape(new URL(path, env.SITE_URL).href)}</loc></url>`).join('')}</urlset>`
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'no-store' } })
}