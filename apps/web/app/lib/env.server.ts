import { config } from 'dotenv'
import { z } from 'zod'

config({ quiet: true })

const schema = z.object({
  CONTENT_MODE: z.enum(['demo', 'sanity']).default('demo'),
  SITE_URL: z.url().default('http://localhost:4320'),
  SANITY_PROJECT_ID: z.string().default(''),
  SANITY_DATASET: z.string().regex(/^[a-z0-9_-]+$/).default('development'),
  SANITY_API_VERSION: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).default('2025-02-19'),
  SANITY_READ_TOKEN: z.string().default(''),
  SUPPORT_EMAIL: z.union([z.email(), z.literal('')]).default(''),
}).superRefine((env, ctx) => {
  if (env.CONTENT_MODE === 'sanity' && !/^[a-z0-9]+$/.test(env.SANITY_PROJECT_ID)) {
    ctx.addIssue({ code: 'custom', path: ['SANITY_PROJECT_ID'], message: 'A real project ID is required in Sanity mode.' })
  }
  const url = new URL(env.SITE_URL)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    ctx.addIssue({ code: 'custom', path: ['SITE_URL'], message: 'Use a plain HTTP(S) origin without credentials, paths, or query parameters.' })
  }
})

export function parseEnv(input: Record<string, string | undefined>) {
  const result = schema.safeParse(input)
  if (!result.success) {
    // Never serialize environment values or tokens into error messages.
    throw new Error(`Invalid configuration: ${result.error.issues.map((issue) => issue.path.join('.')).join(', ')}`)
  }
  return result.data
}

export function getEnv() { return parseEnv(process.env) }