# Moving Walls Studio

Sanity Studio 6.16, React 19.3, TypeScript 5.9; Node 22.14+. The configured project is `vjmj7stb`, dataset `helpcenterdevelopment`. From the monorepo, use `pnpm --filter @mw/studio dev`, `build`, or `typecheck`.

## Studio navigation

The structure is arranged around the public site:

- **Home & site settings**: fixed editor entries for English and Japanese. The preferred IDs are `homePage-en`, `homePage-ja`, `siteSettings-en`, and `siteSettings-ja`; this is Studio navigation, not a server-enforced singleton constraint.
- **Products**: ordered by the product's `order` field.
- **Collections** and **Articles**: the reader hierarchy is product → collection → article. An article has one primary collection for breadcrumbs and may have additional collections for curated shared lists.
- **Authors** and **Article redirects**: public contributor records and locale-scoped article redirects.

## Home page and site settings

The localized `homePage` document owns the hero, product goal shortcuts, featured products, collections and articles, resource cards, and SEO values. References are same-language Sanity references; resource links are either a collection reference or a search query, never an arbitrary external URL. `siteSettings` owns the locale's brand metadata, fixed-set primary navigation destinations, and footer/support labels.

The web app reads published records only. When a locale has no published homepage or settings document, its existing localized UI fallback remains. English homepage and settings records are seeded from the existing public English UI copy. Japanese product, collection, article, homepage and settings records have not been published as a CMS catalog; the website does not substitute English CMS content for Japanese.

## Content and publishing

Document types: `homePage`, `siteSettings`, `product`, `collection`, `article`, `author`, and `redirect`. Article Portable Text supports paragraphs/headings, callouts, code blocks, images, animated images, video/captions/transcripts, audio/transcripts, downloadable files, procedures, and tables. Additions must remain aligned across schema, public types, GROQ projections, renderer, fixtures and tests.

Products and collections should be published before articles that reference them. References are validated for language and published targets; editorial validation does not enforce reviewer/publisher roles or approval. Native Sanity draft/publish is available. No authenticated web preview or editorial approval workflow is configured.

The web resolves published `redirect` documents for missing article paths and accepts safe local targets only. It does not execute redirect chains or provide legacy-host routing. Never put credentials, internal approval notes, or private account data in the public dataset. Migration tools that publish content require the separate, ignored `.env.migration` credentials; do not expose those values in client bundles or chat.
