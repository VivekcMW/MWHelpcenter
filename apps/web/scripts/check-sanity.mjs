import {readFileSync, realpathSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {parse} from 'dotenv'
import {z} from 'zod'
import {createClient} from '@sanity/client'

const languages = ['en', 'ja']
const requiredCollections = ['getting-started', 'best-practices']
const webKeys = ['CONTENT_MODE', 'SITE_URL', 'SANITY_PROJECT_ID', 'SANITY_DATASET', 'SANITY_API_VERSION', 'SANITY_READ_TOKEN']
const studioKeys = ['SANITY_STUDIO_PROJECT_ID', 'SANITY_STUDIO_DATASET']

/** Read only the two app .env files; never mutate process.env or use root fallbacks.
 * @param {{env?: NodeJS.ProcessEnv, readFile?: (file: string) => string}} options
 */
export function loadEnvironment({env = process.env, readFile = (file) => readFileSync(file, 'utf8')} = {}) {
  /** @type {Record<string, string | undefined>} */
  const result = {}
  for (const [url, keys] of [
    [new URL('../.env', import.meta.url), webKeys],
    [new URL('../../studio/.env', import.meta.url), studioKeys],
  ]) {
    let values = {}
    try {
      values = parse(readFile(fileURLToPath(url)))
    } catch (error) {
      if (error?.code !== 'ENOENT') throw new Error('ENV_READ_FAILED', {cause: error})
    }
    for (const key of keys) result[key] = env[key] !== undefined ? env[key] : values[key]
  }
  return result
}

/** URL normalization must not quietly accept paths, credentials or whitespace. */
export function isCleanOrigin(value) {
  if (typeof value !== 'string' || /[\s\\?#]/u.test(value)) return false
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
      && url.pathname === '/' && (value === url.origin || value === `${url.origin}/`)
  } catch {
    return false
  }
}

const projectId = z.string().regex(/^[a-z0-9]+$/).refine((value) => value !== 'mwhelpcenter')
const dataset = z.string().regex(/^[a-z0-9_][a-z0-9_-]{0,63}$/)
const apiVersion = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(value)
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
})
const configSchema = z.object({
  CONTENT_MODE: z.enum(['demo', 'sanity']).default('demo'),
  SITE_URL: z.string().refine(isCleanOrigin),
  SANITY_PROJECT_ID: projectId,
  SANITY_DATASET: dataset,
  SANITY_API_VERSION: apiVersion.default('2025-02-19'),
  SANITY_READ_TOKEN: z.string().default(''),
  SANITY_STUDIO_PROJECT_ID: projectId,
  SANITY_STUDIO_DATASET: dataset,
})

/** Internal config may contain a token. Only runReadiness's redacted report is printable. */
export function validateConfiguration(input) {
  const parsed = configSchema.safeParse(input)
  if (!parsed.success) {
    return {ok: false, issues: [...new Set(parsed.error.issues.map((issue) => `CONFIG_${issue.path[0]}`))]}
  }
  const config = parsed.data
  const issues = []
  if (config.SANITY_PROJECT_ID !== config.SANITY_STUDIO_PROJECT_ID) issues.push('PROJECT_MISMATCH')
  if (config.SANITY_DATASET !== config.SANITY_STUDIO_DATASET) issues.push('DATASET_MISMATCH')
  return issues.length ? {ok: false, issues} : {ok: true, issues, config}
}

// Separate JS query avoids Node's version-dependent TS stripping. Keep this
// explicit whitelist aligned with packages/content/src/queries.ts and schemas.
// References remain IDs so missing, draft-only and cross-language targets fail.
const visible = 'language in $languages && !(_id in path("drafts.**")) && !(_id in path("versions.**"))'
export const READINESS_QUERY = `{
  "products": *[_type == "product" && ${visible}]{_id, language, "slug": slug.current},
  "collections": *[_type == "collection" && ${visible}]{
    _id, language, "slug": slug.current, "productRef": product._ref
  },
  "articles": *[_type == "article" && ${visible}]{
    _id, language, "slug": slug.current, translationGroupId,
    "collectionRef": primaryCollection._ref, "productRefs": products[]._ref,
    "bodyCount": coalesce(count(body), 0)
  }
}`

const identity = z.object({
  _id: z.string().min(1).refine((id) => !/^(drafts|versions)\./.test(id)),
  language: z.enum(['en', 'ja']),
  slug: z.string().max(96).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
})
const catalogSchema = z.object({
  products: z.array(identity),
  collections: z.array(identity.extend({productRef: z.string().nullable()})),
  articles: z.array(identity.extend({
    translationGroupId: z.string().nullable(),
    collectionRef: z.string().nullable(),
    productRefs: z.array(z.string().nullable()).nullable(),
    bodyCount: z.number().int().nonnegative(),
  })),
})

/** Validate metadata in memory; return only fixed codes, fixed locales and counts. */
export function inspectPublishedData(input) {
  const parsed = catalogSchema.safeParse(input)
  if (!parsed.success) return {issues: [{code: 'PUBLISHED_DATA_INVALID'}], counts: []}
  const data = parsed.data
  const issues = []
  const seenIssues = new Set()
  const add = (code, locale) => {
    const key = `${code}:${locale}`
    if (!seenIssues.has(key)) {
      seenIssues.add(key)
      issues.push({code, locale})
    }
  }
  const counts = languages.map((locale) => ({
    locale,
    products: data.products.filter((item) => item.language === locale).length,
    collections: data.collections.filter((item) => item.language === locale).length,
    articles: data.articles.filter((item) => item.language === locale).length,
  }))
  const ids = new Set()
  for (const kind of ['products', 'collections', 'articles']) {
    const slugs = new Set()
    for (const item of data[kind]) {
      if (ids.has(item._id)) add('DOCUMENT_ID_AMBIGUOUS', item.language)
      ids.add(item._id)
      const key = `${item.language}:${item.slug}`
      if (slugs.has(key)) add('SLUG_AMBIGUOUS', item.language)
      slugs.add(key)
    }
  }
  for (const count of counts) {
    for (const kind of ['products', 'collections', 'articles']) {
      if (!count[kind]) add(`${kind.toUpperCase()}_EMPTY`, count.locale)
    }
    for (const slug of requiredCollections) {
      if (!data.collections.some((item) => item.language === count.locale && item.slug === slug)) {
        add(slug === 'getting-started' ? 'GETTING_STARTED_MISSING' : 'BEST_PRACTICES_MISSING', count.locale)
      }
    }
    for (const kind of ['products', 'collections']) {
      for (const item of data[kind].filter((item) => item.language !== count.locale)) {
        if (!data[kind].some((target) => target.language === count.locale && target.slug === item.slug)) {
          add('CATALOG_TRANSLATION_MISSING', count.locale)
        }
      }
    }
  }
  const products = new Map(data.products.map((item) => [item._id, item]))
  const collections = new Map(data.collections.map((item) => [item._id, item]))
  for (const collection of data.collections) {
    if (collection.productRef !== null && products.get(collection.productRef)?.language !== collection.language) {
      add('COLLECTION_PRODUCT_INVALID', collection.language)
    }
  }
  const groups = new Map()
  for (const article of data.articles) {
    const locale = article.language
    const collection = collections.get(article.collectionRef)
    if (!collection || collection.language !== locale) add('ARTICLE_COLLECTION_INVALID', locale)
    const refs = article.productRefs ?? []
    if (!refs.length || new Set(refs).size !== refs.length || refs.some((ref) => products.get(ref)?.language !== locale)) {
      add('ARTICLE_PRODUCTS_INVALID', locale)
    }
    if (collection?.productRef && !refs.includes(collection.productRef)) add('ARTICLE_COLLECTION_PRODUCT_MISMATCH', locale)
    if (!article.bodyCount) add('ARTICLE_BODY_EMPTY', locale)
    if (!article.translationGroupId || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(article.translationGroupId)) {
      add('TRANSLATION_GROUP_INVALID', locale)
      continue
    }
    const group = groups.get(article.translationGroupId) ?? new Set()
    if (group.has(locale)) add('TRANSLATION_GROUP_AMBIGUOUS', locale)
    group.add(locale)
    groups.set(article.translationGroupId, group)
  }
  for (const group of groups.values()) {
    for (const locale of languages) if (!group.has(locale)) add('ARTICLE_TRANSLATION_MISSING', locale)
  }
  return {issues, counts}
}

const actions = {
  CONFIG_CONTENT_MODE: 'Choose demo or sanity explicitly.',
  CONFIG_SITE_URL: 'Set SITE_URL to a canonical HTTP(S) origin without credentials, paths, query or fragment.',
  CONFIG_SANITY_PROJECT_ID: 'Set the web public project identifier from the approved real project; do not use mwhelpcenter.',
  CONFIG_SANITY_STUDIO_PROJECT_ID: 'Set the Studio public project identifier from the approved real project; do not use mwhelpcenter.',
  CONFIG_SANITY_DATASET: 'Set the web dataset: 1-64 lowercase letters, digits, underscores or hyphens; no leading hyphen.',
  CONFIG_SANITY_STUDIO_DATASET: 'Set the Studio dataset: 1-64 lowercase letters, digits, underscores or hyphens; no leading hyphen.',
  CONFIG_SANITY_API_VERSION: 'Use a valid pinned calendar date in YYYY-MM-DD format.',
  CONFIG_SANITY_READ_TOKEN: 'Supply any required server read token through the secure environment only.',
  PROJECT_MISMATCH: 'Align the web and Studio project identifiers after confirming the intended project.',
  DATASET_MISMATCH: 'Align the web and Studio datasets after confirming the intended dataset.',
  ENV_READ_FAILED: 'Check permissions on the two app .env files; do not share their contents.',
  ARGUMENT_INVALID: 'Use no arguments for live checks, or --offline for configuration checks only.',
  PUBLISHED_DATA_INVALID: 'Review published metadata against Studio schemas; repair invalid IDs, slugs or field shapes.',
  PRODUCTS_EMPTY: 'An authorized editor must publish approved products in this locale.',
  COLLECTIONS_EMPTY: 'An authorized editor must publish approved collections in this locale.',
  ARTICLES_EMPTY: 'Obtain approved source material and publish reviewed articles in this locale.',
  GETTING_STARTED_MISSING: 'Publish the approved getting-started collection in this locale.',
  BEST_PRACTICES_MISSING: 'Publish the approved best-practices collection in this locale.',
  CATALOG_TRANSLATION_MISSING: 'Align localized product/collection catalogs using stable slugs.',
  DOCUMENT_ID_AMBIGUOUS: 'Repair duplicate published document identities.',
  SLUG_AMBIGUOUS: 'Ensure each document type has a unique slug within each locale.',
  COLLECTION_PRODUCT_INVALID: 'Point the collection at a published same-language product, or leave a shared collection unscoped.',
  ARTICLE_COLLECTION_INVALID: 'Point the article at a published same-language collection.',
  ARTICLE_PRODUCTS_INVALID: 'Reference at least one unique published same-language product.',
  ARTICLE_COLLECTION_PRODUCT_MISMATCH: 'Include the collection product among the article products.',
  ARTICLE_BODY_EMPTY: 'Supply a reviewed nonempty rich-content array before publishing.',
  TRANSLATION_GROUP_INVALID: 'Assign a valid stable translationGroupId in Studio.',
  TRANSLATION_GROUP_AMBIGUOUS: 'Keep at most one published article per translation group per locale.',
  ARTICLE_TRANSLATION_MISSING: 'Obtain and publish the approved counterpart for each translation group.',
  UPSTREAM_AUTH: 'Verify dataset access and an existing least-privilege server read token, without sharing secrets.',
  UPSTREAM_NOT_FOUND: 'Confirm the approved project and dataset exist and are accessible.',
  UPSTREAM_RATE_LIMIT: 'Retry later and review provider rate limits.',
  UPSTREAM_UNAVAILABLE: 'Check provider availability and server connectivity, then retry.',
  UPSTREAM_FAILURE: 'Review project access, pinned API date and server connectivity securely; raw errors are suppressed.',
}

function upstreamCode(error) {
  // Never print provider messages, request URLs, headers, bodies or stack traces.
  if ([401, 403].includes(error?.statusCode)) return 'UPSTREAM_AUTH'
  if (error?.statusCode === 404) return 'UPSTREAM_NOT_FOUND'
  if (error?.statusCode === 429) return 'UPSTREAM_RATE_LIMIT'
  if (error?.statusCode >= 500) return 'UPSTREAM_UNAVAILABLE'
  return 'UPSTREAM_FAILURE'
}

/** Dependency injection keeps tests offline. This function returns no config or content. */
export async function runReadiness({args = [], loadEnv = loadEnvironment, clientFactory = createClient, log = console.log} = {}) {
  const report = {exitCode: 1, mode: args.includes('--offline') ? 'offline' : 'live', issues: [], counts: []}
  const fail = (code, locale) => {
    report.issues.push({code, ...(locale ? {locale} : {})})
    log(`FAIL ${code}${locale ? ` locale=${locale}` : ''}: ${actions[code]}`)
  }
  if (args.some((arg) => arg !== '--offline') || args.length > 1) {
    fail('ARGUMENT_INVALID')
    return report
  }
  let checked
  try {
    checked = validateConfiguration(loadEnv())
  } catch {
    fail('ENV_READ_FAILED')
    return report
  }
  if (!checked.ok) {
    for (const code of checked.issues) fail(code)
    log('BLOCKED NETWORK_NOT_ATTEMPTED: Fix configuration first; demo fallback is never used.')
    return report
  }
  const config = checked.config
  log('PASS CONFIG_READY: Syntax and alignment only; project existence and access are not yet verified.')
  if (config.CONTENT_MODE === 'demo') log('WARN DEMO_MODE: The web app still serves samples; this checker never reads them.')
  if (report.mode === 'offline') {
    log('PENDING LIVE_CHECK: Offline mode does not verify access or published content.')
    report.exitCode = 0
    return report
  }
  try {
    const client = clientFactory({
      projectId: config.SANITY_PROJECT_ID,
      dataset: config.SANITY_DATASET,
      apiVersion: config.SANITY_API_VERSION,
      token: config.SANITY_READ_TOKEN || undefined,
      perspective: 'published',
      useCdn: false,
      timeout: 10_000,
      maxRetries: 0,
    })
    const result = inspectPublishedData(await client.fetch(READINESS_QUERY, {languages}))
    report.counts = result.counts
    for (const count of result.counts) {
      log(`COUNT locale=${count.locale} products=${count.products} collections=${count.collections} articles=${count.articles}`)
    }
    for (const issue of result.issues) fail(issue.code, issue.locale)
  } catch (error) {
    fail(upstreamCode(error))
  }
  if (!report.issues.length) {
    report.exitCode = 0
    log('PASS PUBLISHED_READY: Published metadata meets the bilingual readiness checks.')
  }
  log('PENDING MANUAL_PUBLISH_UNPUBLISH: An authorized editor must still verify the real draft/publish/unpublish lifecycle and web responses.')
  return report
}

/** Guard imports (including test imports) and support invoking through a symlink. */
export function isDirectExecution(argvPath = process.argv[1]) {
  try {
    return Boolean(argvPath) && realpathSync(argvPath) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}

if (isDirectExecution()) {
  const report = await runReadiness({args: process.argv.slice(2)})
  process.exitCode = report.exitCode
}