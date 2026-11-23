# Confluence synchronization

This repository includes a draft-only Confluence synchronization service for the Helpdesk space. It is separate from the public Netlify web application: a long-running Node process receives signed webhooks, writes minimal event records to PostgreSQL, and processes events from that durable queue. No service, database, webhook, or credentials are provisioned by this repository.

## What sync does

- Uses the Confluence page ID as the stable article identity and maps a page to the nearest recognized product ancestor: CMS, Planner, Admin Console, Measure Platform, Influence, Inventory, or LMX GSL.
- Fetches the latest page and its current attachments through the Confluence REST API after receiving an event. Webhook bodies are used only for event metadata; raw bodies and user details are not stored.
- Converts supported text, image, video, audio, and downloadable-file references into the existing Sanity rich-content blocks. Unsupported formats/macros, unused attachments, missing image alt text, and missing media transcripts are reported for review.
- Creates or updates Sanity **drafts only**. It does not publish, unpublish, or delete Sanity articles. A changed draft edited by a human is marked as a conflict rather than overwritten.
- Puts source deletions, unmapped products, unresolved attachment parents, slug collisions, and transformation warnings in the PostgreSQL review queue.
- Retries transient failures with bounded exponential backoff and an event lease. `reconcile` queues a whole-space comparison to recover from missed webhooks and identify removed pages.

Video drafts need captions or a transcript; audio drafts need a transcript. Missing accessibility content is intentionally surfaced as a review warning and should be completed before publishing. Other attachment types are retained as downloadable files when supported. Unsupported embedded services are not hotlinked automatically.

## Prerequisites

1. A private managed PostgreSQL database with TLS enabled and an approved long-running Node worker host.
2. A Confluence API account with read access to the Helpdesk space and an administrator who can configure webhooks.
3. A Sanity write token restricted to the development dataset. The worker currently refuses targets other than project `vjmj7stb`, dataset `helpcenterdevelopment`.
4. Product and collection documents already published in Sanity. Missing dependencies are routed to review; the service will not invent or publish them.

## Configure and run

Copy `.env.migration.example` to the ignored root `.env.migration`, then fill in the Confluence credentials, PostgreSQL TLS connection string, webhook secret (at least 32 characters), and Sanity migration token. Keep this file private and never pass its values to browser/client code.

```sh
pnpm confluence:sync:db:migrate
pnpm confluence:sync:start
```

The service listens on the host-provided `PORT`, or `CONFLUENCE_SYNC_PORT` (default `8080`). Configure the Confluence webhook URL as:

```text
https://<worker-host>/webhooks/confluence
```

Configure Confluence to sign webhook bodies with the same secret in `CONFLUENCE_WEBHOOK_SECRET`. The receiver verifies the `X-Hub-Signature` HMAC-SHA256 header before parsing or storing an event. Subscribe to page create/update/move/restore/publish and removal/trash/archive events, plus attachment create/update/remove/restore/trash/archive events. The receiver accepts Helpdesk page events and ignores other spaces and non-page content.

Useful operations:

```sh
pnpm confluence:sync:status
pnpm confluence:sync:reconcile
```

Run reconciliation periodically (for example, nightly) in addition to webhook delivery, which Atlassian documents as best effort. `status` prints event counts and recent review items. Resolve conflicts and content warnings in Sanity/editorial review; the service deliberately does not publish review items.

## Initial import and rollout

Reconcile the current Confluence export and published Sanity dataset before importing; the repository contains historical migration reports, but these are not proof of the current live state. Use the existing `pnpm confluence:migrate export` and `pnpm confluence:migrate dry-run` flow to stage the full-space baseline. Do not rerun its write/publish commands against an existing dataset until the draft and published IDs have been checked.

Recommended rollout:

1. Provision the private database and worker environment; run the schema migration.
2. Configure the signed webhook and start the receiver with `CONFLUENCE_SYNC_WORKER_ENABLED=false` before taking the final Confluence snapshot. Events will be durably buffered but not processed.
3. Reconcile/import the full Helpdesk space into Sanity drafts, review and publish product/collection dependencies, then restart the service with `CONFLUENCE_SYNC_WORKER_ENABLED=true`.
4. Review imported article drafts and media warnings in Studio; publish only through the approved editorial process.
5. Run reconciliation, verify product listings, article routes, media, and review queue behavior, then maintain periodic reconciliation and monitor failed events.

The webhook receiver and worker are implemented locally, but production connectivity, provider webhook configuration, queue credentials, continuous process supervision, monitoring, and a production rollback drill still require owner setup and verification.

## Implementation boundaries

- PostgreSQL stores event metadata, page/version fingerprints, draft fingerprints, and attachment-to-Sanity-asset mappings. It does not store raw page bodies or webhook payloads.
- HMAC verification, event deduplication, `FOR UPDATE SKIP LOCKED` leasing, retry backoff, and review statuses protect the ingestion path. A daily reconciliation remains necessary because webhook delivery is not guaranteed.
- No Sanity publish API is called by the sync service. The public website continues to read published Sanity content only.
- Event delivery requires a reachable HTTPS worker endpoint. Do not place the webhook receiver on a serverless function that lacks the durable PostgreSQL connection and separately supervised worker process.

See the [migration guide](migration.md), [content model](content-model.md), and [deployment guide](deployment.md) for related content, media, and hosting constraints.
