# Content model

[Architecture](architecture.md) · [Editorial workflow](editorial-workflow.md)

## Contract ownership

Studio definitions live in `apps/studio/schemas/`. Public query-result types and projections live in `packages/content/src/types.ts` and `queries.ts`; they are **handwritten, not Sanity TypeGen output**. Fixtures are original sample data, not an importer or a seeded cloud dataset.

Schema-valid published documents are assumed by the TypeScript contract. A `client.fetch<T>` annotation is not runtime validation of imported data. Validate legacy/imported records before publication; keep schema, projection, type, renderer, fixtures, and tests aligned when changing fields.

## Documents and web consumption

All seven document types include `language`; Studio and the web app support English (`en`) and Japanese (`ja`). CMS documents and demo catalogs are selected by locale, with no English-content fallback for missing Japanese content.

| Studio document | Fields and relationships | Public web use today |
| --- | --- | --- |
| `homePage` | `language`, hero eyebrow/title/description, product goal shortcuts, featured product/collection/article references, resource cards with exactly one collection/search destination, optional SEO | Homepage sections are read from the localized page document when published; existing i18n content is the safe fallback until then. |
| `product` | `title`, `slug`, `description`, stable `icon` key, nonnegative integer `order`, `language` | Product cards and landing pages; sorted by order then title. The home page uses the stored icon key. |
| `collection` | `title`, `slug`, `description`, optional `product` reference, `language` | Collection landing page. Missing product means a shared collection; the public result flattens a linked product to `productSlug`. |
| `article` | `title`, `slug`, `summary`, `language`, required `translationGroupId`, required `primaryCollection`, optional additional `collections`, one or more unique `products`, `contentType`, `body`, optional `reviewedAt`, `firstPublishedAt`, `seo` | Detail pages and summary lists; references become `collectionSlug`, `additionalCollectionSlugs`, and `productSlugs`. |
| `author` | Public `name`, optional `bio`, optional `portrait` using `imageWithCaption`, `language` | Schema only: no article-author reference, public author query, or author page is wired up. This is not an authentication identity. |
| `siteSettings` | `title`, `description`, `language`, safe navigation destination/label entries, footer copy/support label, up to six unique `featuredProducts` | The root shell uses published locale settings for brand label, header links, and footer copy; Studio opens fixed `siteSettings-en`/`siteSettings-ja` IDs. |
| `redirect` | Local absolute `from`/`to` paths, `statusCode` (301, 302, 307, 308), `language` | Missing article slugs resolve through published locale-scoped redirects. Self-targets are rejected; chain/loop checks and legacy-host routing remain future work. |

Article `contentType` choices are `guide`, `faq`, `troubleshooting`, `overview`, and `best-practice`. These classify articles; they do not select separate rendering engines.

### Validation and public fields

- Titles are required, 2–120 characters; descriptions are required, up to 320 characters. Article summaries are required, 10–320 characters.
- Slugs are lowercase letters/digits separated by single hyphens, at most 96 characters. Studio checks uniqueness by document type and language, excluding the document's own draft/published pair and release versions.
- Collection/product and article references are strong references. Studio validation requires published targets in the same language and rejects explicit draft/version reference IDs. Publish dependencies before the article.
- Article `translationGroupId` is a stable identifier shared across translated documents, not a slug or reference. Language switching requires a unique published target-language counterpart and uses its own slug; it does not assume matching article slugs. Although required by Studio, the field is optional in the public detail type. Translation completeness is not automatically enforced.
- Localized products and collections use the same stable ASCII slug across languages. Switching checks that the target catalog contains the document. Missing translations lead to the selected locale's root with `?translation=unavailable` and a localized notice, not English content.
- `reviewedAt` is shown as the public last-reviewed date when present. `firstPublishedAt` is editor-maintained, not automatically populated, and is **not** currently projected or rendered.
- `seo.title` and `seo.description` override article metadata; absent values fall back to the article title and summary. Schema limits are 70 and 170 characters respectively.
- Editorial validation is not access control. Never place confidential material in public body text, summaries, image metadata, or public profile fields. No internal notes belong in public documentation.

## Rich content → renderer mapping

`richContent` is a Portable Text array. Its public `PortableTextBlock` union combines upstream text blocks with the nine custom root object types. Rendering is in `apps/web/app/components/content/rich-content.tsx`.

| Schema member | Public shape | Rendered output |
| --- | --- | --- |
| `block` | Key, style, list metadata, explicit spans and link annotations | Portable Text paragraphs, H2/H3, quotes, bullet/number lists, strong/emphasis/code. H2/H3 anchors use `section-<block key>` and appear in article navigation. |
| `callout` | `tone` (`info`, `tip`, `warning`), optional `title`, required `text` | An `aside`, optional strong title, paragraph, and tone class; no raw HTML. |
| `codeBlock` | Required `code`, optional `language` | Escaped text in a semantic `<pre><code>` block; no executable markup or syntax-highlighting runtime. |
| `imageWithCaption` | `image.asset` projected to ID/URL, optional crop/hotspot, required `alt`, optional `caption` | Lazy-loaded image in a figure, optional figcaption. Only HTTPS `cdn.sanity.io/images/` URLs are accepted; width/format parameters are added. Crop/hotspot data is projected but not applied by the current renderer. |
| `animatedImageWithCaption` | Original GIF, animated WebP, or APNG file asset, required `alt`, optional `caption` | Renders the original HTTPS Sanity file asset without image transformations, preserving animation frames. Only `cdn.sanity.io/files/` is accepted. |
| `videoWithCaption` | MP4/WebM/Ogg video file, required title, optional poster/caption, WebVTT caption tracks and/or transcript | Native `<video controls>` player with metadata preload, no autoplay, optional poster/tracks, and expandable transcript. Studio requires captions or a transcript. |
| `audioWithTranscript` | MP3/MP4/Ogg/WAV/WebM/AAC audio file, required title and transcript, optional caption | Native `<audio controls>` player with expandable transcript. No autoplay. |
| `downloadableFile` | File asset, required title, optional caption | Safe Sanity-hosted download link; arbitrary external asset hosts and protocols are rejected. |
| `procedure` | Required `title`, 1–30 keyed steps with required title/description | Section with H2 anchor and ordered list of H3 step titles and text. The procedure title appears in article navigation. |
| `simpleTable` | Required caption, 1–8 column headers, 1–50 rows of matching cell counts | Focusable scroll region, semantic table/caption, column-header cells with `scope="col"`. Cells contain text, not nested rich content. |

Link annotations are checked in Studio and rechecked during rendering. The web helper permits HTTP(S), mailto, and safe relative/anchor links, rejecting dangerous protocols, protocol-relative URLs, control characters, and backslashes. Rejected link annotations render as text. Image URLs are restricted to the Sanity image CDN; media/download URLs are restricted to the Sanity file CDN and checked against supported MIME types. Animated images use original file URLs, not transformed image URLs. Video has controls and captions/transcript support; audio requires a transcript. React escapes text; arbitrary embedded HTML, iframes, and executable scripts are not supported body members.

When adding a body member, add its Studio schema, public union member, explicit nested projection, renderer, fixture, and tests together. Review accessibility and unknown/malformed input behavior; imported unsupported members must not be treated as automatically supported.

## Query boundary

The package exports catalog/detail queries `PRODUCTS_QUERY`, `PRODUCT_QUERY`, `COLLECTIONS_QUERY`, `COLLECTION_QUERY`, `ARTICLES_QUERY`, and `ARTICLE_QUERY`. These all require `$language`; the singular queries listed here also require `$slug` and return `null` when unmatched. Article language-switch resolution separately looks up published target-language documents by `translationGroupId` and requires a unique match.

Every entry query excludes draft and version IDs. The web client additionally selects the published perspective. Field whitelists apply recursively to spans, annotations, custom body members, image assets, and SEO. There are no document spreads; adding a CMS field does not automatically expose it to readers. Optional properties are conditionally projected rather than deliberately filled with nulls.

Article summaries omit bodies and SEO. They include the primary and additional collection slugs. Detail results add `body`, optional `translationGroupId`, and optional `seo`. New public fields require explicit changes to the contract and tests. `packages/content/tests/query-contract.test.ts` checks projection/filter expectations and fixture relationships; it does not prove live Sanity authorization or publishing behavior.

## Demo content

Each locale has six products (Inventory, Planner, Influence, Measure, CMS, Admin Console), three collections, and four short sample articles: twelve products, six collections, and eight articles across English and Japanese. The English `products`, `collections`, and `articles` exports remain unchanged. Japanese fixtures live separately in `fixtures.ja.ts` and are exported through `fixtures.ts` as `japaneseProducts` (6), `japaneseCollections` (3), and `japaneseArticles` (4). `content.server.ts` selects the requested locale's catalog rather than mixing languages.

`getting-started` and `best-practices` are shared collections; `inventory-imports` belongs to Inventory. Product and collection slugs are stable across locales; translated articles may have different slugs and are linked by translation group. Review dates are omitted rather than inventing an editorial review history. These fixtures neither seed nor provision Sanity. Replace sample material with human-reviewed, published documentation in each language before launch; Japanese CMS content is not translated or published automatically.