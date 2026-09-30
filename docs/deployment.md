# Deployment and security

[Overview](../README.md) · [Architecture](architecture.md) · [Editorial workflow](editorial-workflow.md) · [Search](search.md) · [Helpfulness](helpfulness.md)

## Deployment status

Production is deployed at `https://mwhelpcenter.netlify.app` using the Netlify React Router adapter. On 2026-09-30, the live production function was verified in Sanity mode against public project `vjmj7stb`, dataset `helpcenterdevelopment`; published content routes returned HTTP 200 without the demo banner. `pnpm sanity:verify --require-content` reported 7 products, 7 collections, and 172 English articles. Japanese article content has not been migrated. These checks do not replace ongoing editorial review of migrated assets/macros/tables or an unpublish/rollback rehearsal.

## Runtime and commands

Use pnpm **10.33.0**. `pnpm-workspace.yaml` sets `useNodeVersion: 22.23.3` and `nodeVersion: 22.23.3`; pnpm manages the project-local Node runtime. System Node 22.14 is not sufficient for all transitive Sanity tooling even though Studio's own package declares a lower minimum. The root engine range is `>=22.23.3 <23 || >=24`; the workspace's reproducible selection is 22.23.3. `.nvmrc` also pins it. Initial setup may download both dependencies and the runtime.

Local helpfulness imports native **`node:sqlite`** (`DatabaseSync`); deploy with the pinned Node runtime, not an edge/browser runtime or a separate SQLite npm driver. SQLite support does not provision persistent storage or establish production readiness.

| Root command | Behavior |
| --- | --- |
| `pnpm install` | Install workspace dependencies using the lockfile and configured runtime |
| `pnpm dev` | Start the web dev server on `127.0.0.1:4320` |
| `pnpm dev:studio` | Start Studio on loopback, standard port 3333 |
| `pnpm check` | Run lint → recursive typecheck → tests → both app builds |
| `pnpm build` | Build web, then Studio |
| `pnpm start` | Start the built web app via `react-router-serve ./build/server/index.js`; default port 3000 |
| `PORT=4320 pnpm start` | Override the web production server's listening port |

These instructions describe commands to run; they are not a record of passing checks. Production SSR requires a Node server and the web build's server/client output, not just a static HTML host. Studio is a separate deployment surface; `pnpm start` does not serve it. Hosting, TLS, domain routing, process supervision, and deployment automation must be selected and verified separately. Do not use the Vite development server as the production server.

`SITE_URL` controls canonical and sitemap origins, not the server port. For a local production server on port 3000, set a matching origin or deliberately use `PORT=4320` with the example origin.

## Environment files

An ignored root `.env` exists as a placeholder. `.env.example` at the root directs setup to the app-specific examples. Runtime configuration should be supplied through `apps/web/.env`, `apps/studio/.env`, or the hosting platform's environment settings. Do not commit runtime `.env` files; `.gitignore` exempts only `.env.example` templates.

Copy the app-specific example files to their corresponding `.env` paths for local configuration. The web server loads dotenv from its working directory; the root pnpm commands delegate execution to `apps/web`. If starting the server outside those commands, provide process environment values explicitly or ensure the working directory is correct.

Studio's CLI reads existing shell values first, then its app `.env`, then the root `.env` as a compatibility fallback, copying only nonempty public Studio identifiers. Prefer the app-specific file; this fallback is not a reason to put web tokens in shared or browser-facing configuration.

### Web: `apps/web/.env`

| Variable | Default/example | Purpose and restrictions |
| --- | --- | --- |
| `CONTENT_MODE` | `demo` | Only `demo` or `sanity`; explicitly choose `sanity` for real published content |
| `SITE_URL` | `http://localhost:4320` | Plain HTTP(S) origin; no credentials, path beyond `/`, query, or fragment. Use the public HTTPS origin in production. |
| `SANITY_PROJECT_ID` | `vjmj7stb` for production | Required in Sanity mode; must be a real project ID. Syntax validation alone cannot prove the project exists or access is authorized. |
| `SANITY_DATASET` | `helpcenterdevelopment` for production | Real dataset to read; accepted syntax is lowercase letters/digits/underscores/hyphens |
| `SANITY_API_VERSION` | `2025-02-19` | Pinned API date (`YYYY-MM-DD`), not a token or dataset version |
| `SANITY_READ_TOKEN` | Empty | Optional server-only least-privilege read token when dataset access requires it; no write/preview credential in client code |
| `SUPPORT_EMAIL` | Empty | Optional approved public support email; blank displays a pending-configuration message |
| `FEEDBACK_DB_PATH` | Unset | Sanity helpfulness disabled unless explicitly set; demo falls back to `data/helpfulness-demo.sqlite` relative to cwd. Use an absolute file path inside a dedicated PRIVATE local persistent directory for production. Never public/shared/network/serverless ephemeral storage. |

The shared environment schema validates configuration with Zod and reports invalid field names without serializing environment values. `FEEDBACK_DB_PATH` is read separately, trimmed and resolved against cwd; there is no path-safety validation. `SUPPORT_EMAIL` is intentionally sent to the public support page when configured; it is not a secret. The app only creates a mailto link—it does not send or store support requests.

### Studio: `apps/studio/.env`

| Variable | Fallback when blank | Purpose |
| --- | --- | --- |
| `SANITY_STUDIO_PROJECT_ID` | `vjmj7stb` | Public project identifier |
| `SANITY_STUDIO_DATASET` | `helpcenterdevelopment` | Public development dataset identifier |

`SANITY_STUDIO_*` values are browser-visible. **Never put tokens or secrets in them.** Studio editor authentication uses actual authorized project access, not the web server's read token.

## Demo versus Sanity mode

| Concern | Demo | Sanity |
| --- | --- | --- |
| Content | Bundled original samples | Published origin queries |
| Credentials | No content API credentials needed | Real project/dataset; optional read token depending on access |
| Failure behavior | Fixtures selected explicitly | Invalid configuration/upstream failures surface as errors; missing content remains empty/404, never sample fallback |
| Reader warning | Conspicuous sample-content banner | No demo banner |
| Indexing | `noindex, nofollow`; robots disallow all; empty sitemap | Canonical URLs and published-content sitemap; search stays noindex and robots-disallowed |
| Helpfulness | Local SQLite enabled by default; demo source label | Disabled unless `FEEDBACK_DB_PATH` is explicitly set; sanity source label, never automatic demo-store fallback |

Offline/demo use means no Sanity content service is needed after dependencies are installed. It does not mean Studio authentication/editing can work offline. Robots directives are crawler guidance, **not access control**; use hosting-level restrictions for confidential staging content. Sanity mode is not itself a staging noindex switch, so protect staging explicitly.

## Local helpfulness storage and hosting

With `apps/web` as cwd, demo's default file is private `apps/web/data/helpfulness-demo.sqlite`. Article reads can create/open the database even before anyone votes. For production opt-in, an operator must supply `FEEDBACK_DB_PATH` pointing to a database file in a dedicated **PRIVATE local persistent disk** directory outside public/static/build output and release cleanup. Do not use shared directories, network filesystems, or serverless ephemeral storage. Separate hosts' local files do not provide shared votes or global limits; this is not a distributed store.

**Path selection has side effects:** every open runs recursive `mkdir`, then unconditionally chmods the immediate parent directory to `0700`, including pre-existing directories, and the database to `0600`. Never point directly into an app root, home, `/tmp`, mount root or other shared directory: its permissions would be changed. Ancestors are not all secured or checked, parent symlinks are not rejected, and the initial database `O_NOFOLLOW` open is followed by a separate SQLite path open. These are not a sandbox or complete symlink/race protection. Use a trusted service-owned path and verify ownership, permissions and non-public placement yourself; the app does not enforce local/persistent/private placement.

The [helpfulness guide](helpfulness.md) details the success-only 30-day cookie, hashed visitor identifiers, best-effort deduplication, 90-day read expiry versus write-triggered row purge, and operator retention for WAL, backups and snapshots. The DB transaction limits accepted writes to **10 per visitor / 100 globally per rolling minute** across that file. It does not limit all incoming requests or protect origin reads and synchronous SQLite work; upstream hosting/proxy rate protection is still required. Verify HTTPS/origin forwarding, `Secure` cookies, `no-store`, disk capacity and recovery on the actual host before enabling. No public feedback report/dashboard or production storage service is supplied.

## Public content and security boundary

- Sanity content fetching is server-only. The client uses `perspective: 'published'`, `useCdn: false`, a 10-second timeout, and one retry. Public GROQ queries also exclude draft/version IDs and whitelist fields at every nested level.
- A read token must stay in the server environment, never loader data, browser bundles, URLs, or logs. Published reader content is public even if the underlying dataset requires a server token.
- Explicit projections limit what the web serializes; they do not change dataset permissions or prevent direct API access permitted by the actual Sanity access model. Configure dataset visibility and memberships deliberately.
- Studio validators are editorial guardrails, not authorization. Review the real provider roles and prevent confidential records from being placed in public content fields.
- React renders text without raw HTML injection. Link protocols and image hosts are checked in the renderer; unsupported images are omitted. Review imported URLs and assets rather than relying solely on authoring validation.
- The root response sets `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, and `Referrer-Policy: strict-origin-when-cross-origin`. Verify headers through the final host/proxy. CSP, HSTS, upstream request rate protection, monitoring, and other hosting controls require separate review; helpfulness's accepted-write limiter does not replace them.

## Freshness and future scaling

Content reads go to the Sanity origin on each request, without the content CDN or an application content cache. Root responses, robots, and sitemap use `no-store`. Unpublish freshness on a subsequent request therefore does not rely on a webhook; there is currently no webhook service. Sanity asset CDN image delivery is separate from content-query caching.

Do not add proxy/edge caching that overrides this behavior without a freshness design. For scale, plan bounded locale-aware caches, signed webhooks, publish/unpublish/delete invalidation, replay protection, retries, and reconciliation when webhook delivery fails. A hosted search index will need the same lifecycle and locale isolation. These systems are future work, not configured integrations.

## Pending launch gates

- [x] Run `pnpm check` with the intended pnpm/Node versions and verify the production SSR deployment.
- [x] Provision/select the Sanity project/dataset, authenticate Studio, and keep placeholders out of the production target.
- [x] Configure production runtime variables; align web and Studio to the Sanity project. No Sanity token is required for the current public dataset.
- [x] Import the Helpdesk content and verify the live site renders published content without the demo banner.
- [ ] Complete Admin editorial review of the 384 imported image alt texts, 28 macro callouts, 20 complex-table callouts, and four possible duplicate pairs.
- [ ] Decide whether/when to add reviewed Japanese translations; the current source export contained English articles only.
- [ ] Test the real draft/publish boundary: drafts and release versions remain absent, publishing appears, edits are withheld until published, and unpublishing removes content from detail/list/search/sitemap responses.
- [ ] Verify Sanity failures do not fall back to samples. Exercise invalid configuration, empty datasets, unavailable origin, missing slugs, and unsupported locales.
- [ ] Verify final-host headers, canonical origin, robots behavior, sitemap, HTTPS, staging access restrictions, and appropriate security policy.
- [ ] Check structured-content accessibility, keyboard/mobile behavior, links, approved support email, and [search's visible-body, snippet and bounded typo contract](search.md).
- [ ] If enabling helpfulness, review [private local storage and privacy](helpfulness.md), including parent chmod effects, persistent-disk ownership, WAL-aware backup/restore and retention, HTTPS cookies, upstream request protection, failure behavior and capacity. Otherwise leave Sanity helpfulness disabled.
- [ ] Complete the authorized [migration and redirect plan](migration.md), durable asset checks, and rollback rehearsal before changing legacy traffic.
- [ ] Assign manual editorial review/publishing ownership; do not describe approvals, draft preview, or scheduling as enforced/configured until separately verified.
- [ ] Establish operational monitoring, recovery/backup ownership, and capacity expectations. Keep caching/indexing off until their invalidation and signed-webhook design is implemented and tested.

Additional languages, production feedback operations/reporting, hosted search, draft preview, signed webhooks, migration automation, and in-product help remain outside the configured launch implementation. Local search/helpfulness implementation is not evidence of an actual Sanity connection, provisioning, publishing, or production readiness.