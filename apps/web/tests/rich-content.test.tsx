// @vitest-environment jsdom

import React from 'react'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { Article, PortableTextBlock } from '@mw/content'
import { contentHeadings, RichContent } from '../app/components/content/rich-content'

afterEach(cleanup)

describe('article table of contents', () => {
  it('links every heading, including procedure steps, to its rendered target', () => {
    const body: Article['body'] = [
      { _type: 'block', _key: 'overview', style: 'h2', markDefs: [], children: [{ _type: 'span', _key: 'text', text: 'Overview', marks: [] }] },
      { _type: 'block', _key: 'detail', style: 'h3', markDefs: [], children: [{ _type: 'span', _key: 'text', text: '詳細', marks: [] }] },
      ...['first', 'second'].map((key) => ({
        _type: 'procedure' as const, _key: key, title: `Procedure ${key}`,
        steps: [{ _type: 'procedureStep' as const, _key: 'shared-step-key', title: '確認する', description: 'Check the source.' }],
      })),
    ]
    const { container } = render(<RichContent body={body} />)
    const headings = contentHeadings(body)
    const rendered = [...container.querySelectorAll('h2, h3')].map((node) => ({ id: node.id, text: node.textContent }))
    expect(headings).toEqual(rendered)
    expect(headings).toHaveLength(6)
    expect(new Set(headings.map(({ id }) => id)).size).toBe(6)
    expect(headings[3].id).toBe('section-first-step-shared-step-key')
    expect(headings[5].id).toBe('section-second-step-shared-step-key')
  })

  it('does not invent headings for empty bodies or ordinary paragraphs', () => {
    expect(contentHeadings([])).toEqual([])
    expect(contentHeadings([{ _type: 'block', _key: 'paragraph', style: 'normal', children: [{ _type: 'span', text: 'Body text' }] }])).toEqual([])
  })

  it('renders animated images, accessible video/audio players, transcripts, and safe file downloads', () => {
    const body: PortableTextBlock[] = [
      {_type: 'animatedImageWithCaption', _key: 'animation', file: {_type: 'file', asset: {_id: 'gif', url: 'https://cdn.sanity.io/files/project/gif/demo.gif', mimeType: 'image/gif', originalFilename: 'demo.gif'}}, alt: 'Animated demo', caption: 'Animation'},
      {_type: 'videoWithCaption', _key: 'video', video: {_type: 'file', asset: {_id: 'video', url: 'https://cdn.sanity.io/files/project/video/demo.mp4', mimeType: 'video/mp4', originalFilename: 'demo.mp4'}}, title: 'Video demo', poster: {_type: 'image', asset: {_id: 'poster', url: 'https://cdn.sanity.io/images/project/poster.jpg'}}, caption: 'Video caption', captions: [{_key: 'en', language: 'en', label: 'English', file: {_type: 'file', asset: {_id: 'vtt', url: 'https://cdn.sanity.io/files/project/vtt/demo.vtt', mimeType: 'text/vtt', originalFilename: 'demo.vtt'}}}], transcript: 'Video transcript'},
      {_type: 'audioWithTranscript', _key: 'audio', audio: {_type: 'file', asset: {_id: 'audio', url: 'https://cdn.sanity.io/files/project/audio/demo.mp3', mimeType: 'audio/mpeg', originalFilename: 'demo.mp3'}}, title: 'Audio demo', transcript: 'Audio transcript'},
      {_type: 'downloadableFile', _key: 'file', file: {_type: 'file', asset: {_id: 'pdf', url: 'https://cdn.sanity.io/files/project/pdf/guide.pdf', mimeType: 'application/pdf', originalFilename: 'guide.pdf'}}, title: 'PDF guide'},
      {_type: 'videoWithCaption', _key: 'unsafe', video: {_type: 'file', asset: {_id: 'bad', url: 'https://evil.test/video.mp4', mimeType: 'video/mp4'}}, title: 'Unsafe video'},
    ]
    const {container} = render(<RichContent body={body as Article['body']} />)

    const animation = container.querySelector('img[alt="Animated demo"]')
    expect(animation?.getAttribute('src')).toBe('https://cdn.sanity.io/files/project/gif/demo.gif')
    expect(container.querySelector('video[aria-label="Video demo"][controls]')).not.toBeNull()
    expect(container.querySelector('video track[kind="captions"][srclang="en"]')).not.toBeNull()
    expect(container.querySelector('details summary')?.textContent).toBe('Video transcript')
    expect(container.querySelector('audio[aria-label="Audio demo"][controls]')).not.toBeNull()
    expect(container.querySelectorAll('details summary')[1]?.textContent).toBe('Audio transcript')
    expect(container.querySelector('a[download="guide.pdf"]')?.getAttribute('href')).toBe('https://cdn.sanity.io/files/project/pdf/guide.pdf?dl=')
    expect(container.querySelector('video[aria-label="Unsafe video"]')).toBeNull()
  })
})