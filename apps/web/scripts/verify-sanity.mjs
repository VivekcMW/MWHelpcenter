import {createClient} from '@sanity/client'
import {config} from 'dotenv'
import {fileURLToPath} from 'node:url'

config({path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true})

const projectId = process.env.SANITY_PROJECT_ID?.trim()
const dataset = process.env.SANITY_DATASET?.trim()
const apiVersion = process.env.SANITY_API_VERSION?.trim() || '2025-02-19'
const requireContent = process.argv.includes('--require-content')

if (!projectId || !/^[a-z0-9]+$/.test(projectId)) {
  console.error('Sanity verification requires a valid SANITY_PROJECT_ID in apps/web/.env.')
  process.exit(1)
}

if (!dataset || !/^[a-z0-9_-]+$/.test(dataset)) {
  console.error('Sanity verification requires a valid SANITY_DATASET in apps/web/.env.')
  process.exit(1)
}

const client = createClient({
  projectId,
  dataset,
  apiVersion,
  perspective: 'published',
  useCdn: false,
  token: process.env.SANITY_READ_TOKEN?.trim() || undefined,
  timeout: 10_000,
  maxRetries: 1,
})

const published = '!(_id in path("drafts.**")) && !(_id in path("versions.**"))'

try {
  const [summary, articles] = await Promise.all([
    client.fetch(`{
      "products": count(*[_type == "product" && ${published}]),
      "collections": count(*[_type == "collection" && ${published}]),
      "articles": count(*[_type == "article" && ${published}]),
      "englishArticles": count(*[_type == "article" && language == "en" && ${published}]),
      "japaneseArticles": count(*[_type == "article" && language == "ja" && ${published}])
    }`),
    client.fetch(`*[_type == "article" && ${published}]{
      _id,
      language,
      "slug": slug.current,
      translationGroupId,
      "collectionId": primaryCollection->_id,
      "productCount": count(products)
    }`),
  ])

  const invalidArticles = articles.filter((article) =>
    !article.slug || !article.translationGroupId || !article.collectionId || article.productCount < 1,
  )
  const seenTranslations = new Set()
  const duplicateTranslations = articles.filter((article) => {
    const key = `${article.language}:${article.translationGroupId}`
    if (seenTranslations.has(key)) return true
    seenTranslations.add(key)
    return false
  })
  const isEmpty = summary.products === 0 && summary.collections === 0 && summary.articles === 0

  console.log(`Connected to Sanity project ${projectId}, dataset ${dataset}.`)
  console.table(summary)

  if (isEmpty) {
    console.warn('The published dataset is empty. Create and publish reviewed content before enabling Sanity mode in production.')
  }
  if (invalidArticles.length) {
    console.error(`Found ${invalidArticles.length} published article(s) missing required public relationships or identifiers.`)
  }
  if (duplicateTranslations.length) {
    console.error(`Found ${duplicateTranslations.length} duplicate language/translation-group combination(s).`)
  }

  if (invalidArticles.length || duplicateTranslations.length || (requireContent && isEmpty)) {
    process.exitCode = 1
  }
} catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown error'
  console.error(`Sanity verification failed: ${message}`)
  console.error('Check dataset access, SANITY_PROJECT_ID, SANITY_DATASET, and the server-only SANITY_READ_TOKEN if the dataset is private.')
  process.exitCode = 1
}