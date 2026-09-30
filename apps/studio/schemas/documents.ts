import {defineArrayMember, defineField, defineType} from 'sanity'
import {description, isLocalPath, language, sameLanguage, slug, title} from './common'

export const product = defineType({
  name: 'product', type: 'document', fields: [
    title, slug, description,
    defineField({name: 'icon', description: 'Stable icon key, not SVG or HTML.', type: 'string', validation: (rule) => rule.required().regex(/^[a-z][a-z0-9-]*$/)}),
    defineField({name: 'order', type: 'number', initialValue: 0, validation: (rule) => rule.required().integer().min(0)}),
    language,
  ],
  orderings: [{title: 'Display order', name: 'displayOrder', by: [{field: 'order', direction: 'asc'}]}],
})

export const collection = defineType({
  name: 'collection', type: 'document', fields: [
    title, slug, description,
    defineField({name: 'product', description: 'Optional: leave empty for a collection shared across products.', type: 'reference', to: [{type: 'product'}], options: {filter: ({document}) => ({filter: 'language == $language', params: {language: document.language ?? 'en'}})}, validation: (rule) => rule.custom(sameLanguage)}),
    language,
  ],
})

export const article = defineType({
  name: 'article', type: 'document', fields: [
    title, slug,
    defineField({name: 'summary', type: 'text', rows: 3, validation: (rule) => rule.required().min(10).max(320)}),
    language,
    defineField({name: 'translationGroupId', type: 'string', description: 'Shared stable identifier across translations; not a slug or document reference.', validation: (rule) => rule.required().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/)}),
    defineField({name: 'primaryCollection', type: 'reference', to: [{type: 'collection'}], options: {filter: ({document}) => ({filter: 'language == $language', params: {language: document.language ?? 'en'}})}, validation: (rule) => rule.required().custom(sameLanguage)}),
    defineField({name: 'collections', title: 'Additional collections', description: 'Optional curated groupings; the primary collection above remains the breadcrumb.', type: 'array', of: [defineArrayMember({type: 'reference', to: [{type: 'collection'}], options: {filter: ({document}) => ({filter: 'language == $language', params: {language: document.language ?? 'en'}})}})], validation: (rule) => rule.unique().custom(async (value, context) => {
      const languageResult = await sameLanguage(value, context)
      if (languageResult !== true) return languageResult
      const primaryId = (context.document?.primaryCollection as {_ref?: string} | undefined)?._ref
      return Array.isArray(value) && primaryId && value.some((reference) => (reference as {_ref?: string})._ref === primaryId)
        ? 'The primary collection is already selected.' : true
    })}),
    defineField({name: 'products', type: 'array', of: [defineArrayMember({type: 'reference', to: [{type: 'product'}], options: {filter: ({document}) => ({filter: 'language == $language', params: {language: document.language ?? 'en'}})}})], validation: (rule) => rule.required().min(1).unique().custom(sameLanguage)}),
    defineField({name: 'contentType', type: 'string', options: {list: ['guide', 'faq', 'troubleshooting', 'overview', 'best-practice']}, validation: (rule) => rule.required()}),
    defineField({name: 'body', type: 'richContent', validation: (rule) => rule.required().min(1)}),
    defineField({name: 'reviewedAt', type: 'datetime', description: 'Public last-reviewed date. This does not enforce an approval workflow.'}),
    defineField({name: 'firstPublishedAt', type: 'datetime', description: 'Public first-published date, maintained by editors; not auto-populated.'}),
    defineField({name: 'seo', type: 'object', fields: [
      defineField({name: 'title', type: 'string', validation: (rule) => rule.max(70)}),
      defineField({name: 'description', type: 'text', rows: 2, validation: (rule) => rule.max(170)}),
    ]}),
  ],
  preview: {select: {title: 'title', subtitle: 'language'}},
})

// Public profile only: no login identity, email, private bio or approval metadata.
export const author = defineType({
  name: 'author', type: 'document', fields: [
    defineField({name: 'name', type: 'string', validation: (rule) => rule.required().max(100)}),
    defineField({name: 'bio', type: 'text', rows: 3, validation: (rule) => rule.max(500)}),
    defineField({name: 'portrait', type: 'imageWithCaption'}),
    language,
  ],
  preview: {select: {title: 'name'}},
})

export const siteSettings = defineType({
  name: 'siteSettings', title: 'Site settings', type: 'document', fields: [
    title, description, language,
    defineField({name: 'navigationLinks', title: 'Primary navigation', type: 'array', of: [defineArrayMember({
      name: 'navigationLink', type: 'object', fields: [
        defineField({name: 'label', type: 'string', validation: (rule) => rule.required().max(60)}),
        defineField({name: 'destination', type: 'string', options: {list: [
          {title: 'Products section', value: 'products'},
          {title: 'Getting started collection', value: 'getting-started'},
          {title: 'Best practices collection', value: 'best-practices'},
        ]}, validation: (rule) => rule.required()}),
      ],
    })], validation: (rule) => rule.max(3).custom((value) => {
      const destinations = (value || []).map((item) => (item as {destination?: string}).destination).filter(Boolean)
      return destinations.length === new Set(destinations).size ? true : 'Each navigation destination can appear only once.'
    })}),
    defineField({name: 'footerText', type: 'string', validation: (rule) => rule.max(160)}),
    defineField({name: 'footerNote', type: 'string', validation: (rule) => rule.max(160)}),
    defineField({name: 'supportLinkLabel', type: 'string', validation: (rule) => rule.max(60)}),
    defineField({name: 'featuredProducts', type: 'array', of: [defineArrayMember({type: 'reference', to: [{type: 'product'}]})], validation: (rule) => rule.unique().max(6).custom(sameLanguage)}),
  ],
})

export const homePage = defineType({
  name: 'homePage', title: 'Home page', type: 'document',
  fields: [
    language,
    defineField({name: 'eyebrow', type: 'string', validation: (rule) => rule.required().max(120)}),
    defineField({name: 'heroTitle', type: 'string', validation: (rule) => rule.required().min(2).max(120)}),
    defineField({name: 'heroDescription', type: 'text', rows: 3, validation: (rule) => rule.required().max(320)}),
    defineField({name: 'taskShortcuts', title: 'Goal shortcuts', type: 'array', of: [defineArrayMember({
      name: 'taskShortcut', type: 'object', fields: [
        defineField({name: 'label', type: 'string', validation: (rule) => rule.required().max(80)}),
        defineField({name: 'product', type: 'reference', to: [{type: 'product'}], options: {filter: ({document}) => ({filter: 'language == $language', params: {language: document.language ?? 'en'}})}, validation: (rule) => rule.required().custom(sameLanguage)}),
      ],
    })], validation: (rule) => rule.max(6).custom((value) => {
      const refs = (value || []).map((item) => (item as {product?: {_ref?: string}}).product?._ref).filter(Boolean)
      return refs.length === new Set(refs).size ? true : 'Each product can appear only once in goal shortcuts.'
    })}),
    defineField({name: 'featuredProducts', type: 'array', of: [defineArrayMember({type: 'reference', to: [{type: 'product'}], options: {filter: ({document}) => ({filter: 'language == $language', params: {language: document.language ?? 'en'}})}})], validation: (rule) => rule.unique().max(7).custom(sameLanguage)}),
    defineField({name: 'featuredCollections', type: 'array', of: [defineArrayMember({type: 'reference', to: [{type: 'collection'}], options: {filter: ({document}) => ({filter: 'language == $language', params: {language: document.language ?? 'en'}})}})], validation: (rule) => rule.unique().max(6).custom(sameLanguage)}),
    defineField({name: 'featuredArticles', type: 'array', of: [defineArrayMember({type: 'reference', to: [{type: 'article'}], options: {filter: ({document}) => ({filter: 'language == $language', params: {language: document.language ?? 'en'}})}})], validation: (rule) => rule.unique().max(6).custom(sameLanguage)}),
    defineField({name: 'resources', type: 'array', of: [defineArrayMember({
      name: 'resourceCard', type: 'object', fields: [
        defineField({name: 'title', type: 'string', validation: (rule) => rule.required().max(100)}),
        defineField({name: 'description', type: 'text', rows: 3, validation: (rule) => rule.required().max(320)}),
        defineField({name: 'linkLabel', type: 'string', validation: (rule) => rule.required().max(80)}),
        defineField({name: 'icon', type: 'string', options: {list: [{title: 'Book', value: 'book'}, {title: 'Support', value: 'support'}]}, validation: (rule) => rule.required()}),
        defineField({name: 'collection', type: 'reference', to: [{type: 'collection'}], options: {filter: ({document}) => ({filter: 'language == $language', params: {language: document.language ?? 'en'}})}, validation: (rule) => rule.custom(sameLanguage)}),
        defineField({name: 'searchQuery', type: 'string', validation: (rule) => rule.max(120)}),
      ],
      validation: (rule) => rule.custom((value) => {
        const card = value as {collection?: {_ref?: string}; searchQuery?: string} | undefined
        const hasCollection = Boolean(card?.collection?._ref)
        const hasSearch = Boolean(card?.searchQuery?.trim())
        return hasCollection !== hasSearch ? true : 'Choose exactly one destination: a collection or a search query.'
      }),
    })], validation: (rule) => rule.max(4)}),
    defineField({name: 'seo', type: 'object', fields: [
      defineField({name: 'title', type: 'string', validation: (rule) => rule.max(70)}),
      defineField({name: 'description', type: 'text', rows: 2, validation: (rule) => rule.max(170)}),
    ]}),
  ],
  preview: {select: {language: 'language'}, prepare: ({language: locale}) => ({title: `Home page (${locale || 'en'})`, subtitle: 'Localized singleton'})},
})

export const redirect = defineType({
  name: 'redirect', type: 'document', fields: [
    defineField({name: 'from', type: 'string', validation: (rule) => rule.required().custom((value) => !value || isLocalPath(value) ? true : 'Use a local absolute path without a query or fragment.')}),
    defineField({name: 'to', type: 'string', validation: (rule) => rule.required().custom((value) => !value || isLocalPath(value) ? true : 'Use a local absolute path without a query or fragment.')}),
    defineField({name: 'statusCode', type: 'number', initialValue: 301, options: {list: [301, 302, 307, 308]}, validation: (rule) => rule.required()}),
    language,
  ],
  validation: (rule) => rule.custom((value) => !value || value.from !== value.to ? true : 'A redirect cannot point to itself.'),
  preview: {select: {title: 'from', subtitle: 'to'}},
})