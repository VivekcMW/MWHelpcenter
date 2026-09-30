// Public projections only. Also configure the web client with perspective: 'published'.
const visible = 'language == $language && !(_id in path("drafts.**")) && !(_id in path("versions.**"))'

const productFields = `_id, title, "slug": slug.current, description, icon, order, language`
const collectionFields = `_id, title, "slug": slug.current, description, language,
  defined(product->slug.current) => {"productSlug": product->slug.current}`
const articleSummaryFields = `_id, title, "slug": slug.current, summary, language,
  "productSlugs": coalesce(products[]->slug.current, []),
  defined(primaryCollection->slug.current) => {"collectionSlug": primaryCollection->slug.current},
  "additionalCollectionSlugs": coalesce(collections[]->slug.current, []),
  contentType, defined(reviewedAt) => {reviewedAt}`

// Nested fields are whitelisted too: never spread body, image assets or markDefs.
const bodyFields = `_key, _type,
  _type == "block" => {
    style, defined(listItem) => {listItem}, defined(level) => {level},
    children[]{_key, _type, text, marks}, markDefs[]{_key, _type, href}
  },
  _type == "callout" => {tone, defined(title) => {title}, text},
  _type == "codeBlock" => {defined(language) => {language}, code},
  _type == "imageWithCaption" => {
    image{_type, asset->{_id, url},
      defined(crop) => {crop{top, bottom, left, right}},
      defined(hotspot) => {hotspot{x, y, width, height}}
    }, alt, defined(caption) => {caption}
  },
  _type == "animatedImageWithCaption" => {
    file{_type, asset->{_id, url, mimeType, originalFilename, size}}, alt,
    defined(caption) => {caption}
  },
  _type == "videoWithCaption" => {
    video{_type, asset->{_id, url, mimeType, originalFilename, size}},
    title, defined(caption) => {caption}, defined(transcript) => {transcript},
    poster{_type, asset->{_id, url},
      defined(crop) => {crop{top, bottom, left, right}},
      defined(hotspot) => {hotspot{x, y, width, height}}
    },
    captions[]{_key, language, label, file{_type, asset->{_id, url, mimeType, originalFilename, size}}}
  },
  _type == "audioWithTranscript" => {
    audio{_type, asset->{_id, url, mimeType, originalFilename, size}},
    title, defined(caption) => {caption}, transcript,
    captions[]{_key, language, label, file{_type, asset->{_id, url, mimeType, originalFilename, size}}}
  },
  _type == "downloadableFile" => {
    file{_type, asset->{_id, url, mimeType, originalFilename, size}},
    title, defined(caption) => {caption}
  },
  _type == "procedure" => {title, steps[]{_key, _type, title, description}},
  _type == "simpleTable" => {caption, columns, rows[]{_key, _type, cells}}`

export const PRODUCTS_QUERY = `*[_type == "product" && ${visible}] | order(order asc, title asc){${productFields}}`
export const PRODUCT_QUERY = `*[_type == "product" && ${visible} && slug.current == $slug][0]{${productFields}}`
export const COLLECTIONS_QUERY = `*[_type == "collection" && ${visible}] | order(title asc){${collectionFields}}`
export const COLLECTION_QUERY = `*[_type == "collection" && ${visible} && slug.current == $slug][0]{${collectionFields}}`
export const REDIRECT_QUERY = `*[_type == "redirect" && ${visible} && from == $from][0]{from, to, statusCode, language}`
export const ARTICLES_QUERY = `*[_type == "article" && ${visible}] | order(title asc){${articleSummaryFields}}`
// Search-only, server-side projection. No annotation URLs, assets, alt text,
// keys, SEO or editorial metadata; only text rendered by supported body types.
export const SEARCH_ARTICLES_QUERY = `*[_type == "article" && ${visible}] | order(title asc){
  ${articleSummaryFields}, body[]{_type,
    _type == "block" => {children[_type == "span"]{_type, text}},
    _type == "callout" => {title, text},
    _type == "codeBlock" => {code},
    _type == "procedure" => {title, steps[]{title, description}},
    _type == "simpleTable" => {caption, columns, rows[]{cells}},
    _type == "imageWithCaption" => {caption},
    _type == "animatedImageWithCaption" => {caption},
    _type == "videoWithCaption" => {title, caption, transcript},
    _type == "audioWithTranscript" => {title, caption, transcript},
    _type == "downloadableFile" => {title, caption}
  }
}`
// Fetch up to two matches so the switcher can reject ambiguous translation groups.
export const ARTICLE_TRANSLATIONS_QUERY = `*[_type == "article" && ${visible} && translationGroupId == $translationGroupId][0..1]{"slug": slug.current}`
export const ARTICLE_QUERY = `*[_type == "article" && ${visible} && slug.current == $slug][0]{
  ${articleSummaryFields}, body[]{${bodyFields}},
  defined(translationGroupId) => {translationGroupId},
  defined(seo) => {seo{defined(title) => {title}, defined(description) => {description}}}
}`