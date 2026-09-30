import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'
import {schemaTypes} from './schemas'

export default defineConfig({
  name: 'moving-walls-helpcenter',
  title: 'Moving Walls Help Center',
  projectId: process.env.SANITY_STUDIO_PROJECT_ID || 'mwhelpcenter',
  dataset: process.env.SANITY_STUDIO_DATASET || 'development',
  plugins: [structureTool()],
  schema: {types: schemaTypes},
})