import {fileURLToPath} from 'node:url'
import {config} from 'dotenv'
import {defineCliConfig} from 'sanity/cli'

// Shell values win, then Studio .env, then the monorepo root .env.
// Keep filesystem/env loading out of the browser-bundled Studio config.
for (const relativePath of ['./.env', '../../.env']) {
  const {parsed} = config({
    path: fileURLToPath(new URL(relativePath, import.meta.url)),
    processEnv: {},
    quiet: true,
  })
  // Blank local placeholders must not shadow real root configuration.
  // Only copy public Studio identifiers, not unrelated root environment values.
  for (const key of ['SANITY_STUDIO_PROJECT_ID', 'SANITY_STUDIO_DATASET']) {
    if (!process.env[key] && parsed?.[key]) process.env[key] = parsed[key]
  }
}

export default defineCliConfig({
  api: {
    projectId: process.env.SANITY_STUDIO_PROJECT_ID || 'vjmj7stb',
    dataset: process.env.SANITY_STUDIO_DATASET || 'helpcenterdevelopment',
  },
})