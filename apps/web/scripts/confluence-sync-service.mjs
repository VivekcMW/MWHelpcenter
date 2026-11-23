import {createHash, createHmac, timingSafeEqual} from 'node:crypto'
import {createWriteStream} from 'node:fs'
import {chmod, mkdtemp, readFile, rm} from 'node:fs/promises'
import {createServer} from 'node:http'
import {dirname, join, resolve, sep} from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'
import {tmpdir} from 'node:os'
import {Readable, Transform} from 'node:stream'
import {pipeline} from 'node:stream/promises'
import {createClient} from '@sanity/client'
import {config} from 'dotenv'
import {Pool} from 'pg'
import {PRODUCTS, buildDocuments} from './migrate-confluence.mjs'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const webDir = resolve(scriptDir, '..')
const repoRoot = resolve(webDir, '../..')
const schemaFile = join(scriptDir, 'confluence-sync-schema.sql')
const MAX_WEBHOOK_BYTES = 1024 * 1024
const MAX_ATTEMPTS = 8
const LEASE_SECONDS = 90
const POLL_INTERVAL_MS = 1000
const ANIMATED_IMAGE_MIMES = new Set(['image/gif', 'image/webp', 'image/apng'])
const PAGE_SYNC_EVENTS = new Set([
  'page_created', 'page_updated', 'page_moved', 'page_restored', 'page_unarchived', 'page_published',
  'content_created', 'content_updated', 'content_restored',
])
const PAGE_DELETE_EVENTS = new Set([
  'page_removed', 'page_trashed', 'page_archived', 'content_removed', 'content_trashed',
])
const ATTACHMENT_EVENTS = new Set([
  'attachment_created', 'attachment_updated', 'attachment_removed', 'attachment_restored',
  'attachment_trashed', 'attachment_archived', 'attachment_unarchived',
])
const PRODUCT_TITLES = new Set(PRODUCTS.map(({title}) => title))

config({path: join(webDir, '.env'), quiet: true})
config({path: join(repoRoot, '.env.migration'), quiet: true})

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

export function stableHash(value) {
  const normalize = (input) => {
    if (Array.isArray(input)) return input.map(normalize)
    if (!input || typeof input !== 'object') return input
    return Object.fromEntries(Object.keys(input).sort().map((key) => [key, normalize(input[key])]))
  }
  const content = {...value}
  delete content._id
  delete content._rev
  delete content._createdAt
  delete content._updatedAt
  return sha256(JSON.stringify(normalize(content)))
}

export function verifyConfluenceSignature(rawBody, signature, secret) {
  if (!Buffer.isBuffer(rawBody) || typeof signature !== 'string' || !secret) return false
  const supplied = signature.trim().replace(/^sha256=/i, '')
  if (!/^[a-f\d]{64}$/i.test(supplied)) return false
  const expected = createHmac('sha256', secret).update(rawBody).digest()
  const received = Buffer.from(supplied, 'hex')
  return received.length === expected.length && timingSafeEqual(received, expected)
}

function numericId(value) {
  const id = String(value ?? '')
  return /^\d{1,32}$/.test(id) ? id : null
}

function eventVersion(entity) {
  const version = entity?.version
  const value = typeof version === 'object' && version !== null ? version.number : version
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

export function parseConfluenceEvent(payload, rawHash, sourceOrigin = 'https://movingwallshub.atlassian.net') {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {kind: 'review', eventType: 'invalid_payload', errorCode: 'invalid_payload', rawHash}
  }
  const eventType = String(payload.event || payload.webhookEvent || '').trim().toLowerCase()
  if (!eventType) return {kind: 'review', eventType: 'unknown', errorCode: 'missing_event_type', rawHash}

  const attachment = payload.attachment && typeof payload.attachment === 'object' ? payload.attachment : null
  const content = payload.page || payload.content?.page || payload.content
  const contentType = String(content?.contentType || content?.type || payload.contentType || '').toLowerCase()
  const page = content && (contentType === 'page' || eventType.startsWith('page_')) ? content : null
  if (!PAGE_SYNC_EVENTS.has(eventType) && !PAGE_DELETE_EVENTS.has(eventType) && !ATTACHMENT_EVENTS.has(eventType)) {
    return {kind: 'ignored', eventType, reason: 'unsupported_event'}
  }
  if (eventType.startsWith('content_') && contentType !== 'page') {
    return {kind: 'ignored', eventType, reason: 'non_page_content'}
  }

  const pageId = numericId(
    page?.id
    ?? attachment?.container?.id
    ?? attachment?.page?.id
    ?? attachment?.content?.id
    ?? payload.pageId,
  )
  const attachmentId = numericId(attachment?.id ?? payload.attachmentId)
  const spaceKey = String(page?.spaceKey || attachment?.spaceKey || payload.spaceKey || '')
  if (spaceKey && spaceKey.toLowerCase() !== 'helpdesk') {
    return {kind: 'ignored', eventType, reason: 'outside_helpdesk_space'}
  }
  if (!pageId && !attachmentId) {
    return {kind: 'review', eventType, errorCode: 'missing_content_id', rawHash}
  }

  const deleted = PAGE_DELETE_EVENTS.has(eventType)
  const entityKey = pageId ? `page:${pageId}` : `attachment:${attachmentId}`
  const version = eventVersion(page || attachment)
  const eventKey = sha256(`${eventType}\0${entityKey}\0${version ?? rawHash}`)
  const rawUrl = typeof page?.self === 'string' ? page.self : ''
  let sourceUrl = pageId ? `${sourceOrigin}/wiki/spaces/Helpdesk/pages/${pageId}` : ''
  if (rawUrl) {
    try {
        const parsed = new URL(rawUrl, sourceOrigin)
        if (parsed.origin === sourceOrigin && !parsed.username && !parsed.password) sourceUrl = parsed.href
    } catch {
      sourceUrl = `${sourceOrigin}/wiki/spaces/Helpdesk/pages/${pageId}`
    }
  }

  return {
    kind: 'queued',
    eventKey,
    eventType,
    pageId,
    attachmentId,
    sourceVersion: version,
    sourceTitle: String(page?.title || attachment?.title || '').slice(0, 500),
    sourceUrl,
    payloadHash: rawHash,
    deleted,
  }
}

function requiredEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing ${name}; configure it as a private service environment variable.`)
  return value
}

function requiredDatabaseUrl() {
  const value = requiredEnv('DATABASE_URL')
  let url
  try {
    url = new URL(value)
  } catch {
    throw new Error('DATABASE_URL must be a PostgreSQL connection URL.')
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('DATABASE_URL must use the postgres or postgresql protocol.')
  }
  const localHosts = new Set(['localhost', '127.0.0.1', '::1'])
  const tlsMode = url.searchParams.get('sslmode')
  const tlsEnabled = ['require', 'verify-ca', 'verify-full'].includes(tlsMode) || url.searchParams.get('ssl') === 'true'
  if (!localHosts.has(url.hostname) && !tlsEnabled) {
    throw new Error('DATABASE_URL must enable TLS for managed PostgreSQL.')
  }
  return value
}

function serviceConfig() {
  const baseUrl = new URL(process.env.CONFLUENCE_BASE_URL?.trim() || 'https://movingwallshub.atlassian.net')
  if (baseUrl.protocol !== 'https:' || baseUrl.pathname !== '/' || baseUrl.search || baseUrl.hash || baseUrl.username || baseUrl.password) {
    throw new Error('CONFLUENCE_BASE_URL must be an HTTPS origin without credentials, path, query, or fragment.')
  }
  const projectId = requiredEnv('SANITY_PROJECT_ID')
  if (!/^[a-z0-9]+$/.test(projectId)) throw new Error('SANITY_PROJECT_ID is invalid.')
  const dataset = requiredEnv('SANITY_DATASET')
  if (!/^[a-z0-9_-]+$/.test(dataset)) throw new Error('SANITY_DATASET is invalid.')
  if (projectId !== 'vjmj7stb' || dataset !== 'helpcenterdevelopment') {
    throw new Error('Confluence sync writes are restricted to project vjmj7stb dataset helpcenterdevelopment.')
  }
  const webhookSecret = requiredEnv('CONFLUENCE_WEBHOOK_SECRET')
  if (webhookSecret.length < 32) throw new Error('CONFLUENCE_WEBHOOK_SECRET must contain at least 32 characters.')
  const port = Number(process.env.PORT || process.env.CONFLUENCE_SYNC_PORT || 8080)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('CONFLUENCE_SYNC_PORT must be a valid TCP port.')
  const workerValue = String(process.env.CONFLUENCE_SYNC_WORKER_ENABLED || 'true').toLowerCase()
  if (!['true', 'false'].includes(workerValue)) throw new Error('CONFLUENCE_SYNC_WORKER_ENABLED must be true or false.')
  return {
    databaseUrl: requiredDatabaseUrl(),
    webhookSecret,
    confluenceOrigin: baseUrl.origin,
    confluenceEmail: requiredEnv('CONFLUENCE_EMAIL'),
    confluenceToken: requiredEnv('CONFLUENCE_API_TOKEN'),
    projectId,
    dataset,
    apiVersion: process.env.SANITY_API_VERSION?.trim() || '2025-02-19',
    sanityToken: requiredEnv('SANITY_MIGRATION_TOKEN'),
    port,
    workerEnabled: workerValue === 'true',
  }
}

function createPool(connectionString) {
  return new Pool({
    connectionString,
    max: 4,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
  })
}

async function enqueueEvent(pool, event) {
  const isReview = event.kind === 'review'
  const eventKey = event.eventKey || sha256(`${event.eventType}\0${event.rawHash}`)
  const result = await pool.query(
    `INSERT INTO confluence_sync_events
      (event_key, event_type, page_id, attachment_id, source_version, source_title, source_url, payload_hash, status, error_code)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (event_key) DO NOTHING`,
    [
      eventKey,
      event.eventType,
      event.pageId || null,
      event.attachmentId || null,
      event.sourceVersion,
      event.sourceTitle || '',
      event.sourceUrl || '',
      event.payloadHash || event.rawHash,
      isReview ? 'review' : 'queued',
      isReview ? event.errorCode : null,
    ],
  )
  return result.rowCount === 1
}

async function readRequestBody(request, limit = MAX_WEBHOOK_BYTES) {
  const chunks = []
  let total = 0
  for await (const chunk of request) {
    total += chunk.length
    if (total > limit) {
      request.pause()
      throw Object.assign(new Error('Webhook body exceeds the allowed size.'), {statusCode: 413})
    }
    chunks.push(chunk)
  }
  return Buffer.concat(chunks, total)
}

function writeJson(response, status, body) {
  const payload = JSON.stringify(body)
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  })
  response.end(payload)
}

async function handleWebhook(request, response, pool, config) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return writeJson(response, 405, {accepted: false, error: 'method_not_allowed'})
  }
  if (!String(request.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
    return writeJson(response, 415, {accepted: false, error: 'unsupported_media_type'})
  }
  const contentLength = Number(request.headers['content-length'])
  if (Number.isFinite(contentLength) && contentLength > MAX_WEBHOOK_BYTES) {
    request.pause()
    return writeJson(response, 413, {accepted: false, error: 'body_too_large'})
  }
  let rawBody
  try {
    rawBody = await readRequestBody(request)
  } catch (error) {
    return writeJson(response, error?.statusCode === 413 ? 413 : 400, {accepted: false, error: 'invalid_body'})
  }
  if (!verifyConfluenceSignature(rawBody, request.headers['x-hub-signature'], config.webhookSecret)) {
    return writeJson(response, 401, {accepted: false, error: 'invalid_signature'})
  }
  let payload
  try {
    payload = JSON.parse(rawBody.toString('utf8'))
  } catch {
    return writeJson(response, 400, {accepted: false, error: 'invalid_json'})
  }
  const event = parseConfluenceEvent(payload, sha256(rawBody), config.confluenceOrigin)
  if (event.kind === 'ignored') {
    console.info(`Ignored Confluence event: ${event.eventType} (${event.reason})`)
    return writeJson(response, 202, {accepted: false, reason: event.reason})
  }
  const inserted = await enqueueEvent(pool, event)
  return writeJson(response, 202, {accepted: true, duplicate: !inserted, review: event.kind === 'review'})
}

function apiUrl(config, path) {
  if (/^https?:\/\//i.test(path)) {
    const url = new URL(path)
    if (url.origin !== config.confluenceOrigin || url.username || url.password) throw new Error('Refusing a Confluence request outside the configured origin.')
    return url.href
  }
  if (path.startsWith('/wiki/')) return `${config.confluenceOrigin}${path}`
  if (path.startsWith('/rest/') || path.startsWith('/download/')) return `${config.confluenceOrigin}/wiki${path}`
  if (path.startsWith('/')) return `${config.confluenceOrigin}${path}`
  return `${config.confluenceOrigin}/wiki/${path}`
}

async function confluenceFetch(config, path, binary = false) {
  const url = apiUrl(config, path)
  const signal = AbortSignal.timeout(30000)
  const authorization = `Basic ${Buffer.from(`${config.confluenceEmail}:${config.confluenceToken}`).toString('base64')}`
  let response = await fetch(url, {
    headers: {Authorization: authorization, Accept: binary ? '*/*' : 'application/json'},
    redirect: 'manual',
    signal,
  })
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get('location')
    if (!location) throw new Error('Confluence returned a redirect without a location.')
    const destination = new URL(location, url)
    if (destination.protocol !== 'https:' || ![config.confluenceOrigin, 'https://api.media.atlassian.com'].includes(destination.origin)) {
      throw new Error('Refusing a Confluence redirect outside approved HTTPS origins.')
    }
    response = await fetch(destination, {
      headers: {
        ...(destination.origin === config.confluenceOrigin ? {Authorization: authorization} : {}),
        Accept: binary ? '*/*' : 'application/json',
      },
      redirect: 'error',
      signal,
    })
  }
  if (!response.ok) {
    const error = new Error(`Confluence request failed with status ${response.status}.`)
    error.status = response.status
    throw error
  }
  return binary ? response : response.json()
}

async function fetchPaged(config, path) {
  const results = []
  let next = path
  while (next) {
    const page = await confluenceFetch(config, next)
    results.push(...(page.results || []))
    next = page._links?.next || null
  }
  return results
}

function productRootFor(page) {
  const ancestors = page.ancestors || []
  const rootIndex = ancestors.findLastIndex((ancestor) => PRODUCT_TITLES.has(ancestor.title))
  if (rootIndex < 0) return null
  const product = ancestors[rootIndex]
  return {
    id: String(product.id),
    title: product.title,
    ancestors: ancestors.slice(0, rootIndex),
  }
}

function safeFilename(value) {
  return String(value).replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^\.+/, '').slice(0, 180) || 'attachment'
}

async function streamAttachment(config, attachment, directory) {
  const relativePath = safeFilename(`${attachment.id}_${attachment.title || 'attachment'}`)
  const destination = resolve(directory, relativePath)
  if (!destination.startsWith(`${resolve(directory)}${sep}`)) throw new Error('Unsafe attachment filename from Confluence.')
  if (!attachment._links?.download) throw new Error('Confluence attachment has no download URL.')
  const response = await confluenceFetch(config, attachment._links.download, true)
  const hash = createHash('sha256')
  const legacyHash = createHash('sha1')
  const hashingStream = new Transform({
    transform(chunk, _encoding, callback) {
      hash.update(chunk)
      legacyHash.update(chunk)
      callback(null, chunk)
    },
  })
  if (!response.body) throw new Error('Confluence returned an empty attachment response.')
  await pipeline(Readable.fromWeb(response.body), hashingStream, createWriteStream(destination, {mode: 0o600}))
  return {path: destination, hash: hash.digest('hex'), legacyHash: legacyHash.digest('hex')}
}

async function mapLimit(items, limit, callback) {
  let index = 0
  await Promise.all(Array.from({length: Math.min(limit, items.length)}, async () => {
    while (index < items.length) await callback(items[index++])
  }))
}

async function prepareAssets(pool, client, config, pageId, attachments, directory, legacyAssetByName) {
  const assetIds = new Map()
  await mapLimit(attachments, 3, async (attachment) => {
    const attachmentId = numericId(attachment.id)
    if (!attachmentId) throw new Error('Confluence returned an invalid attachment ID.')
    const mediaType = String(attachment.metadata?.mediaType || 'application/octet-stream').toLowerCase().split(';')[0].trim()
    const sourceVersion = Number(attachment.version?.number)
    const version = Number.isSafeInteger(sourceVersion) && sourceVersion > 0 ? sourceVersion : null
    const sourceUpdatedAt = attachment.version?.when || attachment.history?.lastUpdated?.when || null
    const known = await pool.query(
      'SELECT source_version, source_updated_at, sha256, sanity_asset_id FROM confluence_sync_assets WHERE attachment_id = $1',
      [attachmentId],
    )
    const prior = known.rows[0]
    if (prior && version && Number(prior.source_version) === version) {
      assetIds.set(attachmentId, prior.sanity_asset_id)
      return
    }
    if (prior && !version && sourceUpdatedAt && prior.source_updated_at && new Date(prior.source_updated_at).getTime() === new Date(sourceUpdatedAt).getTime()) {
      assetIds.set(attachmentId, prior.sanity_asset_id)
      return
    }

    const downloaded = await streamAttachment(config, attachment, directory)
    let sanityAssetId = prior?.sanity_asset_id
    if (!prior || prior.sha256 !== downloaded.hash) {
      const legacyAsset = legacyAssetByName.get(String(attachment.title || '').toLowerCase())
        ?.find((candidate) => String(candidate.sha1hash || '').toLowerCase() === downloaded.legacyHash)
      if (legacyAsset) sanityAssetId = legacyAsset._id
      else {
        const type = mediaType.startsWith('image/') && !ANIMATED_IMAGE_MIMES.has(mediaType) ? 'image' : 'file'
        const asset = await client.assets.upload(type, createWriteStream(downloaded.path), {
          filename: String(attachment.title || safeFilename(attachmentId)),
          contentType: mediaType,
        })
        sanityAssetId = asset._id
      }
    }
    await pool.query(
      `INSERT INTO confluence_sync_assets
        (attachment_id, page_id, source_version, source_updated_at, sha256, sanity_asset_id, media_type, file_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (attachment_id) DO UPDATE SET
         page_id = EXCLUDED.page_id,
         source_version = EXCLUDED.source_version,
         source_updated_at = EXCLUDED.source_updated_at,
         sha256 = EXCLUDED.sha256,
         sanity_asset_id = EXCLUDED.sanity_asset_id,
         media_type = EXCLUDED.media_type,
         file_name = EXCLUDED.file_name,
         updated_at = NOW()`,
      [attachmentId, pageId, version, sourceUpdatedAt, downloaded.hash, sanityAssetId, mediaType, String(attachment.title || safeFilename(attachmentId))],
    )
    assetIds.set(attachmentId, sanityAssetId)
  })
  return assetIds
}

function sourcePageUrl(config, pageId) {
  return `${config.confluenceOrigin}/wiki/spaces/Helpdesk/pages/${pageId}`
}

async function fetchPage(config, pageId) {
  const page = await confluenceFetch(
    config,
    `/rest/api/content/${encodeURIComponent(pageId)}?expand=ancestors,body.storage,metadata.labels,version`,
  )
  const attachments = await fetchPaged(config, `/rest/api/content/${encodeURIComponent(pageId)}/child/attachment?limit=100`)
  return {page, attachments}
}

function normalizedArticleHash(article) {
  return stableHash(article)
}

async function setEventStatus(pool, eventId, status, errorCode = null, reviewReasons = []) {
  await pool.query(
    'UPDATE confluence_sync_events SET status = $2, error_code = $3, review_reasons = $4::jsonb, lease_until = NULL, updated_at = NOW() WHERE id = $1',
    [eventId, status, errorCode, JSON.stringify(reviewReasons)],
  )
}

async function markForReview(pool, event, errorCode, sourceTitle = event.source_title || '', sourceUrl = event.source_url || '') {
  if (event.page_id) {
    await pool.query(
      `UPDATE confluence_sync_state SET status = $2, updated_at = NOW()
       WHERE page_id = $1`,
      [event.page_id, errorCode === 'source_deleted' ? 'deletion_review' : 'needs_review'],
    )
  }
  await pool.query(
    `UPDATE confluence_sync_events SET status = 'review', error_code = $2, source_title = COALESCE(NULLIF($3, ''), source_title),
      source_url = COALESCE(NULLIF($4, ''), source_url), lease_until = NULL, updated_at = NOW() WHERE id = $1`,
    [event.id, errorCode, sourceTitle, sourceUrl],
  )
}

async function resolvePageId(pool, config, event) {
  if (event.page_id) return event.page_id
  if (!event.attachment_id) return null
  const known = await pool.query('SELECT page_id FROM confluence_sync_assets WHERE attachment_id = $1', [event.attachment_id])
  if (known.rows[0]?.page_id) return known.rows[0].page_id
  try {
    const attachment = await confluenceFetch(
      config,
      `/rest/api/content/${encodeURIComponent(event.attachment_id)}?expand=container`,
    )
    return numericId(attachment.container?.id)
  } catch (error) {
    if (error?.status === 404) return null
    throw error
  }
}

async function processPageEvent(pool, client, config, event) {
  const pageId = await resolvePageId(pool, config, event)
  if (!pageId) {
    await markForReview(pool, event, 'attachment_parent_unresolved')
    return
  }

  let fetched
  try {
    fetched = await fetchPage(config, pageId)
  } catch (error) {
    if (error?.status === 404) {
      await markForReview(pool, {...event, page_id: pageId}, 'source_deleted')
      return
    }
    throw error
  }
  const {page, attachments} = fetched
  const title = String(page.title || event.source_title || '').slice(0, 500)
  const url = sourcePageUrl(config, pageId)
  if (page.status && page.status !== 'current') {
    await markForReview(pool, {...event, page_id: pageId}, 'source_not_current', title, url)
    return
  }

  const root = productRootFor(page)
  if (!root) {
    await markForReview(pool, {...event, page_id: pageId}, 'unmapped_product', title, url)
    return
  }

  const tempDir = await mkdtemp(join(tmpdir(), 'mw-confluence-sync-'))
  await chmod(tempDir, 0o700)
  try {
    const documentId = `confluence-article-${pageId}`
    const legacyDocs = await client.fetch(
      '*[_id in $ids]{body[]{image{asset{_ref}},file{asset{_ref}},video{asset{_ref}},audio{asset{_ref}},captions[]{file{asset{_ref}}}}}',
      {ids: [documentId, `drafts.${documentId}`]},
    )
    const referencedAssetIds = [...new Set(legacyDocs.flatMap((document) => document.body || []).flatMap((block) => [
      block.image?.asset?._ref,
      block.file?.asset?._ref,
      block.video?.asset?._ref,
      block.audio?.asset?._ref,
      ...(block.captions || []).map((caption) => caption.file?.asset?._ref),
    ]).filter(Boolean))]
    const legacyAssets = referencedAssetIds.length
      ? await client.fetch('*[_id in $ids]{_id, originalFilename, sha1hash}', {ids: referencedAssetIds})
      : []
    const legacyAssetByName = new Map()
    for (const asset of legacyAssets) {
      const name = String(asset.originalFilename || '').toLowerCase()
      if (!name) continue
      const matches = legacyAssetByName.get(name) || []
      matches.push(asset)
      legacyAssetByName.set(name, matches)
    }
    const assetIds = await prepareAssets(pool, client, config, pageId, attachments, tempDir, legacyAssetByName)
    const snapshotPage = {
      id: pageId,
      title,
      status: page.status || 'current',
      version: page.version?.number ?? null,
      ancestors: page.ancestors || [],
      labels: (page.metadata?.labels?.results || []).map(({name}) => name),
      storageHtml: page.body?.storage?.value || '',
      attachments: attachments.map((attachment) => ({
        id: String(attachment.id),
        title: attachment.title || '',
        mediaType: attachment.metadata?.mediaType || 'application/octet-stream',
      })),
    }
    const plan = buildDocuments({pages: [root, snapshotPage]}, assetIds)
    const excluded = plan.excluded.find((candidate) => candidate.id === pageId)
    if (excluded) {
      await markForReview(pool, {...event, page_id: pageId}, 'editorial_exclusion', title, url)
      return
    }
    const article = plan.articles.find((candidate) => candidate._id === `confluence-article-${pageId}`)
    if (!article) {
      await markForReview(pool, {...event, page_id: pageId}, 'article_transform_failed', title, url)
      return
    }

    const publishedId = article._id
    const draftId = `drafts.${publishedId}`
    const productId = article.products[0]?._ref
    const collectionId = article.primaryCollection?._ref
    const dependencyIds = [productId, collectionId].filter(Boolean)
    const foundDependencies = await client.fetch('*[_id in $ids]._id', {ids: dependencyIds})
    if (foundDependencies.length !== dependencyIds.length) {
      await markForReview(pool, {...event, page_id: pageId}, 'product_dependencies_missing', title, url)
      return
    }

    const existing = await client.fetch(
      '*[_id == $publishedId || _id == $draftId]{_id, _type, title, slug, summary, language, translationGroupId, primaryCollection, collections, products, contentType, body, reviewedAt, firstPublishedAt, seo}',
      {publishedId, draftId},
    )
    const published = existing.find((document) => document._id === publishedId)
    const currentDraft = existing.find((document) => document._id === draftId)
    if (published?.slug?.current) article.slug.current = published.slug.current
    else if (currentDraft?.slug?.current) article.slug.current = currentDraft.slug.current

    const collisions = await client.fetch(
      '*[_type == "article" && language == $language && slug.current == $slug && _id != $publishedId && _id != $draftId]._id',
      {language: article.language, slug: article.slug.current, publishedId, draftId},
    )
    if (collisions.length) {
      await markForReview(pool, {...event, page_id: pageId}, 'slug_collision', title, url)
      return
    }

    const generatedHash = normalizedArticleHash(article)
    const sourceHash = generatedHash
    const storedState = await pool.query('SELECT source_version, source_hash, draft_hash, status FROM confluence_sync_state WHERE page_id = $1', [pageId])
    const priorState = storedState.rows[0]
    const sourceVersion = Number(page.version?.number) || event.source_version || null
    if (priorState?.source_hash === sourceHash) {
      await pool.query(
        `UPDATE confluence_sync_state SET source_version = $2, source_title = $3, source_url = $4, updated_at = NOW()
         WHERE page_id = $1`,
        [pageId, sourceVersion, title, url],
      )
      await setEventStatus(pool, event.id, 'completed')
      return
    }

    if (currentDraft) {
      const currentDraftHash = normalizedArticleHash(currentDraft)
      const isUnchangedSourceDraft = priorState?.draft_hash === currentDraftHash
      const alreadyDesired = generatedHash === currentDraftHash
      if (!isUnchangedSourceDraft && !alreadyDesired) {
        await markForReview(pool, {...event, page_id: pageId}, 'editorial_conflict', title, url)
        return
      }
    }

    await client.createOrReplace({...article, _id: draftId})
    const warningReasons = plan.warnings.map((warning) => String(warning).slice(0, 1000))
    await pool.query(
      `INSERT INTO confluence_sync_state
        (page_id, sanity_document_id, source_version, source_hash, draft_hash, product_slug, source_title, source_url, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (page_id) DO UPDATE SET
         sanity_document_id = EXCLUDED.sanity_document_id,
         source_version = EXCLUDED.source_version,
         source_hash = EXCLUDED.source_hash,
         draft_hash = EXCLUDED.draft_hash,
         product_slug = EXCLUDED.product_slug,
         source_title = EXCLUDED.source_title,
         source_url = EXCLUDED.source_url,
         status = EXCLUDED.status,
         updated_at = NOW()`,
      [pageId, publishedId, sourceVersion, sourceHash, generatedHash, root.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), title, url, warningReasons.length ? 'needs_review' : 'draft_pending'],
    )
    await pool.query(
      `UPDATE confluence_sync_assets SET page_id = $2, updated_at = NOW()
       WHERE attachment_id = ANY($1::text[])`,
      [attachments.map((attachment) => String(attachment.id)), pageId],
    )
    await setEventStatus(pool, event.id, warningReasons.length ? 'review' : 'completed',
      warningReasons.length ? 'content_review_required' : null, warningReasons)
  } finally {
    await rm(tempDir, {recursive: true, force: true})
  }
}

async function processEvent(pool, client, config, event) {
  if (PAGE_DELETE_EVENTS.has(event.event_type) || event.event_type === 'reconcile_deleted') {
    await markForReview(pool, event, 'source_deleted')
    return
  }
  await processPageEvent(pool, client, config, event)
}

async function claimEvent(pool) {
  const connection = await pool.connect()
  try {
    await connection.query('BEGIN')
    const selected = await connection.query(
      `SELECT * FROM confluence_sync_events
       WHERE (status = 'queued' AND available_at <= NOW())
          OR (status = 'processing' AND lease_until < NOW())
       ORDER BY available_at, id
       LIMIT 1 FOR UPDATE SKIP LOCKED`,
    )
    const event = selected.rows[0]
    if (!event) {
      await connection.query('COMMIT')
      return null
    }
    const updated = await connection.query(
      `UPDATE confluence_sync_events
       SET status = 'processing', attempts = attempts + 1,
           lease_until = NOW() + ($2 * INTERVAL '1 second'), updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [event.id, LEASE_SECONDS],
    )
    await connection.query('COMMIT')
    return updated.rows[0]
  } catch (error) {
    await connection.query('ROLLBACK')
    throw error
  } finally {
    connection.release()
  }
}

async function failEvent(pool, event, error) {
  const attempts = Number(event.attempts) || 1
  const code = error?.status === 429 ? 'confluence_rate_limited' : 'sync_processing_failed'
  if (attempts >= MAX_ATTEMPTS) {
    await setEventStatus(pool, event.id, 'failed', code)
    console.error(`Confluence sync event ${event.id} exhausted retries (${code}).`)
    return
  }
  const delaySeconds = Math.min(900, 2 ** Math.min(attempts, 9))
  await pool.query(
    `UPDATE confluence_sync_events
     SET status = 'queued', error_code = $2, available_at = NOW() + ($3 * INTERVAL '1 second'),
         lease_until = NULL, updated_at = NOW()
     WHERE id = $1`,
    [event.id, code, delaySeconds],
  )
  console.error(`Confluence sync event ${event.id} will retry (${code}, attempt ${attempts}).`)
}

async function workerLoop(pool, client, config, isStopping) {
  while (!isStopping()) {
    try {
      const event = await claimEvent(pool)
      if (!event) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
        continue
      }
      const heartbeat = setInterval(() => {
        pool.query(
          `UPDATE confluence_sync_events SET lease_until = NOW() + ($2 * INTERVAL '1 second')
           WHERE id = $1 AND status = 'processing'`,
          [event.id, LEASE_SECONDS],
        ).catch((error) => console.error(`Confluence sync lease renewal failed for event ${event.id}: ${error.message}`))
      }, Math.floor(LEASE_SECONDS * 1000 / 3))
      heartbeat.unref()
      try {
        await processEvent(pool, client, config, event)
      } catch (error) {
        await failEvent(pool, event, error)
      } finally {
        clearInterval(heartbeat)
      }
    } catch (error) {
      console.error(`Confluence sync worker database error: ${error.message}`)
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS * 5))
    }
  }
}

async function reconcile(pool, config) {
  const pages = await fetchPaged(
    config,
    '/rest/api/content?spaceKey=Helpdesk&type=page&status=current&limit=100&expand=ancestors,version',
  )
  const currentPageIds = new Set()
  let queued = 0
  const runId = `${Date.now()}-${process.pid}`
  for (const page of pages) {
    if (!(page.ancestors || []).some((ancestor) => PRODUCT_TITLES.has(ancestor.title))) continue
    const pageId = numericId(page.id)
    if (!pageId) continue
    currentPageIds.add(pageId)
    const event = {
      kind: 'queued',
      eventKey: sha256(`reconcile\0${runId}\0${pageId}`),
      eventType: 'reconcile',
      pageId,
      attachmentId: null,
      sourceVersion: eventVersion(page),
      sourceTitle: String(page.title || '').slice(0, 500),
      sourceUrl: sourcePageUrl(config, pageId),
      payloadHash: sha256(`${pageId}\0${runId}`),
    }
    if (await enqueueEvent(pool, event)) queued += 1
  }
  const known = await pool.query(
    `SELECT page_id, source_title, source_url FROM confluence_sync_state
     WHERE status IN ('draft_pending', 'active', 'conflict', 'needs_review')`,
  )
  let deletionReviews = 0
  for (const state of known.rows) {
    if (currentPageIds.has(state.page_id)) continue
    const event = {
      kind: 'queued',
      eventKey: sha256(`reconcile_deleted\0${runId}\0${state.page_id}`),
      eventType: 'reconcile_deleted',
      pageId: state.page_id,
      attachmentId: null,
      sourceVersion: null,
      sourceTitle: state.source_title,
      sourceUrl: state.source_url,
      payloadHash: sha256(`reconcile_deleted\0${runId}\0${state.page_id}`),
    }
    if (await enqueueEvent(pool, event)) deletionReviews += 1
  }
  console.info(`Confluence reconciliation queued ${queued} page checks and ${deletionReviews} deletion reviews.`)
}

async function printStatus(pool) {
  const counts = await pool.query('SELECT status, COUNT(*)::integer AS count FROM confluence_sync_events GROUP BY status ORDER BY status')
  const reviews = await pool.query(
    `SELECT id, event_type, page_id, attachment_id, source_title, source_url, error_code, review_reasons
     FROM confluence_sync_events WHERE status = 'review' ORDER BY updated_at DESC LIMIT 50`,
  )
  console.log(JSON.stringify({events: counts.rows, reviewQueue: reviews.rows}, null, 2))
}

async function migrateSchema(pool) {
  const sql = await readFile(schemaFile, 'utf8')
  await pool.query(sql)
  console.info('Confluence sync tables are ready.')
}

async function serve(config) {
  const pool = createPool(config.databaseUrl)
  const client = createClient({
    projectId: config.projectId,
    dataset: config.dataset,
    apiVersion: config.apiVersion,
    useCdn: false,
    perspective: 'raw',
    token: config.sanityToken,
  })
  await pool.query('SELECT 1')
  await pool.query('SELECT id FROM confluence_sync_events LIMIT 0')
  await pool.query('SELECT page_id FROM confluence_sync_state LIMIT 0')
  await pool.query('SELECT attachment_id FROM confluence_sync_assets LIMIT 0')
  const server = createServer((request, response) => {
    if (request.url === '/health' && request.method === 'GET') {
      void pool.query('SELECT 1').then(
        () => writeJson(response, 200, {ok: true}),
        () => writeJson(response, 503, {ok: false}),
      )
      return
    }
    if (request.url === '/webhooks/confluence') {
      void handleWebhook(request, response, pool, config).catch((error) => {
        console.error(`Confluence webhook enqueue failed: ${error.message}`)
        if (!response.headersSent) writeJson(response, 503, {accepted: false, error: 'temporarily_unavailable'})
        else response.destroy()
      })
      return
    }
    writeJson(response, 404, {error: 'not_found'})
  })
  server.requestTimeout = 15000
  server.headersTimeout = 10000
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(config.port, '0.0.0.0', resolve)
  })
  console.info(`Confluence sync service listening on port ${config.port}.`)
  let stopping = false
  const serverClosed = new Promise((resolve) => server.once('close', resolve))
  const stop = () => {
    if (stopping) return
    stopping = true
    server.close()
  }
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
  const worker = config.workerEnabled
    ? workerLoop(pool, client, config, () => stopping)
    : Promise.resolve()
  if (!config.workerEnabled) console.info('Confluence sync worker is paused; signed events will be queued only.')
  await serverClosed
  stopping = true
  await worker
  await pool.end()
}

async function main() {
  const command = process.argv[2] || 'start'
  if (command === 'db:migrate' || command === 'status') {
    const pool = createPool(requiredDatabaseUrl())
    try {
      if (command === 'db:migrate') return await migrateSchema(pool)
      return await printStatus(pool)
    } finally {
      await pool.end()
    }
  }
  const config = serviceConfig()
  if (command === 'reconcile') {
    const pool = createPool(config.databaseUrl)
    try {
      await pool.query('SELECT 1')
      return await reconcile(pool, config)
    } finally {
      await pool.end()
    }
  }
  if (command === 'start') return serve(config)
  throw new Error('Usage: confluence-sync-service.mjs start | db:migrate | status | reconcile')
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Confluence sync service failed.')
    process.exitCode = 1
  })
}
