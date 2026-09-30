import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'
import {schemaTypes} from './schemas'

export default defineConfig({
  name: 'moving-walls-helpcenter',
  title: 'Moving Walls Help Center',
  projectId: process.env.SANITY_STUDIO_PROJECT_ID || 'vjmj7stb',
  dataset: process.env.SANITY_STUDIO_DATASET || 'helpcenterdevelopment',
  plugins: [structureTool({
    structure: (S) => {
      const locales = [
        {code: 'en', title: 'English'},
        {code: 'ja', title: '日本語'},
      ]
      const singleton = (schemaType: 'homePage' | 'siteSettings', title: string, language: typeof locales[number]) =>
        S.listItem()
          .id(`${schemaType}-${language.code}`)
          .title(`${title} — ${language.title}`)
          .child(S.document()
            .schemaType(schemaType)
            .documentId(`${schemaType}-${language.code}`)
            .title(`${title} — ${language.title}`))

      return S.list()
        .title('Moving Walls Help Center')
        .items([
          S.listItem()
            .id('home-and-settings')
            .title('Home & site settings')
            .child(S.list()
              .title('Localized site configuration')
              .items([
                ...locales.map((language) => singleton('homePage', 'Home page', language)),
                ...locales.map((language) => singleton('siteSettings', 'Site settings', language)),
              ])),
          S.divider(),
          S.documentTypeListItem('product').title('Products').child(
            S.documentTypeList('product').title('Products').defaultOrdering([{field: 'order', direction: 'asc'}]),
          ),
          S.documentTypeListItem('collection').title('Collections'),
          S.documentTypeListItem('article').title('Articles'),
          S.divider(),
          S.documentTypeListItem('author').title('Authors'),
          S.documentTypeListItem('redirect').title('Article redirects'),
        ])
    },
  })],
  schema: {types: schemaTypes},
})