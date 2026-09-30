# @mw/content

Handwritten public result types, explicit GROQ queries and original **sample** fixtures for the Moving Walls OOH help center. This is not generated TypeGen output, official product documentation or a seed dataset. No cloud project, credentials or content imports are included.

## Exports

- `@mw/content`: `Product`, `Collection`, `ArticleSummary`, `Article`, rich-content types, and the six query constants.
- `@mw/content/queries`: `PRODUCTS_QUERY`, `COLLECTIONS_QUERY`, `ARTICLES_QUERY`, `ARTICLE_QUERY`, `PRODUCT_QUERY`, `COLLECTION_QUERY`.
- `@mw/content/fixtures`: `products`, `collections`, `articles` (six products, three collections, four articles).

Exports point to TypeScript source; consuming bundlers must support workspace TS. The root owner must include `apps/*` and `packages/*` in `pnpm-workspace.yaml`, install dependencies, and supply Vitest. Use `pnpm --filter @mw/content typecheck`; the focused root test target is `packages/content/tests/query-contract.test.ts`. This package declares stable `@portabletext/types` 4.0.2.

## Query contract

Every query requires `$language`; singular queries also require `$slug` and return `null` if unmatched. All entry queries exclude `drafts.**` and `versions.**`. Web clients must additionally use `perspective: 'published'`, without exposing a write/preview token. Reference projections use `products[]->slug.current` and `primaryCollection->slug.current`; Studio validates strong same-language references. These queries select records, not product/collection landing-page aggregates: join/filter article summaries by `productSlugs` / `collectionSlug` in the consumer.

Optional properties are conditionally projected rather than filled with GROQ `null`. Required types assume schema-valid published documents; validate externally imported/legacy data before treating it as this contract. Every level uses explicit whitelists, including Portable Text spans, link annotations, custom objects and image asset IDs/URLs. New CMS fields are not automatically exposed. The article detail contract intentionally omits `firstPublishedAt`, which remains a public editor-maintained schema field; add it explicitly to both types and projection if the web needs it. No internal notes/approval fields are modeled.

`PortableTextBlock` is a local union of upstream `@portabletext/types` text blocks and `callout`, `imageWithCaption`, `procedure`, `simpleTable` objects. An upstream text-block-only array would incorrectly exclude custom root objects. Web rendering must supply custom components, escape text, revalidate link URLs, handle unknown content defensively and provide accessible image/table markup. This package has no HTML renderer.

## Localization and future work

English (`en`) is the initial locale. Article translations are separate documents linked by `translationGroupId`, with locale-scoped slugs. No implicit locale fallback, translation automation or group uniqueness enforcement is implemented. Fixtures omit review dates rather than invent an editorial review history. Replace all sample copy with approved, verified documentation before launch.

Future TypeGen work: extract the real configured Studio schema, adopt statically discoverable named GROQ queries, generate source-document/query result types, then reconcile those generated results with this explicit public contract. No schema extraction or generation has been run. Private editorial records, publishing actions and permission enforcement belong to future separately secured configuration; Studio validation and public projections are not authorization boundaries.