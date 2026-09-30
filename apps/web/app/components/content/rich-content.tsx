import { PortableText, type PortableTextComponents } from '@portabletext/react'
import type { AnimatedImageWithCaption, Article, AudioWithTranscript, Callout, DownloadableFile, ImageWithCaption, Procedure, SanityFileAsset, SimpleTable, VideoWithCaption } from '@mw/content'
import { safeHref, sanityFileUrl, sanityImageUrl } from '../../lib/security/urls'

const animatedImageTypes = new Set(['image/gif', 'image/webp', 'image/apng'])
const videoTypes = new Set(['video/mp4', 'video/webm', 'video/ogg'])
const audioTypes = new Set(['audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/webm', 'audio/aac'])

function allowedFileUrl(asset: SanityFileAsset | undefined, mimeTypes: Set<string>, download = false) {
  if (!asset || !mimeTypes.has(asset.mimeType.toLowerCase().split(';')[0].trim())) return undefined
  return sanityFileUrl(asset.url, download)
}

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
    animatedImageWithCaption: ({ value }: { value: AnimatedImageWithCaption }) => {
      const src = allowedFileUrl(value.file.asset, animatedImageTypes)
      return src ? <figure className="article-media"><img src={src} alt={value.alt} loading="lazy" />{value.caption && <figcaption>{value.caption}</figcaption>}</figure> : null
    },
    videoWithCaption: ({ value }: { value: VideoWithCaption }) => {
      const src = allowedFileUrl(value.video.asset, videoTypes)
      if (!src) return null
      const poster = value.poster?.asset?.url ? sanityImageUrl(value.poster.asset.url) : undefined
      return <figure className="article-media">
        <video controls preload="metadata" playsInline aria-label={value.title} poster={poster}>
          <source src={src} type={value.video.asset.mimeType} />
          {(value.captions || []).map((track) => {
            const trackSrc = allowedFileUrl(track.file.asset, new Set(['text/vtt']))
            return trackSrc ? <track key={track._key} kind="captions" src={trackSrc} srcLang={track.language} label={track.label} /> : null
          })}
          Your browser does not support embedded video. {value.title}
        </video>
        {value.caption && <figcaption>{value.caption}</figcaption>}
        {value.transcript && <details className="media-transcript"><summary>Video transcript</summary><p>{value.transcript}</p></details>}
      </figure>
    },
    audioWithTranscript: ({ value }: { value: AudioWithTranscript }) => {
      const src = allowedFileUrl(value.audio.asset, audioTypes)
      if (!src) return null
      return <figure className="article-media">
        <figcaption>{value.title}{value.caption && ` — ${value.caption}`}</figcaption>
        <audio controls preload="metadata" aria-label={value.title}>
          <source src={src} type={value.audio.asset.mimeType} />
          {(value.captions || []).map((track) => {
            const trackSrc = allowedFileUrl(track.file.asset, new Set(['text/vtt']))
            return trackSrc ? <track key={track._key} kind="captions" src={trackSrc} srcLang={track.language} label={track.label} /> : null
          })}
          Your browser does not support embedded audio. {value.title}
        </audio>
        <details className="media-transcript"><summary>Audio transcript</summary><p>{value.transcript}</p></details>
      </figure>
    },
    downloadableFile: ({ value }: { value: DownloadableFile }) => {
      const href = sanityFileUrl(value.file.asset.url, true)
      return href ? <aside className="downloadable-file"><a href={href} download={value.file.asset.originalFilename || undefined} rel="noopener noreferrer">Download: {value.title}</a>{value.caption && <p>{value.caption}</p>}</aside> : null
    },
  },
}

export function RichContent({ body }: { body: Article['body'] }) {
  return <div className="prose"><PortableText value={body} components={components} /></div>
}