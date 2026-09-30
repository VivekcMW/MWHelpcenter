# Migration plan

[Content model](content-model.md) · [Editorial workflow](editorial-workflow.md) · [Deployment](deployment.md)

## Status and scope

This is a plan, **not an implemented export/import or redirect script**. No Intercom account access, export authorization, cloud import, or content ownership verification is established by the repository. Demo fixtures are original illustrative samples, not migrated documentation.

The new help-center folder is separate from the existing `movingwalls-help-page` static site and `mw-helpcenter-wireframes` prototype. Preserve both as reference artifacts; do not overwrite, delete, or deploy over them as part of preparing migration. Any later traffic cutover needs explicit approval and a rollback path.

## 1. Obtain an authorized source export

- Confirm the content owner, export authorization, intended scope, and permitted use of text, screenshots, attachments, and third-party assets.
- Use the account's supported Intercom export/API facilities with authorized access. Do not assume public accessibility grants reuse rights, or scrape around account restrictions.
- Inventory articles, collections, product associations, locales, source IDs, slugs, URLs, publication state, and available timestamps.
- Keep a read-only source snapshot and migration manifest in approved restricted storage, outside public docs. Exclude private conversations, customer details, internal notes, credentials, and nonpublic editorial commentary from public outputs.
- Record source IDs and checksums so a future importer can be repeatable and auditable rather than duplicating documents on every run.

## 2. Map and review content

| Source concept | Planned target |
| --- | --- |
| Product/topic taxonomy | Reviewed `product` documents; assign stable slugs and order |
| Collection/category | `collection`, optionally linked to a product; explicitly decide how any deeper hierarchy is flattened |
| Article | `article` with approved title, summary, primary collection, products, content type, and structured body |
| Locale/translation relationship | `language` and article `translationGroupId`; initially import only reviewed English content |
| Publication/review timestamps | Truthful editor-reviewed dates; do not mistake a source modification time for completed review |
| Public author information | Optional `author` schema data only; no current article-author rendering integration |
| Original article URL | Redirect manifest entry; not an automatically active CMS redirect |

Resolve slug collisions within each type/language and choose stable translation group IDs. Preserve source IDs in the restricted migration manifest unless a separately reviewed schema extension is needed. The current public contract intentionally exposes only explicit fields.

Convert source HTML into supported Portable Text paragraphs, H2/H3, lists, quotes, marks, safe links, callouts, images, procedures, and simple tables. Do not copy arbitrary HTML, scripts, styles, or iframes into the body. Flag unsupported embeds, complex tables, and inaccessible media for manual rewriting. See the [renderer mapping](content-model.md#rich-content--renderer-mapping).

## 3. Make assets durable

- Enumerate every image, attachment, caption, alt text, and inline asset reference. Confirm rights and remove personal/account data before transfer.
- Download authorized assets before source access or expiring links disappear; record source URL, checksum, content type, ownership, and destination mapping.
- Upload article images to the intended Sanity dataset's asset storage and rewrite body references. The current image renderer accepts HTTPS `cdn.sanity.io/images/` URLs only; leaving legacy image URLs will not render them.
- Host permitted downloadable attachments at approved durable HTTPS destinations and link to them. A dedicated attachment block/upload workflow is not implemented.
- Do not hotlink temporary exports, signed URLs, local `/tmp` files, or the wireframe prototype. Test every destination after source credentials are removed from the reader environment.
- Review image alt text, captions, resolution, and mobile rendering. Crop/hotspot data is not currently applied by the renderer.

## 4. Design a staged importer before building one

Define an idempotent source-ID mapping, dry-run report, validation failure handling, and rollback before implementing any migration tool. No such tool is included now.

Use a nonproduction dataset first. Validate imported data against actual schema constraints and the handwritten public contract; TypeScript result annotations do not validate external JSON. Import dependencies in order: assets/products, collections, then articles. Keep articles as drafts for review and publish referenced same-language documents before dependent articles.

Reconcile document/asset counts, links, translation relationships, slug uniqueness, body member support, and rendered output. Schema validation and editorial review are both required; neither implies authorized publication by itself.

## 5. Plan and implement redirects

Build a reviewed manifest of every legacy hostname/path and its final canonical destination, including removed or merged articles. Map old URLs to paths such as `/en/articles/<slug>` using actual approved slugs, not guessed titles. Decide whether permanently removed content should redirect to a relevant replacement or return an explicit missing/gone response.

The Studio `redirect` schema supports local absolute `from`/`to` paths and status codes 301, 302, 307, or 308. It rejects queries/fragments and self-targets, but does **not** supply a runtime resolver, hostname routing, chain detection, or loop prevention across records. The current web redirect is only `/` → `/en` (302). Creating redirect documents alone will not preserve legacy links.

Before cutover, implement and test routing at the chosen web/edge/legacy-host layer. Old-domain requests require control of that domain or its hosting redirects; a new app cannot redirect traffic it never receives. Define query-string handling, case/trailing-slash normalization, percent-encoding, status selection, and precedence over ordinary routes. Avoid open redirects, loops, chains, and blanket redirects to unrelated home pages. Rewrite migrated internal links to final destinations rather than relying on redirect chains.

## 6. Cutover and rollback gates

- [ ] Content owner approves export scope, reuse rights, transformed content, and publication.
- [ ] All expected English documents and durable assets reconcile with the manifest; no private notes or customer data are exposed.
- [ ] Staging uses a real authorized dataset, and published-only behavior is tested without enabling public staging indexing.
- [ ] Representative articles and edge cases render correctly; unsupported blocks are resolved rather than silently discarded.
- [ ] Redirect implementation covers approved legacy URLs, has no loops/chains/open redirects, and is tested on the actual legacy hostname path.
- [ ] Search, canonical URLs, sitemap, support links, accessibility, and 404 behavior are reviewed.
- [ ] A backup/source snapshot, dataset recovery procedure, prior deployment, and traffic rollback plan are retained with named owners.
- [ ] Traffic changes are explicitly approved; monitor missing URLs and incorrect destinations after cutover.

Additional-language migration depends on completing the [localization steps](localization.md). Hosted search, signed webhooks, caching, production feedback hosting/operations, and in-product help are separate future integrations—not implicit migration deliverables. The local SQLite [article feedback](helpfulness.md) implementation is not a migrated-content or cloud feedback service.