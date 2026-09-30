import type {Article, Collection, PortableTextBlock, Product} from './types'

// Original illustrative samples, NOT verified product instructions or seeded data.
export const japaneseProducts: Product[] = [
  {_id: 'sample-product-inventory-ja', title: 'Inventory', slug: 'inventory', description: '屋外広告の広告枠と空き状況を整理・管理します。', icon: 'map-pin', order: 1, language: 'ja'},
  {_id: 'sample-product-planner-ja', title: 'Planner', slug: 'planner', description: 'オーディエンスを分析し、OOH キャンペーンの計画を立てます。', icon: 'compass', order: 2, language: 'ja'},
  {_id: 'sample-product-influence-ja', title: 'Influence', slug: 'influence', description: 'キャンペーンの実施と配信を調整します。', icon: 'megaphone', order: 3, language: 'ja'},
  {_id: 'sample-product-measure-ja', title: 'Measure', slug: 'measure', description: 'キャンペーンの効果測定とレポートを把握します。', icon: 'chart-bar', order: 4, language: 'ja'},
  {_id: 'sample-product-cms-ja', title: 'CMS', slug: 'cms', description: 'デジタルスクリーン向けのコンテンツを準備・整理します。', icon: 'monitor', order: 5, language: 'ja'},
  {_id: 'sample-product-admin-console-ja', title: 'Admin Console', slug: 'admin-console', description: 'ワークスペースの管理とアクセス権限について確認します。', icon: 'settings', order: 6, language: 'ja'},
]

export const japaneseCollections: Collection[] = [
  {_id: 'sample-collection-getting-started-ja', title: 'はじめに', slug: 'getting-started', description: 'OOH の作業を始める前に、チームで基本的な認識をそろえましょう。', language: 'ja'},
  {_id: 'sample-collection-best-practices-ja', title: 'ベストプラクティス', slug: 'best-practices', description: 'キャンペーンをわかりやすく、一貫して運用するための基本的な確認事項です。', language: 'ja'},
  {_id: 'sample-collection-inventory-imports-ja', title: '広告枠のインポート', slug: 'inventory-imports', description: 'スムーズに引き継げるよう、広告枠のデータを準備しましょう。', language: 'ja', productSlug: 'inventory'},
]

function paragraph(key: string, text: string): PortableTextBlock {
  return {_key: key, _type: 'block', style: 'normal', markDefs: [], children: [{_key: `${key}-text`, _type: 'span', text, marks: []}]}
}

export const japaneseArticles: Article[] = [
  {
    _id: 'sample-article-getting-started-ja', title: 'OOH ワークスペースの利用を始める', slug: 'getting-started',
    summary: '屋外広告キャンペーンを計画するチーム向けの、初期確認用チェックリストのサンプルです。', language: 'ja',
    productSlugs: japaneseProducts.map((product) => product.slug), collectionSlug: 'getting-started', contentType: 'overview',
    translationGroupId: 'sample-getting-started',
    body: [
      paragraph('start-intro', 'サンプルガイド：作業の進め方を選ぶ前に、キャンペーンの目標、対象市場、実施期間について合意しましょう。タイムゾーンとレポートに使用する通貨もチームで確認してください。'),
      {_key: 'start-tip', _type: 'callout', tone: 'info', title: 'サンプルコンテンツ', text: 'これはヘルプセンターのサンプルコンテンツです。実際のアカウント設定や利用できる機能は異なる場合があります。'},
      paragraph('start-next', '広告枠の管理、プランニング、クリエイティブの配信、効果測定の担当者を明確にしましょう。ご自身のロールでアクセスできる範囲は、ワークスペース管理者に確認してください。'),
    ],
    seo: {title: 'はじめに | Moving Walls ヘルプセンター', description: '屋外広告キャンペーン用ワークスペースの利用を始めるためのサンプルガイドです。'},
  },
  {
    _id: 'sample-article-import-inventories-ja', title: '広告枠をインポートする前にデータを準備する', slug: 'import-inventories',
    summary: 'インポート前に広告枠の識別子、設置場所、スクリーン情報を確認するためのサンプルです。', language: 'ja',
    productSlugs: ['inventory'], collectionSlug: 'inventory-imports', contentType: 'guide',
    translationGroupId: 'sample-import-inventories',
    body: [
      paragraph('import-intro', 'サンプルガイド：アカウント担当チームから最新のインポート用テンプレートを入手してください。特定のファイル形式や列構成がサポートされているとは限りません。'),
      {_key: 'import-procedure', _type: 'procedure', title: '少量のテストデータを準備する', steps: [
        {_key: 'import-identifiers', _type: 'procedureStep', title: '識別子を確認する', description: '広告枠の識別子を統一し、意図しない重複を取り除いてください。'},
        {_key: 'import-locations', _type: 'procedureStep', title: '設置場所を確認する', description: '市場名、座標、単位をデータ提供元の担当者と確認してください。'},
        {_key: 'import-test', _type: 'procedureStep', title: 'テスト方法について合意する', description: '大量のデータをインポートする前に、少量のデータをアカウント担当チームと確認してください。'},
      ]},
    ],
  },
  {
    _id: 'sample-article-campaign-delivery-checks-ja', title: 'キャンペーン配信の確認事項', slug: 'campaign-delivery-checks',
    summary: '配信予定と取得できるレポートを比較する際の、トラブルシューティング用の確認事項のサンプルです。', language: 'ja',
    productSlugs: ['influence', 'measure', 'cms'], collectionSlug: 'best-practices', contentType: 'troubleshooting',
    translationGroupId: 'sample-campaign-delivery-checks',
    body: [
      paragraph('delivery-intro', 'サンプルガイド：配信実績の合計を確認する前に、同じキャンペーン、期間、タイムゾーンで比較していることを確かめましょう。アカウント担当チームと確認した、レポートへの反映にかかる時間も考慮してください。'),
      {_key: 'delivery-table', _type: 'simpleTable', caption: '配信状況の確認用チェックリストの例', columns: ['確認項目', '確認する内容'], rows: [
        {_key: 'delivery-dates', _type: 'tableRow', cells: ['スケジュール', 'キャンペーンの実施期間とタイムゾーンは一致していますか？']},
        {_key: 'delivery-assets', _type: 'tableRow', cells: ['クリエイティブ', '予定しているクリエイティブは、選択したスクリーンでの配信が承認されていますか？']},
        {_key: 'delivery-reporting', _type: 'tableRow', cells: ['レポート', 'すべての比較で同じ集計期間を使用していますか？']},
      ]},
      paragraph('delivery-support', '不一致が解消しない場合は、キャンペーンの識別子、集計期間、問題の簡潔な説明を、指定のサポート窓口にお知らせください。パスワードやアクセストークンは含めないでください。'),
    ],
  },
  {
    _id: 'sample-article-planning-checklist-ja', title: 'チームで共有するキャンペーン計画チェックリスト', slug: 'planning-checklist',
    summary: '市場やチームをまたいで OOH キャンペーンの要件をそろえるための、計画時の確認事項のサンプルです。', language: 'ja',
    productSlugs: ['planner', 'inventory'], collectionSlug: 'best-practices', contentType: 'best-practice',
    translationGroupId: 'sample-planning-checklist',
    body: [
      paragraph('planning-brief', 'サンプルガイド：対象オーディエンス、対象地域、予算の前提条件、目指す成果を文書にまとめましょう。市場ごとに異なる単位や通貨を明記してください。'),
      paragraph('planning-review', '広告枠の空き状況とクリエイティブの要件を、各担当チームと確認しましょう。最終計画に合意する前に、未解決の疑問点を記録してください。'),
    ],
  },
]