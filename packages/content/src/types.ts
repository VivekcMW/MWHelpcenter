import type {PortableTextBlock as TextBlock} from '@portabletext/types'

// Handwritten PUBLIC query result contract, not generated Sanity document types.
export interface Product {
  _id: string
  title: string
  slug: string
  description: string
  icon: string
  order: number
  language: string
}

export interface Collection {
  _id: string
  title: string
  slug: string
  description: string
  language: string
  productSlug?: string
}

export interface ArticleSummary {
  _id: string
  title: string
  slug: string
  summary: string
  language: string
  productSlugs: string[]
  collectionSlug?: string
  contentType: string
  reviewedAt?: string
}

export interface Callout {
  _key: string
  _type: 'callout'
  tone: 'info' | 'tip' | 'warning'
  title?: string
  text: string
}

export interface ImageWithCaption {
  _key: string
  _type: 'imageWithCaption'
  image: {
    _type: 'image'
    asset: {_id: string; url: string}
    crop?: {top: number; bottom: number; left: number; right: number}
    hotspot?: {x: number; y: number; width: number; height: number}
  }
  alt: string
  caption?: string
}

export interface Procedure {
  _key: string
  _type: 'procedure'
  title: string
  steps: Array<{_key: string; _type: 'procedureStep'; title: string; description: string}>
}

export interface SimpleTable {
  _key: string
  _type: 'simpleTable'
  caption: string
  columns: string[]
  rows: Array<{_key: string; _type: 'tableRow'; cells: string[]}>
}

// Portable Text permits custom root objects, not only standard text blocks.
// Preserve the upstream block definition while covering every Studio body member.
export type PortableTextBlock = (TextBlock & {_type: 'block'}) | Callout | ImageWithCaption | Procedure | SimpleTable

export interface Article extends ArticleSummary {
  body: PortableTextBlock[]
  translationGroupId?: string
  seo?: {title?: string; description?: string}
}