# Editorial workflow

[Content model](content-model.md) · [Deployment gates](deployment.md#pending-launch-gates) · [Search](search.md) · [Helpfulness](helpfulness.md)

## What exists

Sanity Studio provides its native document editing, draft, and publish interface with the schemas in `apps/studio/schemas/`. A real cloud project, dataset, authorized account, and permissions must be configured separately. Repository configuration does not establish that any of those steps or live publishing tests have occurred.

The public web client reads published content only; draft/version IDs are excluded by queries as well. No draft preview route, preview token exchange, signed webhook endpoint, or approval enforcement is configured. A draft in Studio is not a web preview. Scheduling availability depends on the Sanity plan and additional configuration; do not assume scheduled publishing is enabled.

## Recommended manual responsibilities

These are operational assignments, **not implemented application roles or permissions**. Configure and verify the actual Sanity project access model separately.

| Responsibility | Manual duty |
| --- | --- |
| Content author | Prepare accurate draft text, metadata, links, alt text, and same-language references |
| Product reviewer | Verify instructions against the actual product, audience, terminology, and support policy |
| Publisher | Confirm review outside the public content, publish approved dependencies/content, and check the live page |
| Project administrator | Manage dataset access, project membership, least-privilege credentials, and deployment settings |

Studio validation helps editors produce consistent documents; it does not prevent an otherwise authorized publisher from skipping review. `reviewedAt` is a public date, not an approval event or access-control condition. Keep review discussions and sensitive approval records outside public documents, in an appropriately restricted process.

## Draft → review → publish

1. **Confirm the target.** Check the real project ID and dataset. `mwhelpcenter` is only a fallback placeholder; demo fixtures are not editable cloud content.
2. **Create dependencies first.** Prepare and publish products, then collections, in English. A shared collection can omit `product`. Existing navigation expects collections with slugs `getting-started` and `best-practices`; provide approved content for those destinations or change the navigation deliberately before launch.
3. **Draft the article.** Set title, slug, summary, language, stable `translationGroupId`, primary collection, one or more products, and content type. Use the supported structured body members rather than pasted executable HTML or embeds.
4. **Check reader-facing details.** Verify references, links, captions, required image alt text, tables, steps, headings, and SEO. Slug changes require a redirect plan; the current redirect schema alone does not create a working redirect.
5. **Review manually.** Have the designated reviewer verify product behavior and content rights. Exclude passwords, tokens, private account details, internal notes, and unresolved editorial commentary. Complete review before publication; the app does not enforce this sequence.
6. **Maintain public dates truthfully.** Set `reviewedAt` only for a completed review. `firstPublishedAt` is editor-maintained and currently not rendered. Do not infer either date from fixture content or a build timestamp.
7. **Publish deliberately.** An authorized publisher uses native Studio Publish after dependencies and review are complete. Review dataset visibility and actual permissions first.
8. **Verify in Sanity mode.** Check the published article, product/collection listings, search, metadata, support links, and sitemap. Confirm the demo banner is absent only because the site intentionally runs in `CONTENT_MODE=sanity`, not because sample content was relabeled.

## Changes, unpublishing, and deletion

For changes to an already published document, draft edits are not public until published. There is no configured preview bridge for reviewing those drafts in the web app.

To withdraw content, assess incoming links and strong references, then use the appropriate Studio action. Reload the article and relevant listings/search/sitemap to verify the published result. Current server reads bypass the Sanity content CDN and use no application content cache; HTTP responses are `no-store`. Subsequent origin reads therefore reflect published availability without waiting for a webhook invalidation service. Already rendered browser pages do not update themselves.

Unpublishing can produce a missing-article 404; it does not automatically create a replacement or redirect. Decide whether a successor article, redirect, or explicit gone response is appropriate, and implement/test that routing separately. Respect strong-reference constraints rather than bypassing them with destructive imports.

## Search and reader helpfulness

Search includes title, summary and supported visible body text: paragraphs/headings, callouts, procedures, tables and image captions. Annotation URLs, assets, alt text, keys and SEO are not search text. Write useful visible instructions rather than stuffing metadata; keep alt text for accessibility. Verify locale/product filtering and representative body terms after publication. English has bounded one-edit typo matching; Japanese does not. Snippets/highlights and spelling notices are generated from published text, not editorially authored suggestions. See [search behavior and offline checks](search.md).

Articles can collect a local `yes`/`no` vote with an optional negative-reason enum: `unclear`, `missing`, `outdated`, or `other` (no free text). This is not a support request, email collection, approval or Sanity document update. Repeat submissions with the same browser identifier update a row rather than duplicate it; deduplication is best effort, not a count of unique people. Article translations have separate votes. Demo feedback is source-separated from Sanity feedback, and Sanity collection requires explicit private local storage configuration.

There is **no public report/dashboard or automatic editorial triage**. Any authorized private review/export process, access control and retention remain operator responsibilities; never publish the database. Unpublishing blocks new votes after the article is no longer available but does not immediately erase existing rows. Reads expire votes 90 days after their last update; row purge waits for subsequent write attempts. See [helpfulness](helpfulness.md) for cookies, privacy, WAL/backups and operational limits.

## Explicitly future

- Enforced author/reviewer/publisher permission boundaries and approval gates.
- Authenticated draft preview and safe preview-token handling.
- Plan-appropriate scheduling and release procedures.
- Signed webhooks and reliable invalidation when caching or search indexing is introduced.
- Feedback reporting/triage tooling, migration automation, additional locales, and in-product help.

Until these are implemented and tested, manual review is a process expectation—not a guarantee supplied by the software.