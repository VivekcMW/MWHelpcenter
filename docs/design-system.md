# Movingwalls design system

The help center uses the Movingwalls system extracted from `tiktok-qc-tool`,
not its former green theme. This is a local, versioned adaptation: the reference
project is not a runtime or build dependency and remains unchanged.

## Source of truth

Reference files in `tiktok-qc-tool`:
- `public/css/mw-tokens.css`: palette, Poppins, 6px radius, spacing and motion.
- `public/css/mw-components.css`: buttons, cards, fields, badges and Lucide conventions.
- `public/mw-logo.svg`: the original logo, copied without modification.

Implementation in `apps/web`:
- `app/styles/tokens.css`: foundation scales and semantic roles.
- `app/styles/components.css`: reusable `.mw-*` primitives, with existing help-center class aliases.
- `app/styles/globals.css`: responsive page composition and editorial content styles.
- `app/styles/motion.css`: opt-in entrance, interaction and router-pending motion.
- `app/styles/feedback.css`: shared rings, search skeletons, share dialog, toasts and article helpfulness presentation; loaded last, after motion.
- `public/mw-logo.svg`: shared header/footer brand asset.
- `app/root.tsx`: local Poppins and Noto Sans JP Variable imports, followed by ordered stylesheet imports.

Load tokens, then components, then layout styles, then motion, then feedback. No Tailwind, remote font
requests, source-project JavaScript, or imperative icon replacement is needed.
Poppins Latin weights 400/500/600/700 are bundled with `@fontsource/poppins`
and use `font-display: swap`. Japanese glyph coverage is self-hosted with
`@fontsource-variable/noto-sans-jp`, imported locally in `root.tsx` after Poppins.
The `:root:lang(ja)` font stack keeps Poppins for Latin text and adds
`"Noto Sans JP Variable"` as the Japanese fallback before system sans-serif fonts.
No Google Fonts runtime request is needed. Audit and bundle the necessary font
coverage when adding further languages.

## Foundations

| Role | Token | Value / usage |
| --- | --- | --- |
| Brand blue | `--mw-primary-600` | `#1D65AF`; primary actions, focus, icons |
| Blue hover | `--mw-primary-700` | `#165499`; hover and tinted-surface text |
| Movement orange | `--mw-secondary-600` | `#EA580C`; restrained accent, not small white-on-orange text |
| Teal | `--mw-flow-600` | `#0D9488`; accent; use 700 for text on light teal |
| Main text | `--mw-text` | Gray 900, `#111827` |
| Supporting text | `--mw-text-muted` | Gray 600, `#4B5563` |
| Page / card | `--mw-page-bg` / `--mw-surface` | Gray 50 / white |
| Decorative border | `--mw-border` | Gray 200 |
| Control border | `--mw-border-control` | Gray 500, darkened from source for control contrast |
| Radius | `--mw-radius` | 6px on cards, buttons, fields and callouts |
| Pill radius | `--mw-radius-full` | Badges, circular decorative artwork and spinner rings |
| Elevation | `--mw-shadow-sm/md/lg/float` | Resting cards / hover / overlays / hero search |

The complete primary, secondary, flow and gray 50–950 ramps match the reference.
Status colors are separate from decorative product accents. Info uses blue;
tips use teal; warnings use amber; errors use red. Always include readable text:
color or an icon alone must not communicate meaning.

Typography uses Poppins for Latin text, including code/numeric labels as in the
reference app, with Noto Sans JP Variable providing Japanese glyphs in the
locale-specific fallback stack. Body is 14px, compact text 12–13px, section headings 18px,
article H2 24px, and display headings fluid 32–52px. Use weights 400, 500, 600
and 700 only; do not rely on synthetic intermediate weights. Long-form content
uses a 1.9 line height. Mobile search inputs use 16px to avoid iOS focus zoom.

Spacing follows 4px increments through `--mw-space-*`: 4, 8, 12, 16, 20, 24,
32, 40, 48 and 64px. Page width is 1180px; article reading width is 760px.
Help-center-specific extensions (display size, reading width, 44px control
height, semantic roles) are deliberately separate from copied palette values.

## Reusable component contract

Apply classes to semantic HTML or React Router links; no React wrapper is
required just to obtain shared presentation. All classes resolve from tokens.

| Primitive | Classes | Existing help-center aliases |
| --- | --- | --- |
| Button/link | `mw-btn`; optional `mw-btn--outline`, `--secondary`, `--ghost`, `--danger` | `button`, `button-outline` |
| Card | `mw-card`; optional `mw-card--hoverable` | `task-card`, `product-card`, `resource-panel`, `article-support` |
| Input/select | `mw-input`, `mw-select` | Search composition and `.filter-form select` |
| Badge | `mw-badge`; optional `mw-badge--success`, `--warning`, `--danger`, `--flow`, `--secondary` | `tag` |
| Callout | `mw-callout`; optional `mw-callout--tip`, `--warning` | `callout`, `callout-tip`, `callout-warning` |

Variant suffixes in the table belong to their full prefix (for example,
`mw-btn mw-btn--ghost`). Native buttons support `disabled`; links remain
navigation, not disabled controls. A hoverable card should be a link or button
if it acts on click, not a clickable `div`. Give fields visible labels or an
accessible name, and pair `aria-invalid` with explanatory text. Callout bodies
can contain paragraphs and a leading `strong` title. Do not nest interactive
elements inside card links.

Use **named `lucide-react` imports only** for interface icons (16–22px,
2px strokes). Decorative icons use `aria-hidden="true"`. Icon-only controls
need a localized accessible label. Never replace icons with Unicode glyphs,
emoji or an icon font. The logo is an image, not an approximation built from
text or an arrow; preserve its aspect ratio and colors.

Product accents are keyed by product slug in `home.tsx`, not result order:
Inventory/Measure blue, Planner/CMS teal, Influence/Admin Console orange.
Unknown products get the blue fallback. Reordering CMS content cannot change
a product's visual identity.

### Header navigation

The header is adapted from the rendered Moving Walls website navigation:
Poppins Medium (500), 14px / 20px desktop links and actions, a compact original
logo, white surface, subtle border/shadow, and a blue support action. The local
brand palette and 6px corners remain unchanged. `SiteHeader` owns this layout;
`SiteShell` retains route feedback and the persistent page structure.

Below 1024px, desktop links become a native `details` / `summary` menu with a
44px toggle and stacked links, including support. The menu expands in document
flow rather than obscuring content. It works without JavaScript; with JavaScript,
Escape closes it and restores toggle focus, and URL changes close it automatically.
Current links have a blue underline (desktop) or tinted indicator (mobile), with
`aria-current` reflecting exact collection/support pages or the Products location.
Language selection remains visible outside the mobile menu. Its desktop type
matches the links; mobile native select text remains 16px to avoid iOS focus zoom.

### Language switcher

The shared header uses a labeled native select for **English / 日本語**, including
on error pages. Preserve native keyboard interaction, visible focus, and an
accessible localized name rather than substituting a custom menu. Changing the
selection submits the `/language` GET form with JavaScript; a `noscript` submit
button supports readers without JavaScript. Language is selected by URL, not a
cookie. Missing translations display a localized notice at the selected locale's
home page; see [localization](localization.md) for destination rules.

### Search results

Search result links retain the article-list layout, adding optional body snippets,
original-text `<mark>` highlights in titles/summaries/snippets, and a localized
similar-spelling badge for typo matches. A localized notice explains when such
results are included. Highlights render React text, never injected HTML, and
preserve complete graphemes. Pending searches hide stale results, counts and
spelling notices behind the existing skeleton. No-results links offer product
filter clearing (preserving query/locale), getting started and support. See
[search](search.md) for matching/snippet limits and offline verification.

### Feedback and sharing

`spinner.tsx` provides the shared decorative ring: `sm` is 18px (the default),
`md` 24px and `lg` 32px. `loading-feedback.tsx` provides `NavigationFeedback`
and the three-row `ResultsSkeleton`. Callers own localized busy announcements;
the ring, skeleton and navigation chip are `aria-hidden`, not extra live regions.

Feedback colors and surfaces are adapted from
`/Users/vivekanandchoudhari/tiktok-qc-tool/public/css/mw-components.css`, not
loaded from that project at runtime. They use local tokens: gray skeletons,
blue activity, white dialog/toast surfaces, a 50% black modal backdrop, and
green/red/amber/blue status borders with readable status text and icons.
The local small ring is deliberately 18px rather than the reference's 16px.

The article's `ShareGuide` uses a native `button` trigger marked `.js-only`;
the root's `noscript` style hides it without JavaScript. This opens a
`@radix-ui/react-dialog` modal, not the browser's native share sheet. Radix
provides the accessible title/description, focus trap, Escape and overlay
dismissal, background scroll lock, and focus restoration to the trigger on
close. The panel stays within the viewport and scrolls for longer content.
This is a user-invoked share dialog, not a general modal on every navigation.

On opening, the readonly, selectable link is built from the **current browser
origin plus pathname**, preserving the article language and dropping query and
hash. It is not the `SITE_URL` canonical link. Clipboard access happens only
when Copy is activated. A busy guard prevents duplicate requests; request
invalidation ignores stale success or failure after close, reopening or unmount.
Success closes the dialog, then calls `toast.success` with the deduplication ID
`guide-copy`. Failure keeps the dialog open with an inline alert and the input
available for manual copy or retry; it never reports fake success.

`FeedbackToaster` in `toaster.tsx` uses Sonner with local `.mw-toast*` styles,
top-right positioning, at most three visible notifications, a 6-second duration,
close controls, and hover/focus pausing. Sonner owns stacking and positioning;
do not replace its layout transforms. Language changes dismiss notifications
rather than leaving old-language messages visible. Sharing adds no analytics,
storage or network submission. Generic error pages offer a localized retry
link that performs a full reload of pathname plus query; 404 pages do not.

### Article helpfulness

`ArticleHelpfulness` appears after the article body when local storage is
available. Unlike sharing/toasts, it persists a vote; it is not a support form
or public rating/report. Native required Yes/No radios, decorative Lucide thumbs,
an optional reason select and a submit button use the existing tokens, 6px
corners and 44px control height. The select remains visible for either vote;
the server clears the reason for Yes. There is no free-text/email field.

Keep the localized privacy notice and, in demo mode, local-demo notice visible.
The form is marked busy and its fieldset disabled only during its own fetcher
submission or when unavailable; saving uses the shared ring and localized text.
Confirmation follows server success in a polite status region, not optimistic
selection or a toast. Errors use an inline alert; saved choices can be updated.
Document POSTs also render confirmation without JavaScript. An unavailable
store hides the form on initial reads without hiding the article.

Choices wrap at narrow widths; the select uses 16px text and the panel reduces
padding below 420px. Preserve native focus/radio semantics and reduced-motion
static feedback. Both EN/JA bundles include all states. See [helpfulness](helpfulness.md)
for cookie, deduplication, persistence and operational limits, and
[localization](localization.md#article-helpfulness) for translation boundaries.

## Responsive and accessible behavior

- Three-column product/task grids on desktop; two columns below 760px;
  one column below 420px. Header navigation collapses below 1024px rather than wrapping.
- White cards on gray-50 surfaces, with a pale-blue help/search hero.
- Article sidebar becomes the existing native expandable contents panel on mobile.
- At least 44px-tall primary controls. Keyboard focus is a 2px blue outline
  with an offset; do not remove it without an equally visible replacement.
- Text pairings target WCAG AA 4.5:1. Control boundaries target 3:1.
  Decorative card borders are not used as the sole control affordance.
- Hover lift is 1px, transitions 150ms. Reduced-motion disables transitions,
  animations and card movement. No entrance animation is required to see content.
- Use logical spacing properties and wrap long content. Full RTL support still
  requires the localization work described in `localization.md`.

## Extending and validating

### Motion contract

Motion enhances state changes, never gates access to content. No animation library,
intersection observer, artificial loading delay or minimum loading duration is
used. Pending reveal delays are CSS-only; Sonner manages its own toast timers.

| Interaction | Behavior |
| --- | --- |
| Initial page / new pathname | 220ms fade; shared header/footer stay mounted |
| Hero and home sections | 320ms, 8px rise with 40ms stagger (maximum 120ms delay) |
| Query/filter or hash change | No full-page entrance replay or keyed subtree remount |
| Buttons | 150ms color/border/shadow feedback; 1px press feedback |
| Cards, arrows, navigation | Small hover nudges and underline reveal on fine-pointer devices |
| Search focus | 220ms shadow transition with the existing visible focus outline |
| Mobile contents | 150ms opening fade; native details/summary behavior retained |
| Pending navigation | Nonblocking fixed bottom chip plus the retained top indeterminate bar; CSS reveal delayed 120ms to avoid flicker |
| Pending search | Ring replaces the same-size arrow for its own GET submission; same-search-path navigation replaces stale results/count with a skeleton and searching label |
| Product filter | Stable 18px spinner slot in the submit button; busy during pending navigation to the current locale's search path |
| Language selection | Ring replaces the globe during `/language` submission; native select stays operable, followed by the destination pathname entrance |

`SiteShell` reads React Router's `useNavigation` directly. The polite, localized
status region is outside `main[aria-busy]`; the chip and bar are decorative,
not a false percentage or blocking overlay. The search-form button only spins
for its own GET submission. The results skeleton and filter busy state apply
only while the destination pathname equals the current locale's search path;
navigating elsewhere does not hide the existing results.
Controls stay operable so readers can revise a search or navigate away; the
router clears pending feedback on completion, interruption or an error boundary.
Initial SSR waits for server loaders and renders their result: it does not show
a skeleton while that server work is blocking. There are no fake delays or
minimum display durations to force readers to see a loading state.
Hash navigation and browser scroll restoration remain native/router-controlled.
The language dropdown does not add a custom menu animation or artificial delay.
Language navigation uses the same reduced-motion rules; pending feedback remains
available without motion, including when the destination is an error page.

App feedback animation declarations live under `prefers-reduced-motion: no-preference`.
Reduced motion removes entrances, ring rotation, skeleton shimmer, hover movement,
dialog/toast animation and transitions; pending feedback stays visible as a
static chip, ring, skeleton and bar with localized announcements. The 120ms
visual reveal delay is also removed. The CSS
also responds if that preference changes while the page is open. Infinite
animation is limited to active loading feedback—no continuously moving hero.
Entry animations do not retain transforms after completion, preserving sticky
article navigation and card hover states. Avoid `transition: all`, persistent
`will-change`, layout-property animations and forward-filled entrance transforms.

### Checklist

1. Reuse a semantic token or primitive before adding a new rule.
2. Add palette values only to `tokens.css`, never inline in route components.
3. Put reusable appearance in `components.css`, page composition in `globals.css`, and feedback presentation in the final `feedback.css` layer.
4. Keep user-facing copy in the existing i18n catalogs and preserve native semantics.
5. Run `pnpm check`. `apps/web/tests/design-system.test.ts` protects key source
  values, variable resolution, contrast pairs, font imports and motion rules;
  `feedback.test.tsx` covers bilingual sharing, clipboard lifecycle and loading primitives.
6. Inspect English and Japanese home, product, collection, article, search,
  support and not-found pages at desktop and mobile widths, plus keyboard focus,
  reduced motion, Japanese glyph rendering, and language switching with and
  without JavaScript. Check same-path search pending states, stable spinner slots,
  dialog focus/scroll restoration, clipboard denial/manual copy, stale completions,
  toast dismissal/pausing, and non-404 full-reload retry. Include search highlights,
  spelling notices and empty-state links, plus helpfulness saving/errors, saved
  updates, unavailable storage and no-JavaScript submission in both languages.

Help-center presentation now includes loading feedback, an article share dialog
and copy-success toasts, search highlights and local article helpfulness, with Radix and Sonner supplying sharing/toast behavior rather than
porting the source app's JavaScript. Dashboard widgets, authentication, tables
with sorting and multi-tenant themes remain outside the implemented scope.
Sanity Studio retains its native authoring UI.