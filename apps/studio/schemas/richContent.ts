import {defineArrayMember, defineField, defineType} from 'sanity'
import {isSafeHref} from './common'

export const callout = defineType({
  name: 'callout', title: 'Callout', type: 'object',
  fields: [
    defineField({name: 'tone', type: 'string', initialValue: 'info', options: {list: ['info', 'tip', 'warning']}, validation: (rule) => rule.required()}),
    defineField({name: 'title', type: 'string', validation: (rule) => rule.max(100)}),
    defineField({name: 'text', type: 'text', validation: (rule) => rule.required().max(1500)}),
  ],
  preview: {select: {title: 'title', subtitle: 'tone'}, prepare: ({title, subtitle}) => ({title: title || 'Callout', subtitle})},
})

export const imageWithCaption = defineType({
  name: 'imageWithCaption', title: 'Image with caption', type: 'object',
  fields: [
    defineField({name: 'image', type: 'image', options: {hotspot: true}, validation: (rule) => rule.required().assetRequired()}),
    defineField({name: 'alt', title: 'Alternative text', type: 'string', validation: (rule) => rule.required().min(3).max(250)}),
    defineField({name: 'caption', type: 'string', validation: (rule) => rule.max(320)}),
  ],
  preview: {select: {title: 'alt', media: 'image'}},
})

export const procedure = defineType({
  name: 'procedure', title: 'Procedure', type: 'object',
  fields: [
    defineField({name: 'title', type: 'string', validation: (rule) => rule.required().max(120)}),
    defineField({name: 'steps', type: 'array', validation: (rule) => rule.required().min(1).max(30), of: [
      defineArrayMember({name: 'procedureStep', type: 'object', fields: [
        defineField({name: 'title', type: 'string', validation: (rule) => rule.required().max(120)}),
        defineField({name: 'description', type: 'text', validation: (rule) => rule.required().max(2000)}),
      ]}),
    ]}),
  ],
})

export const simpleTable = defineType({
  name: 'simpleTable', title: 'Simple table', type: 'object',
  fields: [
    defineField({name: 'caption', type: 'string', validation: (rule) => rule.required().max(200)}),
    defineField({name: 'columns', title: 'Column headers', type: 'array', of: [defineArrayMember({type: 'string', validation: (rule) => rule.required().max(100)})], validation: (rule) => rule.required().min(1).max(8)}),
    defineField({name: 'rows', type: 'array', of: [defineArrayMember({
      name: 'tableRow', type: 'object', fields: [
        defineField({name: 'cells', type: 'array', of: [defineArrayMember({type: 'string', validation: (rule) => rule.required().max(500)})], validation: (rule) => rule.required().min(1).max(8)}),
      ],
    })], validation: (rule) => rule.required().min(1).max(50)}),
  ],
  validation: (rule) => rule.custom((value) => {
    const table = value as {columns?: string[]; rows?: Array<{cells?: string[]}>} | undefined
    return !table?.columns || !table.rows || table.rows.every((row) => row.cells?.length === table.columns?.length)
      ? true : 'Every row must have one cell per column header.'
  }),
})

export const richContent = defineType({
  name: 'richContent', title: 'Rich content', type: 'array',
  of: [
    defineArrayMember({
      type: 'block',
      styles: [{title: 'Normal', value: 'normal'}, {title: 'Heading 2', value: 'h2'}, {title: 'Heading 3', value: 'h3'}, {title: 'Quote', value: 'blockquote'}],
      lists: [{title: 'Bullet', value: 'bullet'}, {title: 'Number', value: 'number'}],
      marks: {
        decorators: [{title: 'Strong', value: 'strong'}, {title: 'Emphasis', value: 'em'}, {title: 'Code', value: 'code'}],
        annotations: [defineArrayMember({name: 'link', type: 'object', fields: [
          defineField({name: 'href', type: 'string', validation: (rule) => rule.required().custom((value) => !value || isSafeHref(value) ? true : 'Use an HTTP(S), mailto, local path or anchor link.')}),
        ]})],
      },
    }),
    defineArrayMember({type: 'callout'}),
    defineArrayMember({type: 'imageWithCaption'}),
    defineArrayMember({type: 'procedure'}),
    defineArrayMember({type: 'simpleTable'}),
  ],
})