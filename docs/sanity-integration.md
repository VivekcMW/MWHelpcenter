# Sanity integration

The application is configured for Sanity project `vjmj7stb`. The organisation ID belongs to Sanity administration only; do not put it in application configuration.

The configured public dataset `helpcenterdevelopment` is reachable. The latest verification found zero published products, collections, or articles; publish content before expecting populated pages.

## Repository setup

The web app reads published content only. Its server-side Sanity configuration is in `apps/web/.env`; Studio's browser-visible identifiers are in `apps/studio/.env`.

```text
# apps/web/.env
CONTENT_MODE=sanity
SITE_URL=http://localhost:4320
SANITY_PROJECT_ID=vjmj7stb
SANITY_DATASET=helpcenterdevelopment
SANITY_API_VERSION=2025-02-19
SANITY_READ_TOKEN=

# apps/studio/.env
SANITY_STUDIO_PROJECT_ID=vjmj7stb
SANITY_STUDIO_DATASET=helpcenterdevelopment
```

`SANITY_READ_TOKEN` is optional for a public dataset. For a private dataset, create a least-privilege read token and set it only in the web server environment. Do not place a token in `SANITY_STUDIO_*`, browser code, GitHub secrets that are exposed to client builds, or source control.

Verify the configured dataset with:

```text
pnpm sanity:verify
pnpm sanity:verify --require-content
```

The first command checks connectivity and reports published document counts. The second additionally fails when the entire published dataset is empty. Both commands reject incomplete public article relationships and duplicate language/translation-group pairs.

## Required owner actions

These actions require a user with access to the Sanity organisation and cannot be completed from this repository:

1. In Sanity Manage, open project `vjmj7stb` and create the `development` dataset. Create a separate `production` dataset before launch.
2. The existing public development dataset is named `helpcenterdevelopment`; it is configured locally. Invite the approved administrators, editors, reviewers, and publishers. Studio validation does not enforce an approval workflow.
3. Choose dataset visibility. If a dataset is private, create a read-only token for the web server and store it directly in Netlify's encrypted environment settings.
4. Configure CORS origins for local Studio (`http://localhost:3333`) and the final deployed Studio origin. Do not grant broad wildcard origins.
5. Start Studio locally, sign in, and publish products before collections and articles. Populate both English and Japanese content; the site never substitutes English for missing Japanese content.
6. Create a separate Studio deployment through the Sanity CLI once a public Studio hostname is approved. Add its origin to Sanity CORS settings.
7. In Netlify, add production environment variables:
   - `CONTENT_MODE=sanity`
   - `SITE_URL=<canonical HTTPS site origin>`
   - `SANITY_PROJECT_ID=vjmj7stb`
   - `SANITY_DATASET=production`
   - `SANITY_API_VERSION=2025-02-19`
   - `SANITY_READ_TOKEN=<read-only token>` only for a private dataset.
8. Redeploy, run `pnpm sanity:verify --require-content` against production, then verify published and unpublished behavior in the live site.

## Content and launch gates

- Publish products first, then collections, then articles with same-language references.
- Articles require title, slug, summary, locale, translation group, primary collection, at least one product, content type, and rich body content.
- Use the same `translationGroupId` for translated article pairs, while allowing translated slugs to differ.
- Validate SEO, links, image alt text, and public review dates before publishing.
- Confirm drafts never appear in the public site. The current integration has no draft-preview route, publishing webhook, cache invalidation system, or runtime redirect lookup.
- Do not switch the public website to the production dataset until real reviewed content passes the verifier and route smoke tests.