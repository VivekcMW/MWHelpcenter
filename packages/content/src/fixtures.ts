import type {Article, Collection, PortableTextBlock, Product} from './types'

export {japaneseProducts, japaneseCollections, japaneseArticles} from './fixtures.ja'

// Original illustrative samples, NOT verified product instructions or seeded data.
export const products: Product[] = [
  {_id: 'sample-product-inventory', title: 'Inventory', slug: 'inventory', description: 'Organize out-of-home media inventory and availability.', icon: 'map-pin', order: 1, language: 'en'},
  {_id: 'sample-product-planner', title: 'Planner', slug: 'planner', description: 'Explore audiences and shape an OOH campaign plan.', icon: 'compass', order: 2, language: 'en'},
  {_id: 'sample-product-influence', title: 'Influence', slug: 'influence', description: 'Coordinate campaign activation and delivery.', icon: 'megaphone', order: 3, language: 'en'},
  {_id: 'sample-product-measure', title: 'Measure', slug: 'measure', description: 'Understand campaign measurement and reporting.', icon: 'chart-bar', order: 4, language: 'en'},
  {_id: 'sample-product-cms', title: 'CMS', slug: 'cms', description: 'Prepare and organize content for digital screens.', icon: 'monitor', order: 5, language: 'en'},
  {_id: 'sample-product-admin-console', title: 'Admin Console', slug: 'admin-console', description: 'Understand workspace administration and access.', icon: 'settings', order: 6, language: 'en'},
]

export const collections: Collection[] = [
  {_id: 'sample-collection-getting-started', title: 'Getting started', slug: 'getting-started', description: 'Build a shared understanding before your first OOH workflow.', language: 'en'},
  {_id: 'sample-collection-best-practices', title: 'Best practices', slug: 'best-practices', description: 'Simple checks for clear, consistent campaign operations.', language: 'en'},
  {_id: 'sample-collection-inventory-imports', title: 'Inventory imports', slug: 'inventory-imports', description: 'Prepare inventory data for a consistent handoff.', language: 'en', productSlug: 'inventory'},
]

function paragraph(key: string, text: string): PortableTextBlock {
  return {_key: key, _type: 'block', style: 'normal', markDefs: [], children: [{_key: `${key}-text`, _type: 'span', text, marks: []}]}
}

export const articles: Article[] = [
  {
    _id: 'sample-article-getting-started', title: 'Getting started with your OOH workspace', slug: 'getting-started',
    summary: 'A sample orientation checklist for teams planning an out-of-home campaign.', language: 'en',
    productSlugs: products.map((product) => product.slug), collectionSlug: 'getting-started', contentType: 'overview',
    translationGroupId: 'sample-getting-started',
    body: [
      paragraph('start-intro', 'Sample guidance: agree on campaign goals, markets and dates before choosing a workflow. Confirm the timezone and reporting currency with your team.'),
      {_key: 'start-tip', _type: 'callout', tone: 'info', title: 'Illustrative content', text: 'This is sample help-center content. Your account configuration and available capabilities may differ.'},
      paragraph('start-next', 'Identify who owns inventory, planning, creative delivery and measurement. Ask your workspace administrator which areas your role can access.'),
    ],
    seo: {title: 'Getting started | Moving Walls Help Center', description: 'Sample orientation for an out-of-home campaign workspace.'},
  },
  {
    _id: 'sample-article-import-inventories', title: 'Prepare data before importing inventories', slug: 'import-inventories',
    summary: 'Sample checks for inventory identifiers, locations and screen information before an import.', language: 'en',
    productSlugs: ['inventory'], collectionSlug: 'inventory-imports', contentType: 'guide',
    translationGroupId: 'sample-import-inventories',
    body: [
      paragraph('import-intro', 'Sample guidance: obtain the current import template from your account team. Do not assume a particular file format or column layout is supported.'),
      {_key: 'import-procedure', _type: 'procedure', title: 'Prepare a small test batch', steps: [
        {_key: 'import-identifiers', _type: 'procedureStep', title: 'Check identifiers', description: 'Use consistent inventory identifiers and remove accidental duplicates.'},
        {_key: 'import-locations', _type: 'procedureStep', title: 'Check locations', description: 'Confirm market names, coordinates and units with the source owner.'},
        {_key: 'import-test', _type: 'procedureStep', title: 'Agree on a test', description: 'Review a small batch with your account team before attempting a larger import.'},
      ]},
    ],
  },
  {
    _id: 'sample-article-campaign-delivery-checks', title: 'Campaign delivery checks', slug: 'campaign-delivery-checks',
    summary: 'Sample troubleshooting prompts for comparing scheduled delivery with available reporting.', language: 'en',
    productSlugs: ['influence', 'measure', 'cms'], collectionSlug: 'best-practices', contentType: 'troubleshooting',
    translationGroupId: 'sample-campaign-delivery-checks',
    body: [
      paragraph('delivery-intro', 'Sample guidance: compare the same campaign, date range and timezone before interpreting delivery totals. Allow for the reporting delay agreed with your account team.'),
      {_key: 'delivery-table', _type: 'simpleTable', caption: 'Example delivery review checklist', columns: ['Check', 'Question'], rows: [
        {_key: 'delivery-dates', _type: 'tableRow', cells: ['Schedule', 'Are the campaign dates and timezone aligned?']},
        {_key: 'delivery-assets', _type: 'tableRow', cells: ['Creative', 'Has the intended creative been cleared for the selected screens?']},
        {_key: 'delivery-reporting', _type: 'tableRow', cells: ['Reporting', 'Are all comparisons using the same reporting window?']},
      ]},
      paragraph('delivery-support', 'If a discrepancy remains, share the campaign identifier, reporting window and a concise description through your approved support channel. Do not include passwords or access tokens.'),
    ],
  },
  {
    _id: 'sample-article-planning-checklist', title: 'A shared campaign planning checklist', slug: 'planning-checklist',
    summary: 'Sample planning questions to align an OOH brief across markets and teams.', language: 'en',
    productSlugs: ['planner', 'inventory'], collectionSlug: 'best-practices', contentType: 'best-practice',
    translationGroupId: 'sample-planning-checklist',
    body: [
      paragraph('planning-brief', 'Sample guidance: document the audience, geographic scope, budget assumptions and intended outcome. Keep market-specific units and currencies explicit.'),
      paragraph('planning-review', 'Review inventory availability and creative requirements with the responsible teams. Record open questions before agreeing on the final plan.'),
    ],
  },
]