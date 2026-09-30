# Search verification

## Existing contract

- `rankArticles(articles, query, product = '', locale = 'en')` remains pure,
  summary-only, and returns the original generic article objects without reading
  bodies or adding presentation fields.
- `searchArticles` also indexes supported visible body text: Portable Text spans,
  callouts, code blocks, procedures, tables and image captions. Annotation URLs, assets, alt
  text, keys, SEO and arbitrary metadata are not indexed or returned.
- Every distinct query term must match. Locale and product filters are applied
  before matching; draft and version article IDs are excluded.
- Exact-only results precede typo results; fewer corrected terms rank first,
  followed by title, summary and body relevance, then locale-aware title order.
  Exact substring matching is unchanged.
- English normalization folds case, width and diacritics. Japanese uses NFKC and
  word segmentation, preserves dakuten, and never uses typo matching.
- English typo matching allows one insertion, deletion or substitution, not a
  transposition. Both normalized query and candidate words must be ASCII letters
  of length 5–32. Identifier/mixed-script fragments do not qualify. Fuzzy work is
  limited to 8 distinct terms and the first 2,048 word tokens across title,
  summary and body per article. Exact matching still checks the full text.
- Queries over 200 raw UTF-16 units are rejected. Blank, oversized and Japanese
  punctuation-only queries do not request the body search catalog.
- Snippets are at most 240 UTF-16 units including ellipses, around the first body
  match. Edges and highlights preserve entire original graphemes. A match too
  large to fit safely produces no snippet. Rendering uses React text, not HTML.

## Offline checks

Run only `apps/web/tests/search.test.ts`, `search-snippet.test.ts`,
`search-loader.test.ts` and `search-ui.test.tsx` with Vitest. Loader tests mock
environment access and the Sanity client; UI tests mock the content service.
No live Sanity operation or environment-file change is needed. Do not run the
Sanity connectivity script as part of search verification.

## Recommended manual checks (demo/offline only)

- English `coordinates`: procedure-body snippet for the inventory import guide.
- English `inventary`: similar-spelling notice/badges; `invantary`: no two-edit
  recommendation.
- English `coordinates` with product `cms`: no results; clearing the product
  keeps the query and English route.
- Japanese `インポート` and `ｲﾝﾎﾟｰﾄ`: equivalent results and original-text highlights.
- Japanese `。！？`: no results and no typo notice.
- Blank query, an unmatched query, and a URL query longer than 200 units: verify
  empty/error states. Markup-looking queries must render as text, never elements.
- During another search, old results and spelling notices disappear behind the
  existing pending feedback; keyboard focus and filter/query values remain usable.

Only use a site already confirmed to be demo/offline; do not probe an unknown
running server merely to perform these browser checks.