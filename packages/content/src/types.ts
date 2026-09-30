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

export interface ContentRedirect {
  from: string
  to: string
  statusCode: 301 | 302 | 307 | 308
  language: string
}

export interface ArticleSummary {
  _id: string
  title: string
  slug: string
  summary: string
  language: string
  productSlugs: string[]
  collectionSlug?: string
  additionalCollectionSlugs?: string[]
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

export interface CodeBlock {
  _key: string
  _type: 'codeBlock'
  language?: string
  code: string
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

export interface SanityFileAsset {
  _id: string
  url: string
  mimeType: string
  originalFilename?: string
  size?: number
}

export interface AnimatedImageWithCaption {
  _key: string
  _type: 'animatedImageWithCaption'
  file: {_type: 'file'; asset: SanityFileAsset}
  alt: string
  caption?: string
}

export interface VideoCaptionTrack {
  _key: string
  language: string
  label: string
  file: {_type: 'file'; asset: SanityFileAsset}
}

export interface VideoWithCaption {
  _key: string
  _type: 'videoWithCaption'
  video: {_type: 'file'; asset: SanityFileAsset}
  title: string
  poster?: {
    _type: 'image'
    asset: {_id: string; url: string}
    crop?: {top: number; bottom: number; left: number; right: number}
    hotspot?: {x: number; y: number; width: number; height: number}
  }
  caption?: string
  captions?: VideoCaptionTrack[]
  transcript?: string
}

export interface AudioWithTranscript {
  _key: string
  _type: 'audioWithTranscript'
  audio: {_type: 'file'; asset: SanityFileAsset}
  title: string
  caption?: string
  captions?: VideoCaptionTrack[]
  transcript: string
}

export interface DownloadableFile {
  _key: string
  _type: 'downloadableFile'
  file: {_type: 'file'; asset: SanityFileAsset}
  title: string
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
export type PortableTextBlock = (TextBlock & {_type: 'block'}) | Callout | CodeBlock | ImageWithCaption | AnimatedImageWithCaption | VideoWithCaption | AudioWithTranscript | DownloadableFile | Procedure | SimpleTable

export interface Article extends ArticleSummary {
  body: PortableTextBlock[]
  translationGroupId?: string
  seo?: {title?: string; description?: string}
}