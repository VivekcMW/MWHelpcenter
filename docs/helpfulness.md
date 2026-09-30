# Local article helpfulness

[Overview](../README.md) · [Architecture](architecture.md) · [Deployment](deployment.md) · [Search](search.md)

## Implemented scope

Articles offer localized Yes/No feedback and an optional negative reason. The article route handles POSTs through `helpfulness.server.ts`; `helpfulness-store.server.ts` persists SQLite rows using native **`node:sqlite` / `DatabaseSync`** on pinned **Node 22.23.3** (`pnpm-workspace.yaml`, `.nvmrc`). No hosted database or SQLite npm driver is involved.

The form supports JavaScript fetcher and ordinary document submissions, confirms only server success, and lets readers update saved choices. Storage failure hides the form on reads or returns a safe submission error; the article remains readable. There is no public report/dashboard, analytics integration, support ticket or Sanity feedback write. This implementation does not establish an actual Sanity connection, cloud provisioning, publishing, hosting configuration or production readiness.

## Enablement and filesystem caveats

- `CONTENT_MODE` defaults to `demo`. Without `FEEDBACK_DB_PATH`, the store resolves `data/helpfulness-demo.sqlite` against process cwd: **`apps/web/data/helpfulness-demo.sqlite`** when using root pnpm web commands (`apps/web` cwd).
- `CONTENT_MODE=sanity` disables helpfulness unless `FEEDBACK_DB_PATH` is explicitly nonblank; there is no fallback to the demo database. A configured path overrides the demo default too. Demo/Sanity rows have separate source keys, but using the same file still shares storage and rate budgets; choose separate files for environment isolation.
- Production enabling requires an explicit absolute file path inside a dedicated **PRIVATE local persistent disk** directory, outside public/static/build output and release cleanup. Never use a public or shared directory, network filesystem, or serverless ephemeral directory. Multiple hosts with separate local disks do not share votes or limits. The app only trims/resolves the path; it does not verify these placement requirements.
- **Every database open, even a passive article read**, can create directories/database/schema, enables WAL, unconditionally chmods the immediate parent to `0700` (even if it already exists), and sets the database to `0600`. Do not select an app root, home, `/tmp`, mount root or other shared directory as that parent: its permissions will change. Use a dedicated service-owned subdirectory and check access beforehand.
- Recursive directory creation does not secure all existing ancestors. Parent symlinks are not rejected; the initial file open uses `O_NOFOLLOW`, but SQLite subsequently reopens the path separately. This is not complete symlink/race protection. Operators must control the path and ancestors, verify ownership/permissions, and prevent public serving. Permission bits are not encryption or protection from privileged/same-user processes.

## Stored data and cookie

Votes store only source (`demo`/`sanity`), published article ID, locale (`en`/`ja`), SHA-256 visitor hash, vote (`yes`/`no`), reason and last-update timestamp. Reason is empty or one of `unclear`, `missing`, `outdated`, `other`; Yes always stores an empty reason. `other` is an enum, not a free-text field. Rate events contain only visitor hash and submission timestamp. Helpfulness does not store raw visitor tokens, IP addresses, user agents, email, free text or query strings; hosting/access logs require their own privacy review.

The server generates a random 32-byte token and sets `mw_helpfulness` **only after a successful vote without a valid existing cookie**. It has `Max-Age=2592000` (30 days), `Path=/`, `HttpOnly`, `SameSite=Lax`, and `Secure` when the request URL is HTTPS. Reads, failed submissions and updates with a valid cookie do not issue/renew it. Verify HTTPS and origin forwarding at the real proxy; `SITE_URL` alone does not determine the cookie's Secure flag.

The raw token stays in the cookie; only its SHA-256 hash is persisted, not returned in loader/action data. Rows upsert by `(source, article_id, locale, visitor_hash)`: repeat submissions update rather than duplicate, including refreshing the last-update time. Translations are independent. This is pseudonymous **best-effort browser deduplication**, not authenticated unique people: cleared/expired/blocked cookies, other browsers and concurrent first submissions can create additional identifiers/rows. Cookie expiry does not delete database rows.

## Retention and operator duties

Votes at least **90 days since their last update** are excluded from reads. **Physical row purge occurs only during subsequent write attempts**, not on reads or a scheduled job; idle stores retain expired rows. The write transaction also deletes rate events at least 60 seconds old. A rate-limited attempt can commit pruning; a failed transaction rolls it back. Unpublishing/deleting an article is not a database purge hook.

WAL mode and `secure_delete=ON` are used, but row deletion is not a guarantee of erasure from WAL files, snapshots, backups or underlying disk. Operators own private WAL/sidecar handling, consistent SQLite-aware backup/restore, disk monitoring and retention/deletion of every copy. Do not copy only the main file while ignoring an active WAL, expose backups publicly, or promise a hard 90-day physical deletion deadline without separate maintenance. No backup, scheduled purge or reporting service is supplied.

## Submission and abuse boundaries

POST requires an exact non-null same-origin `Origin`, rejects `Sec-Fetch-Site: cross-site`, accepts only URL-encoded UTF-8 forms, and caps the streamed body at 2,048 bytes. Unknown/duplicate fields and a nonempty `website` honeypot are rejected. The server resolves the published article from locale/slug; it rejects drafts, release versions and mismatches rather than trusting a submitted article ID. Responses are `no-store` with safe error codes.

A `BEGIN IMMEDIATE` database transaction enforces **10 accepted writes per visitor / 100 globally per rolling 60 seconds** across all articles, locales and sources in the same file. First votes and updates both count; rejected requests add no rate event. Limit responses are `429` with `Retry-After: 60`. Clearing cookies bypasses visitor identity, not the shared file limit; an attacker can exhaust that global budget.

These are accepted-write limits, not a request firewall: parsing, availability probes, content reads and synchronous SQLite locking can occur before rejection. **Upstream hosting/proxy rate protection is still required**, along with capacity and failure monitoring. Origin/honeypot checks are not authentication or comprehensive bot protection. Keep production disabled until the operator has reviewed these tradeoffs on the actual host.