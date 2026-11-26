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

For Netlify, set runtime variables in the Netlify UI, CLI, or API with a scope that includes **Functions**; values in `netlify.toml` are not available to Functions at runtime. Environment changes require a new deployment. See [Netlify's function environment documentation](https://docs.netlify.com/build/functions/environment-variables/).

### Web: `apps/web/.env`

| Variable | Default/example | Purpose and restrictions |
| --- | --- | --- |
| `CONTENT_MODE` | `demo` | Only `demo` or `sanity`; explicitly choose `sanity` for real published content |
| `SITE_URL` | `http://localhost:4320` | Plain HTTP(S) origin; no credentials, path beyond `/`, query, or fragment. Use the public HTTPS origin in production. |
| `SANITY_PROJECT_ID` | `vjmj7stb` for production | Required in Sanity mode; must be a real project ID. Syntax validation alone cannot prove the project exists or access is authorized. |
| `SANITY_DATASET` | `helpcenterdevelopment` for production | Real dataset to read; accepted syntax is lowercase letters/digits/underscores/hyphens |
| `SANITY_API_VERSION` | `2025-02-19` | Pinned API date (`YYYY-MM-DD`), not a token or dataset version |
| `SANITY_READ_TOKEN` | Empty | Optional server-only least-privilege read token when dataset access requires it; no write/preview credential in client code |
| `ANTHROPIC_API_KEY` | Empty | Optional server-only key for HelpChat AI answers. The chat sends user questions and selected published article excerpts to Anthropic; never expose or commit this key. |
| `HELP_CHAT_ENABLED` | `false` | Set to `true` only after configuring the key, shared quota, and abuse controls. A disabled or unconfigured chat returns an unavailable message. |
| `HELP_CHAT_METRICS` | `false` | When enabled, log per-request outcome, locale, duration, provider/tool-call counts, token usage and citation count; never chat text or source content. Follow the host's log retention policy. |
| `HELP_CHAT_DATABASE_URL` | Empty | Server-only PostgreSQL connection URL for the shared HelpChat quota. A missing, inaccessible, or unprovisioned database makes chat unavailable. TLS `sslmode=verify-full` is required except for localhost in development or tests. |
| `HELP_CHAT_REQUESTS_PER_MINUTE` | `1000` | Global fixed UTC-minute request quota shared across instances. |
| `HELP_CHAT_REQUESTS_PER_DAY` | `10000` | Global fixed UTC-day request quota shared across instances. |
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
- HelpChat uses Anthropic's Messages API only on the server and searches the published locale catalog before answering. Answers contain only verbatim passages verified against the retrieved excerpts, with links to their guides; a localized clarification is used when the model finds insufficient evidence. Verbatim matching prevents invented wording but cannot guarantee relevance or that a passage is not misleading out of context. Review real answers against complete source content.
- Chat history is held in the browser while the component is mounted; up to two previous exchanges are sent with the next question. The support link places the last three questions in an editable draft in browser navigation state, not the page URL. Opening an email app requires a separate user action and does not send an email automatically.
- HelpChat reserves one request in the PostgreSQL quota before reading the catalog or calling the model. Its global fixed-window limits apply across instances and failed requests consume quota; they are not per-visitor limits, a rolling-window limit, or a monetary spending cap. A single visitor can exhaust the shared quota. Configure platform-level per-client rate limiting/abuse protection, provider budget alerts and usage monitoring before unrestricted production traffic. Keep `HELP_CHAT_ENABLED=false` until these controls are verified.
- Optional chat metrics cover server responses after validation, not every incoming/rejected request. Token counts are provider-reported input/output values, not billing totals; use provider-side usage and billing for cost monitoring. There is no resolution-rate tracking or satisfaction collection for chat.
- Explicit projections limit what the web serializes; they do not change dataset permissions or prevent direct API access permitted by the actual Sanity access model. Configure dataset visibility and memberships deliberately.
- Studio validators are editorial guardrails, not authorization. Review the real provider roles and prevent confidential records from being placed in public content fields.
- React renders text without raw HTML injection. Link protocols and image hosts are checked in the renderer; unsupported images are omitted. Review imported URLs and assets rather than relying solely on authoring validation.
- The root response sets `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, and `Referrer-Policy: strict-origin-when-cross-origin`. Verify headers through the final host/proxy. CSP, HSTS, upstream request rate protection, monitoring, and other hosting controls require separate review; helpfulness's accepted-write limiter does not replace them.

### HelpChat production setup

1. Keep `HELP_CHAT_ENABLED=false` while configuring and testing. Provision a PostgreSQL database accessible from all production Functions instances, with TLS certificate and hostname verification. Run [`help-chat-quota.sql`](../apps/web/scripts/help-chat-quota.sql) once using an administrator connection. The script creates and seeds one aggregate counter row without storing questions, IP addresses, or other visitor data. Do not delete or reset it during operation: doing so weakens the quota.
2. Grant the runtime database role only the required schema access and `SELECT` and `UPDATE` on `help_chat_quota`. Use one shared database and schema for all production instances. Set `HELP_CHAT_DATABASE_URL` as a secret in Netlify's Functions environment, using a PostgreSQL URL with `sslmode=verify-full` and a trusted certificate. Never put credentials in the repository or browser code.
3. Configure `ANTHROPIC_API_KEY`, `SUPPORT_EMAIL`, `HELP_CHAT_REQUESTS_PER_MINUTE`, and `HELP_CHAT_REQUESTS_PER_DAY` in Netlify's production Functions environment. The configured initial global limits are 1,000 per UTC minute and 10,000 per UTC day; assess their cost and capacity before rollout. Each accepted request can make up to three provider calls, and this quota does not cap dollars or tokens.
4. Configure provider-side spending controls or alerts, per-client edge abuse controls, and monitoring. Deploy with chat disabled; verify the support email and database connectivity without exposing credentials. Then set `HELP_CHAT_ENABLED=true` and redeploy. Verify real synthetic questions, citations, quota rejection, support handoff, and function logs on the deployed version. Verify rollback and disable procedures.

The quota fails closed if the database or its seeded row is unavailable. Counters reset on UTC fixed-window boundaries, so bursts can span a boundary. The limiter does not shield the database or server from request floods; use upstream protection. Use a connection-pooling service if the database cannot handle connections from many serverless instances. Local integration tests can be run against a dedicated local database named `helpchat_quota_test` after applying the SQL, by setting `HELP_CHAT_TEST_DATABASE_URL` and running `pnpm exec vitest run apps/web/tests/help-chat-quota.integration.test.ts`; never point it at a shared database.

## Freshness and future scaling

Content reads go to the Sanity origin on each request, without the content CDN or an application content cache. Root responses, robots, and sitemap use `no-store`. Unpublish freshness on a subsequent request therefore does not rely on a webhook. Sanity asset CDN image delivery is separate from content-query caching.

The separate [Confluence sync service](confluence-sync.md) has code for signed webhook ingestion and PostgreSQL-backed retries, but it is not deployed or configured. It creates drafts only and does not invalidate reader caches.

Do not add proxy/edge caching that overrides this behavior without a freshness design. For scale, plan bounded locale-aware caches and publish/unpublish/delete invalidation. A hosted search index will need the same lifecycle and locale isolation. These systems are future work, not configured integrations.

## Pending launch gates

- [x] Run `pnpm check` with the intended pnpm/Node versions and verify the production SSR deployment.
- [x] Provision/select the Sanity project/dataset, authenticate Studio, and keep placeholders out of the production target.
- [x] Configure production runtime variables; align web and Studio to the Sanity project. No Sanity token is required for the current public dataset.
- [x] Import the Helpdesk content and verify the live site renders published content without the demo banner.
- [x] Add the English Sanity-managed homepage and site-settings singletons; verify the public homepage renders their hero, navigation, product catalog, curated collections, and resource cards.
- [x] Convert the 28 unsupported macros and 20 flagged table structures to supported rich content; decode visible HTML entities in 134 published articles.
- [ ] Complete Admin editorial review of the 384 imported image alt texts and decide whether to merge the remaining near-duplicate installation guides (`CMS Installations Guide Android and Windows` vs `Installations Guide for Android and Windows`).
- [ ] Decide whether/when to add reviewed Japanese translations; the current source export contained English articles only.
- [ ] Test the real draft/publish boundary: drafts and release versions remain absent, publishing appears, edits are withheld until published, and unpublishing removes content from detail/list/search/sitemap responses.
- [ ] Verify Sanity failures do not fall back to samples. Exercise invalid configuration, empty datasets, unavailable origin, missing slugs, and unsupported locales.
- [ ] Verify final-host headers, canonical origin, robots behavior, sitemap, HTTPS, staging access restrictions, and appropriate security policy.
- [ ] Check structured-content accessibility, keyboard/mobile behavior, links, approved support email, and [search's visible-body, snippet and bounded typo contract](search.md).
- [ ] If enabling helpfulness, review [private local storage and privacy](helpfulness.md), including parent chmod effects, persistent-disk ownership, WAL-aware backup/restore and retention, HTTPS cookies, upstream request protection, failure behavior and capacity. Otherwise leave Sanity helpfulness disabled.
- [ ] Complete the authorized [migration and redirect plan](migration.md), durable asset checks, and rollback rehearsal before changing legacy traffic.
- [ ] Assign manual editorial review/publishing ownership; do not describe approvals, draft preview, or scheduling as enforced/configured until separately verified.
- [ ] Establish operational monitoring, recovery/backup ownership, and capacity expectations. Keep caching/indexing off until their invalidation and signed-webhook design is implemented and tested.
- [ ] Provision and secure the Confluence sync PostgreSQL database and worker; configure signed Helpdesk page/attachment webhooks and periodic reconciliation; test draft-only updates, deletion review, retries, and rollback before enabling production events.

Additional languages, production feedback operations/reporting, hosted search, draft preview, live Confluence sync operations, migration automation, and in-product help remain outside the configured launch implementation. Local search/helpfulness implementation is not evidence of an actual Sanity connection, provisioning, publishing, or production readiness.