import { PortableText, type PortableTextComponents } from '@portabletext/react'
import type { Article, Callout, ImageWithCaption, Procedure, SimpleTable } from '@mw/content'
import { safeHref, sanityImageUrl } from '../../lib/security/urls'

export function contentHeadings(body: Article['body']) {
  return body.flatMap((block) => {
    if (block._type === 'procedure') return [
      { id: `section-${block._key}`, text: block.title },
      ...block.steps.map((step) => ({ id: `section-${block._key}-step-${step._key}`, text: step.title })),
    ]
    if (block._type === 'block' && ['h2', 'h3'].includes(block.style ?? '')) {
      return [{ id: `section-${block._key}`, text: block.children.map((span) => span.text ?? '').join('') }]
    }
    return []
  })
}

const components: Partial<PortableTextComponents> = {
  block: {
    h2: ({ value, children }) => <h2 id={`section-${value._key}`}>{children}</h2>,
    h3: ({ value, children }) => <h3 id={`section-${value._key}`}>{children}</h3>,
  },
  marks: {
    link: ({ value, children }) => {
      const href = safeHref(value?.href)
      return href ? <a href={href} rel="noopener noreferrer">{children}</a> : <span>{children}</span>
    },
  },
  types: {
    callout: ({ value }: { value: Callout }) => <aside className={`callout callout-${value.tone}`}>{value.title && <strong>{value.title}</strong>}<p>{value.text}</p></aside>,
    procedure: ({ value }: { value: Procedure }) => <section><h2 id={`section-${value._key}`}>{value.title}</h2><ol className="procedure">{value.steps.map((step) => <li key={step._key}><h3 id={`section-${value._key}-step-${step._key}`}>{step.title}</h3><p>{step.description}</p></li>)}</ol></section>,
    simpleTable: ({ value }: { value: SimpleTable }) => <div className="table-scroll" tabIndex={0} role="region" aria-label={value.caption}><table><caption>{value.caption}</caption><thead><tr>{value.columns.map((column, index) => <th scope="col" key={`${index}-${column}`}>{column}</th>)}</tr></thead><tbody>{value.rows.map((row) => <tr key={row._key}>{row.cells.map((cell, index) => <td key={index}>{cell}</td>)}</tr>)}</tbody></table></div>,
    imageWithCaption: ({ value }: { value: ImageWithCaption }) => {
      const src = sanityImageUrl(value.image.asset.url)
      return src ? <figure><img src={src} alt={value.alt} loading="lazy" />{value.caption && <figcaption>{value.caption}</figcaption>}</figure> : null
    },
  },
}

export function RichContent({ body }: { body: Article['body'] }) {
  return <div className="prose"><PortableText value={body} components={components} /></div>
}