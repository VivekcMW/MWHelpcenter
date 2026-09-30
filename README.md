# Moving Walls Help Center

A new, standalone help-center implementation: server-rendered React web app, Sanity Studio, and a shared public content contract. This is not a recovered version of the previously named React repository. The existing `movingwalls-help-page` static site and `mw-helpcenter-wireframes` prototype remain separate and unchanged.

## Stack

- pnpm **10.33.0** workspace: `apps/web`, `apps/studio`, `packages/content`.
- Web: React **19.3.0**, TypeScript **5.9.3**, React Router **7.18.4** framework SSR, Vite **7.3.6**.
- Studio: Sanity **6.16.0**; localization: i18next **26.4.2** / react-i18next **17.0.15**.
- `pnpm-workspace.yaml` pins both `useNodeVersion` and `nodeVersion` to **22.23.3**. pnpm uses project-local Node; system Node 22.14 is insufficient for transitive tooling in the Sanity dependency tree. `.nvmrc` also specifies 22.23.3.
- Local article helpfulness uses SQLite through native `node:sqlite` on the pinned Node runtime, not a hosted database service.

## Local demo

From the repository root, with pnpm 10.33.0 available:

1. Run `pnpm install` (initial dependency/runtime downloads require network access).
2. Run `pnpm dev`; open `http://localhost:4320/en`.
3. Optionally run `pnpm dev:studio` in another terminal; Studio uses its standard port **3333**.

`CONTENT_MODE=demo` is the default. The web app uses original illustrative fixtures without Sanity credentials or content API access. After dependencies are installed, demo content works offline. It displays a conspicuous sample-content banner, adds `noindex, nofollow`, disallows crawling in `robots.txt`, and returns an empty sitemap. These fixtures are neither verified product instructions nor an imported/seeded dataset. Studio editing still requires a real project and authorized access.

Demo helpfulness defaults to private `apps/web/data/helpfulness-demo.sqlite` when the working directory is `apps/web` (as with the root pnpm web commands). Article reads can initialize this store; only a successful vote creates a visitor cookie. Sanity mode disables helpfulness unless `FEEDBACK_DB_PATH` explicitly selects a dedicated **PRIVATE local persistent disk** location. Never use a public, shared, network, or serverless ephemeral directory. The store chmods its immediate parent to `0700`, including existing directories: read the [helpfulness storage and privacy guide](docs/helpfulness.md) before choosing a path.

English (`/en`) and Japanese (`/ja`) are available through the header's native **English / 日本語** dropdown, including on error pages. It submits automatically with JavaScript and offers a submit button without JavaScript. Each demo locale has six products, three collections, and four sample articles. Language is URL-only; `/` defaults to `/en`, with no locale cookie.

## Real content setup

Copy `apps/web/.env.example` to `apps/web/.env` and `apps/studio/.env.example` to `apps/studio/.env`. Runtime configuration belongs in those app directories or the deployment environment, not the ignored root placeholder `.env`.

Set the web app to `CONTENT_MODE=sanity` with a real project ID, dataset, API version, and public `SITE_URL`. Set matching public Studio identifiers. Use an optional least-privilege `SANITY_READ_TOKEN` only on the web server when dataset access requires it; never expose it through Studio variables. See [deployment](docs/deployment.md) for the complete environment table and pending launch gates.

The Studio fallback project ID `mwhelpcenter` is a syntax-only placeholder, with dataset `development`. **No cloud project provisioning, authentication, or live publishing verification is established by this repository.** Sanity mode does not silently fall back to demo content on empty results, configuration errors, or upstream failures.

Studio supports English and Japanese documents, but real Japanese content must still be translated, human-reviewed, and published in your CMS. It is not provisioned or translated automatically. Missing translations do not substitute English content: language switching leads to the selected locale's home page with a localized unavailable-translation notice.

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Web development server, port 4320 |
| `pnpm dev:studio` | Studio development server, standard port 3333 |
| `pnpm check` | Lint, typecheck, tests, then web and Studio builds |
| `pnpm build` | Build both apps |
| `pnpm start` | Serve the built web app using `react-router-serve`; default port 3000 |
| `PORT=4320 pnpm start` | Serve the built web app on port 4320 instead |

These are available commands, not a statement that checks or live deployment have passed. Set `SITE_URL` to the actual public origin; it does not control the listening port.

## Implemented versus next steps

Implemented: English and Japanese product/collection/article routes and UI bundles, translation-aware language switching, structured article rendering, locale-specific title/summary/visible-body search with product filtering, bounded English typo matching and highlighted snippets, local SQLite article helpfulness, explicit published-only server queries, and isolated i18next instances. Article switching resolves a unique published counterpart by translation group rather than assuming equal slugs; product/collection switching checks shared stable slugs in the target catalog. Content reads use the origin on each request, with no Sanity content CDN or application content cache and `no-store` responses.

Not configured: enforced editorial approvals, draft preview, signed webhooks, caching, production helpfulness storage/operations, a public feedback report or dashboard, hosted search, migration/import tooling, languages beyond English and Japanese, automatic translation, alternate-language `hreflang`, or in-product help. Studio has native draft/publish editing; scheduling depends on the Sanity plan and separate setup. Canonical URLs use the current pathname, and the sitemap already iterates registered locales.

## Guides

- [Movingwalls design system](docs/design-system.md)
- [Architecture and file tree](docs/architecture.md)
- [Content model and renderer mapping](docs/content-model.md)
- [Editorial workflow and responsibility boundaries](docs/editorial-workflow.md)
- [Localization](docs/localization.md)
- [Search behavior and offline verification](docs/search.md)
- [Local article helpfulness, privacy, and operations](docs/helpfulness.md)
- [Deployment, security, and launch gates](docs/deployment.md)
- [Migration plan](docs/migration.md)