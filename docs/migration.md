# Migration plan

[Content model](content-model.md) · [Editorial workflow](editorial-workflow.md) · [Deployment](deployment.md)

## Status and scope

The Confluence Helpdesk import and public production cutover completed on 2026-09-30. The repository includes a Confluence REST exporter, dry-run report, draft importer, and guarded publisher. Redirect resolution remains unimplemented. The signed-in Confluence inventory contained 182 current pages: one space overview, seven product-section pages, and 174 content pages, with 574 image attachments across 110 pages. Demo fixtures are original illustrative samples, not migrated documentation.

The import created 7 products, 7 product-specific collections, and 172 English articles in the public `helpcenterdevelopment` dataset, then published them after explicit Admin confirmation. Two shared collections are now published as well: `getting-started` (7 curated guides) and `best-practices` (4 articles already classified as best practice). 571 attachments were uploaded; all 377 image references used by articles resolve. The two explicitly internal/old-copy pages were excluded. No Sanity write or publish action silently falls back to demo content. The Confluence space overview has placeholder text and is not a public help article.

The Netlify production function runs with `CONTENT_MODE=sanity` for project `vjmj7stb`, dataset `helpcenterdevelopment`, and canonical origin `https://mwhelpcenter.netlify.app`. The shared collections and localized Japanese fallback were deployed. A production-only React hydration error (#418) remains under investigation; the current `main` build includes additional recoverable-error component-stack logging. The source export contains English content only; there are no Japanese articles yet.

Post-publication Admin review remains necessary for 384 image alt texts. The 28 previously unsupported macros and 20 flagged table structures have been converted in the published articles: code macros to code blocks, info macros to info callouts, TOC macros omitted in favor of the article-generated TOC, and simple headerless FAQ/layout tables to structured tables or prose. Visible HTML entities were decoded in 134 published English articles. The import report remains in the ignored local path `data/confluence-helpdesk/import-report.json`.

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
- Explicit old-copy marker: `LMX Content Black Screen/Logo Issue (OLD COPY)` (page `304940611`) was excluded. The likely-current article `LMX Content Black Screen/Logo Issue` was published.
- Four duplicate candidates were included in the approved publication. Three pairs have byte-identical article text and attachment sets: `Unable to Publish due to error Message` vs `Guides - Unable to Publish due to error Message`; `How to Schedule URL & Google IMA(VAST)` vs `How to Schedule Vast and URL`; and `How to Schedule Place Exchange Widget` vs `How to Schedule Place Exchange Widgets`. They still need an Admin decision and a redirect/merge plan before unpublishing either route.
- `CMS Installations Guide Android and Windows` vs `Installations Guide for Android and Windows` share all nine attachment bytes but differ in a short brand phrase (`LMX C` vs `MW Content`); retain both pending product-owner review rather than automatically deleting one.
- These findings are a source-data comparison, not publication approval. Similar titles and incidental uses of “internal” in ordinary article instructions are not grounds for automatic exclusion.
- Confluence labels observed: `android`, `cms`, `playlog`, and `troubleshooting`. Preserve them in the restricted migration manifest; map them to Sanity types/fields only after editorial review.

## 1. Obtain an authorized source export

- Copy `.env.migration.example` to the ignored root `.env.migration`, then fill `CONFLUENCE_EMAIL` and `CONFLUENCE_API_TOKEN` using an authorized Atlassian API token with Helpdesk read access. Do not paste credentials into chat, commit the file, or copy a browser session cookie into scripts.
- Run `pnpm confluence:migrate export`. This retrieves current Helpdesk pages, ancestor paths, labels, storage-format bodies, and each page's attachments through the REST API. It saves the snapshot and attachment files under the ignored `data/confluence-helpdesk/` directory.
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

## 4. Run the staged importer

Run `pnpm confluence:migrate dry-run` first. Review `data/confluence-helpdesk/dry-run-report.json`, especially excluded pages, suspected duplicate groups, missing alt text, unmatched attachments, unsupported macros, and tables that exceed Sanity's supported limits. The importer uses deterministic source-page IDs, so re-running the draft import replaces the same draft documents rather than creating duplicate documents.

Set `SANITY_MIGRATION_TOKEN` in `.env.migration` to a Sanity token that can create documents and upload assets in `helpcenterdevelopment`. The importer refuses other project/dataset values, creates **drafts only**, and never publishes. Only run `pnpm confluence:migrate import --apply-drafts` after reviewing the dry-run report. Draft references are initially weak because their targets are drafts too; Sanity rejects strong references to unpublished targets.

The dataset is public, so only approved public material may be imported; draft status is not permission to store confidential content. The importer excludes `LMX Troubleshooting Guide (Internal)` and `LMX Content Black Screen/Logo Issue (OLD COPY)`. Possible duplicate pairs are listed in the report; Admin publication approval was given before publishing them, but their duplicate review remains an editorial follow-up.

The importer creates product drafts for the seven Confluence areas (including the new LMX GSL product), one product-scoped collection draft per area, and eligible article drafts. It reuses matching uploaded assets by source filename and uploads missing assets before creating documents. When migrating to a new dataset, review product descriptions, auto-generated summaries/alt text, and warning callouts before publication. After Admin verifies and publishes the product drafts, run `pnpm confluence:migrate link-published --apply-links` to convert the corresponding collection draft references to strong references. Review/publish those collections, run the link command again to connect article drafts to the now-published products and collections, then verify and publish approved articles. Linking does not publish anything. Never send `SANITY_MIGRATION_TOKEN` to the browser or include it in Netlify's public/client build environment.

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