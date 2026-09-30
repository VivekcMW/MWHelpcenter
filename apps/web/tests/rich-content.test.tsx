// @vitest-environment jsdom

import React from 'react'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { Article } from '@mw/content'
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
})