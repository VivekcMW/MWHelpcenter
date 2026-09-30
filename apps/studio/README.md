# Moving Walls Studio

Sanity 6.16.0, React 19.3.0, TypeScript 5.9.3; Node 22.14+. Structure tool only. From the monorepo: `pnpm --filter @mw/studio dev`, `build`, or `typecheck` (repeat the filter for each command). Dependencies are declared, not installed here.

## Configuration and scope

No real Sanity project, dataset, authentication, users, deployment or cloud resources have been created. `mwhelpcenter` is a syntactically valid **offline configuration/build placeholder**, not a provisioned project. Dataset fallback is `development`. Studio can build with placeholders, but connected editing requires a real project and authorized login; this is not an offline CMS.

The CLI loads nonempty public identifiers from shell variables first, then `apps/studio/.env`, then root `.env`, without dotenv logging. Blank local placeholders do not shadow root values; if none are configured, the offline fallbacks apply. `.env.example` documents `SANITY_STUDIO_PROJECT_ID` and `SANITY_STUDIO_DATASET`. These are public identifiers, never secrets. A local ignored `.env` is supplied with empty placeholders. No token or preview endpoint is configured.

## Public content and localization

Documents: product, collection, article, author, siteSettings and redirect. Rich content: Portable Text, callout, accessible image with caption, numbered procedure and simple table. Strong references, matching-language validation, locale-scoped slug uniqueness and public-safe field projections live alongside the handwritten `@mw/content` contract. Publish products and collections before validating articles. Collections may be shared (no product reference). Article products are explicit; a collection does not automatically populate them.

Localization is document-level, initially `en`. Extend the language list before adding locales; each article translation has its own document/slug and shares a stable `translationGroupId`. Translation linking UI, duplicate-group checks, locale completeness, fallback routing and translation automation are future work. Public clients must pass the requested language; queries do not silently fall back to English.

Author documents contain only public names, bios and portraits; they are not Sanity users. Article `reviewedAt` / `firstPublishedAt` are editor-maintained public dates, not approval or audit records. Public schemas deliberately contain no private notes, internal approvals or credentials. Keep future private editorial records in separately permissioned storage, never in a public dataset: projection whitelists alone are **not** access control.

Sanity's normal document actions remain available. Custom review/publish actions, private editorial records, role-based permission enforcement and server-side publishing checks are **future configuration, not implemented features**. Hiding Studio UI or adding validation does not enforce permissions. Site settings are not yet a singleton; redirects are only modeled, not executed. Cross-document redirect-loop/duplicate checks and safe redirect serving must be implemented before enabling redirects on the web.

The shared package uses original **sample content**, not verified Moving Walls documentation. No seed/import, preview, TypeGen generation or automatic publishing is performed. Root workspace registration and web integration are owned separately.