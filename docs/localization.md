# Localization

[Architecture](architecture.md) · [Content model](content-model.md) · [Search](search.md) · [Helpfulness](helpfulness.md)

## Current behavior: English and Japanese

The web app uses i18next **26.4.2** and react-i18next **17.0.15**. `apps/web/app/i18n/config.ts` registers English (`en`, `English`) and Japanese (`ja`, `日本語`), both left-to-right. Unsupported locale paths return **404**, not English content under another language's URL. `/` redirects to `/en`. The URL alone selects the language; no locale cookie is stored.

UI resources are bundled from `apps/web/app/i18n/locales/en/` and `apps/web/app/i18n/locales/ja/`:

| Namespace | Contents |
| --- | --- |
| `common` | General UI, home/support/error copy, content-type labels, counts |
| `navigation` | Navigation, breadcrumbs, accessibility labels |
| `search` | Search labels, counts, empty/error recovery, similar-spelling notice and result badges |
| `feedback` | Loading/searching/switching copy, sharing/toasts/retry, helpfulness choices/reasons, privacy/demo notice, saving/success/errors |

`feedback.json` is the fourth namespace, bundled for both EN and JA and registered
in `instance.ts`; it is not fetched lazily from a translation service.

`createI18n` in `instance.ts` creates a fresh synchronous instance. Root rendering memoizes an instance within its render tree; server metadata helpers create their own instances. There is no mutable global server language setting shared across requests. Bundled resources keep server rendering and hydration aligned. React handles text escaping.

The i18next `fallbackLng: 'en'` setting is a UI resource fallback, **not permission to accept unsupported URL locales or substitute English CMS documents**. `content.server.ts` selects the requested locale's demo catalog or language-filtered CMS content; it never fills missing Japanese content with English documents.

The HTML language and direction follow the selected locale. Japanese uses self-hosted Noto Sans JP Variable alongside Poppins; see the [design system](design-system.md). Page metadata uses localized UI resources, including the site-title suffix on product, collection, and article pages. An article's explicit SEO title and description still take precedence.

## Language dropdown and destinations

The shared header, including error pages, offers a native select with English and 日本語. With JavaScript, a selection automatically submits the form; without JavaScript, a `noscript` submit button is available. During a real `/language` submission, the shared ring replaces the globe and the form is marked busy, while the select remains operable. The `/language` GET route validates both the requested `to` locale and the `from` location before resolving a destination through `languageDestination`.

- **Articles:** resolve a unique published target-language document by `translationGroupId`, using that document's own slug. Matching slugs are not assumed. Article hashes are dropped because translated Portable Text block keys can differ.
- **Products and collections:** use the same stable ASCII slug across languages, but only navigate to it if it exists in the target-language catalog.
- **Missing translations:** redirect to the selected locale's root with `?translation=unavailable`, where a localized notice explains the unavailable translation. This is not an English-content fallback.
- **Search:** retain `q` (capped at 200 characters) without automatically translating it. Retain the product filter only if that product exists in the target catalog.
- **Home:** preserve the `#products` anchor when switching languages.

The root emits a canonical URL from `SITE_URL` plus the current pathname. The sitemap loops over registered locales and their published content in Sanity mode; demo mode retains its empty sitemap. **Alternate-language `hreflang` links are not provided.**

## Document translations

CMS translations are separate documents, not multilingual fields inside a single article. Documents carry `language`; article translations share a stable `translationGroupId`. Each article keeps its own localized title, slug, summary, body, and SEO text. Products and collections also need localized documents and same-language references; they use stable shared slugs rather than the article grouping field.

Studio lists `en` and `ja` in `schemas/common.ts`. Slugs are scoped by type and language and remain ASCII-only. Article switching requires an unambiguous published counterpart, not an arbitrary first match. Translation completeness and human editorial approval are not automatic.

English fixtures remain unchanged: six products, three collections, and four sample articles. `fixtures.ja.ts` supplies a separate Japanese catalog with the same counts, exported through `fixtures.ts` as `japaneseProducts`, `japaneseCollections`, and `japaneseArticles`. These are illustrative demo data, not provisioned CMS documents or approved product instructions.

**Real Japanese publication still requires human-reviewed CMS documents.** Publish localized products and collections before articles, maintain same-language references and translation groups, and review body text, alt text, captions, SEO, terminology, and factual accuracy. The repository does not provision, automatically translate, or publish a Japanese dataset.

## Locale-specific search

Search ranks titles, summaries and supported visible body text with explicit locale/product filters and published-only input. English folds case, width and diacritics and permits bounded one-edit matching for eligible ASCII words; Japanese uses NFKC and `Intl.Segmenter`, preserves dakuten and never uses typo matching. Exact-only results precede corrected results; ties use locale-aware title collation. Original-text snippets and `<mark>` highlights preserve graphemes, including voiced kana; snippets are capped at 240 UTF-16 units. Queries over 200 raw UTF-16 units are rejected, and Japanese punctuation-only queries do not fetch body text. No automatic query translation or semantic retrieval is implemented. See [search](search.md) for detailed limits.

Both UI bundles include spelling notices/badges and no-results recovery links (clear product while retaining query/locale, getting started, support). The home troubleshooting link uses the localized `troubleshootingQuery` resource and URL-encodes it. Pending searches hide old results, counts and spelling notices together.

## Localized feedback

Navigation, search and language activity use real router state. The nonblocking
bottom chip uses `feedback` copy, while the shell retains its localized
`navigation` live status and top bar. Only pending navigation to the current
locale's search path replaces stale results/count with the decorative skeleton
and localized searching label; navigating elsewhere leaves results intact.
The filter spinner slot stays stable. Initial SSR waits for loaders rather than
showing a skeleton; the 120ms chip/bar reveal is CSS-only, with no fake request
delay or minimum duration. Reduced motion leaves static feedback.

The article share button, dialog title/description, readonly link label/hint,
copying status, failure alert, success toast, close/dismiss controls and generic
error retry all use `feedback` translations. Radix owns modal focus trapping,
Escape/overlay dismissal, scroll locking and focus restoration; ordinary
navigation never opens this dialog. The `.js-only` share trigger is hidden
without JavaScript. The link uses current origin plus pathname, so it keeps the
article language but excludes query/hash. Copy is user-initiated, guarded against
duplicates, and ignores stale completions after close or unmount. Failure leaves
localized manual-copy guidance in the open dialog, not a success notification.

Successful copy closes the dialog before a Sonner success toast (`guide-copy`
deduplication ID). `FeedbackToaster` shows at most three notifications for
6 seconds with close controls and hover/focus pausing. A language change dismisses
existing notifications rather than retaining old-language messages. Sharing adds
no analytics, storage or network submission. Generic errors offer a localized
full-reload retry link; 404 pages do not. See the [design system](design-system.md)
for the shared visual and accessibility contract.

### Article helpfulness

English and Japanese `feedback` bundles contain vote/reason labels, the privacy and demo notices, saving/confirmation text, previously saved state and errors. Submitted values remain language-independent enums: `yes`/`no`, optional `unclear`/`missing`/`outdated`/`other`; labels are translated, stored values are not. Selecting Yes clears the stored reason. The native form also works without JavaScript, with server confirmation rather than a simulated success.

Votes are separate by source, published article ID, locale and hashed visitor identifier—not shared by `translationGroupId`. Switching languages does not transfer a vote. The success-only 30-day helpfulness cookie identifies a browser for best-effort updates; it does **not** select the locale. No IP address, email or free-text reason is collected by helpfulness. See [helpfulness](helpfulness.md) for private storage opt-in, expiry and privacy limitations. Adding a locale also requires extending the SQLite locale constraint (currently `en`/`ja`) with an explicit migration plan for existing databases; changing UI resources alone is insufficient.

## Adding further locales and future work

English and Japanese are already registered; these steps apply to additional locales and remaining capabilities:

1. **Agree on scope and ownership.** Choose the locale code, display name, direction, terminology, editorial reviewer, and content coverage. Retain the explicit missing-translation policy.
2. **Register resources and language choices.** Extend `locales` in `app/i18n/config.ts`, register all four namespace bundles (including `feedback.json`) in `instance.ts`, and update Studio's supported languages. Keep URL and CMS validation strict; adding translation files alone does not load them.
3. **Translate and review content.** Publish localized products/collections with stable shared slugs and same-language references, followed by articles with shared translation groups and their own slugs. Review ASCII slug constraints before supporting other slug formats. Enforced approval and translation-completeness workflows remain future work.
4. **Verify destination resolution.** Exercise published, missing, ambiguous, and unpublished article translations; product/collection catalog checks; retained search queries and filters; hashes; error pages; and the no-JavaScript form. Do not replace a locale prefix while blindly retaining an article slug.
5. **Extend SEO relationships deliberately.** Preserve current canonical and per-locale sitemap behavior. Reciprocal `hreflang` links remain future work and must include only published equivalents.
6. **Audit search and typography.** Review segmentation, normalization, collation, plural forms, interpolation, dates, metadata, accessibility labels, and self-hosted font coverage for each new language. Keep any future search index locale-specific.
7. **Audit direction and layout.** The current languages are LTR. Although direction is locale-driven, full RTL readiness is not established. Prefer logical CSS and review physical offsets, asymmetric corners, icons, tables, and navigation before adding RTL locales.
8. **Verify before release.** Check SSR/hydration, concurrent languages, keyboard and no-JavaScript navigation, long text, 404s, reduced motion, reference validation, metadata, sitemap URLs, and locale-filtered search. Include localized pending feedback, dialog focus/scroll restoration, clipboard success/failure and stale completion handling, language-change toast dismissal, and non-404 retry. Publish only reviewed translations.

Additional languages, automatic translation, alternate-language metadata, and full RTL readiness remain future work; English/Japanese routing and translation-aware switching are already implemented.