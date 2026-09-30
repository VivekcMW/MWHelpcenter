import { getEnv } from '../../lib/env.server'

export function loader() {
  const env = getEnv()
  const text = env.CONTENT_MODE === 'demo'
    ? 'User-agent: *\nDisallow: /\n'
    : `User-agent: *\nAllow: /\nDisallow: /*/search\nSitemap: ${new URL('/sitemap.xml', env.SITE_URL).href}\n`
  return new Response(text, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } })
}