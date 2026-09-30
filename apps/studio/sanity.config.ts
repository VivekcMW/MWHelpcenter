import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'
import {schemaTypes} from './schemas'

export default defineConfig({
  name: 'moving-walls-helpcenter',
  title: 'Moving Walls Help Center',
  projectId: process.env.SANITY_STUDIO_PROJECT_ID || 'vjmj7stb',
  dataset: process.env.SANITY_STUDIO_DATASET || 'helpcenterdevelopment',
  plugins: [structureTool()],
  schema: {types: schemaTypes},
})