import { createClient } from '@sanity/client'
import { getEnv } from '../env.server'

export function getPublishedClient() {
  const env = getEnv()
  if (env.CONTENT_MODE !== 'sanity') throw new Error('Sanity client is disabled in demo mode.')
  return createClient({
    projectId: env.SANITY_PROJECT_ID,
    dataset: env.SANITY_DATASET,
    apiVersion: env.SANITY_API_VERSION,
    perspective: 'published',
    useCdn: false, // Fresh published reads; no cache invalidation service needed yet.
    token: env.SANITY_READ_TOKEN || undefined,
    timeout: 10_000,
    maxRetries: 1,
  })
}