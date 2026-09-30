# Migration plan

[Content model](content-model.md) · [Editorial workflow](editorial-workflow.md) · [Deployment](deployment.md)

## Status and scope

This is a Confluence Helpdesk → Sanity migration plan, **not an implemented importer or redirect script**. The signed-in Confluence inventory was inspected on 2026-09-30. It contains 182 current pages: one space overview, seven product-section pages, and 174 content pages, with 574 image attachments across 110 pages. The attachment inventory is 526 PNG and 48 JPEG files. Demo fixtures are original illustrative samples, not migrated documentation.

The approved scope is all current content pages, transformed to Sanity **drafts only** for review. The Admin is the publication approver. Do not publish or expose migrated material automatically. Exclude the explicitly internal page and quarantine apparent obsolete/duplicate candidates until the Admin decides whether to exclude, merge, or retain them. The Confluence space overview has placeholder text and is not a public help article.

Verified top-level sections and content-page counts:

| Section | Pages |
| --- | ---: |
| CMS | 69 |
| Admin Console | 25 |
| Inventory | 23 |
| LMX GSL | 20 |
| Influence | 15 |
| Measure Platform | 12 |
| Planner | 10 |

Create a new `product` document for **LMX GSL**; it is not one of the existing six demo product fixtures. The seven Confluence section pages are taxonomy/navigation roots, not seven extra help articles.

The new help-center folder is separate from the existing `movingwalls-help-page` static site and `mw-helpcenter-wireframes` prototype. Preserve both as reference artifacts; do not overwrite, delete, or deploy over them as part of preparing migration. Any later traffic cutover needs explicit approval and a rollback path.

### Review queue from inventory

- Explicitly internal: `LMX Troubleshooting Guide (Internal)` (Confluence page `304940498`). Keep out of the public migration until the Admin explicitly clears or rejects it.
- Explicit old-copy marker: `LMX Content Black Screen/Logo Issue (OLD COPY)` (page `304940611`). Compare with `LMX Content Black Screen/Logo Issue`; do not import both as public articles without Admin disposition.
- Likely duplicates to compare by body and attachments: `CMS Installations Guide Android and Windows` vs `Installations Guide for Android and Windows`; `Unable to Publish due to error Message` vs `Guides - Unable to Publish due to error Message`; `How to Schedule URL & Google IMA(VAST)` vs `How to Schedule Vast and URL`; and `How to Schedule Place Exchange Widget` vs `How to Schedule Place Exchange Widgets`.
- These are review candidates, not confirmed duplicates. Similar titles and incidental uses of “internal” in ordinary article instructions are not grounds for automatic exclusion.
- Confluence labels observed: `android`, `cms`, `playlog`, and `troubleshooting`. Preserve them in the restricted migration manifest; map them to Sanity types/fields only after editorial review.

## 1. Obtain an authorized source export

- Use an authorized Confluence Helpdesk space XML/HTML export or a scoped, read-only Confluence API credential. Do not copy a browser session cookie into scripts or source files.
- Preserve page IDs, current page versions, ancestor paths, labels, storage-format body, attachment metadata, and original page URLs in a restricted migration snapshot/manifest.
- The signed-in inventory confirmed 182 current pages and 574 image attachments. Space-wide attachment enumeration returned a server error, but all 182 per-page attachment listings succeeded; use per-page listing in the importer.
- Keep source exports and manifests in approved restricted storage outside the public web root and Git. Exclude comments, user profile details, credentials, and confidential content from the public dataset.
- Record source IDs and checksums so import retries are idempotent and auditable. Only import content with approved reuse rights.

## 2. Map and review content

| Source concept | Planned target |
| --- | --- |
| Confluence product section | Reviewed `product` document; create products for CMS, Planner, Admin Console, Measure Platform, Influence, Inventory, and LMX GSL |
| Curated topic within a product | `collection` linked to the product; each article must have one same-language primary collection |
| Article | `article` with approved title, summary, primary collection, products, content type, and structured body |
| Locale/translation relationship | `language` and article `translationGroupId`; verify source language and translation pairs rather than infer translations from similar titles |
| Publication/review timestamps | Truthful editor-reviewed dates; do not mistake a source modification time for completed review |
| Public author information | Optional `author` schema data only; no current article-author rendering integration |
| Confluence page ID, URL, labels, and source title | Restricted migration manifest; use approved canonical article paths for redirect planning |

Create product-scoped collections from reviewed topics/labels; if an article cannot yet be categorized, place it in an Admin-reviewed `General` collection for its product rather than leaving its required `primaryCollection` empty. Resolve slug collisions within each type/language and choose stable translation group IDs. Preserve source IDs in the restricted migration manifest unless a separately reviewed schema extension is needed. The current public contract intentionally exposes only explicit fields.

Convert source HTML into supported Portable Text paragraphs, H2/H3, lists, quotes, marks, safe links, callouts, images, procedures, and simple tables. Do not copy arbitrary HTML, scripts, styles, or iframes into the body. Flag unsupported embeds, complex tables, and inaccessible media for manual rewriting. See the [renderer mapping](content-model.md#rich-content--renderer-mapping).

## 3. Make assets durable

- Enumerate every image, attachment, caption, alt text, and inline asset reference. Confirm rights and remove personal/account data before transfer.
- Download authorized assets before source access or expiring links disappear; record source URL, checksum, content type, ownership, and destination mapping.
- Upload article images to the intended Sanity dataset's asset storage and rewrite body references. The current image renderer accepts HTTPS `cdn.sanity.io/images/` URLs only; leaving legacy image URLs will not render them.
- Host permitted downloadable attachments at approved durable HTTPS destinations and link to them. A dedicated attachment block/upload workflow is not implemented.
- Do not hotlink temporary exports, signed URLs, local `/tmp` files, or the wireframe prototype. Test every destination after source credentials are removed from the reader environment.
- Review image alt text, captions, resolution, and mobile rendering. Crop/hotspot data is not currently applied by the renderer.

## 4. Build and run a staged importer

No Confluence importer is implemented yet. Build one with a dry-run report, explicit allow/quarantine decisions, an idempotent source-ID mapping, validation failure handling, and rollback before any Sanity writes. The Admin is the named publication approver; imported content remains drafts until Admin review and explicit publish.

Use `helpcenterdevelopment` first. The dataset is currently public, so only approved public material may be imported; draft status is not permission to store confidential content. Keep `LMX Troubleshooting Guide (Internal)` out of the import pending explicit Admin clearance. Quarantine the `OLD COPY` page and candidate duplicate pairs in the review manifest; do not auto-delete or auto-publish based on title similarity.

Validate imported data against actual schema constraints and the handwritten public contract; TypeScript result annotations do not validate external JSON. Import dependencies in order: products, collections, assets, then article drafts. Articles need same-language product and collection references. Do not configure the production dataset or publish articles until the Admin review gate is complete.

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