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

// Keep animated image bytes intact: image URL transformations can strip animation.
export const animatedImageWithCaption = defineType({
  name: 'animatedImageWithCaption', title: 'Animated image (GIF/WebP/APNG)', type: 'object',
  fields: [
    defineField({name: 'file', title: 'Animated image file', type: 'file', options: {accept: 'image/gif,image/webp,image/apng'}, validation: (rule) => rule.required().assetRequired()}),
    defineField({name: 'alt', title: 'Alternative text', type: 'string', validation: (rule) => rule.required().min(3).max(250)}),
    defineField({name: 'caption', type: 'string', validation: (rule) => rule.max(320)}),
  ],
  preview: {select: {title: 'alt'}},
})

export const videoWithCaption = defineType({
  name: 'videoWithCaption', title: 'Video', type: 'object',
  fields: [
    defineField({name: 'video', title: 'Video file', type: 'file', options: {accept: 'video/mp4,video/webm,video/ogg'}, validation: (rule) => rule.required().assetRequired()}),
    defineField({name: 'title', type: 'string', validation: (rule) => rule.required().max(120)}),
    defineField({name: 'poster', title: 'Poster image', type: 'image', options: {hotspot: true}}),
    defineField({name: 'caption', type: 'string', validation: (rule) => rule.max(320)}),
    defineField({name: 'captions', title: 'Caption tracks (.vtt)', type: 'array', of: [defineArrayMember({
      name: 'captionTrack', type: 'object', fields: [
        defineField({name: 'language', type: 'string', validation: (rule) => rule.required().max(16)}),
        defineField({name: 'label', type: 'string', validation: (rule) => rule.required().max(64)}),
        defineField({name: 'file', title: 'WebVTT file', type: 'file', options: {accept: 'text/vtt,.vtt'}, validation: (rule) => rule.required().assetRequired()}),
      ],
    })], validation: (rule) => rule.max(10)}),
    defineField({name: 'transcript', type: 'text', rows: 5, validation: (rule) => rule.max(12000)}),
  ],
  validation: (rule) => rule.custom((value) => {
    const video = value as {captions?: unknown[]; transcript?: string} | undefined
    return !video || video.captions?.length || video.transcript?.trim()
      ? true : 'Add captions or a transcript so the video is accessible without audio.'
  }),
  preview: {select: {title: 'title', media: 'poster'}},
})

export const audioWithTranscript = defineType({
  name: 'audioWithTranscript', title: 'Audio', type: 'object',
  fields: [
    defineField({name: 'audio', title: 'Audio file', type: 'file', options: {accept: 'audio/mpeg,audio/mp4,audio/ogg,audio/wav,audio/webm'}, validation: (rule) => rule.required().assetRequired()}),
    defineField({name: 'title', type: 'string', validation: (rule) => rule.required().max(120)}),
    defineField({name: 'caption', type: 'string', validation: (rule) => rule.max(320)}),
    defineField({name: 'captions', title: 'Caption tracks (.vtt)', type: 'array', of: [defineArrayMember({
      name: 'captionTrack', type: 'object', fields: [
        defineField({name: 'language', type: 'string', validation: (rule) => rule.required().max(16)}),
        defineField({name: 'label', type: 'string', validation: (rule) => rule.required().max(64)}),
        defineField({name: 'file', title: 'WebVTT file', type: 'file', options: {accept: 'text/vtt,.vtt'}, validation: (rule) => rule.required().assetRequired()}),
      ],
    })], validation: (rule) => rule.max(10)}),
    defineField({name: 'transcript', type: 'text', rows: 6, validation: (rule) => rule.required().min(1).max(20000)}),
  ],
  preview: {select: {title: 'title'}},
})

export const downloadableFile = defineType({
  name: 'downloadableFile', title: 'Downloadable file', type: 'object',
  fields: [
    defineField({name: 'file', title: 'File', type: 'file', validation: (rule) => rule.required().assetRequired()}),
    defineField({name: 'title', type: 'string', validation: (rule) => rule.required().max(120)}),
    defineField({name: 'caption', type: 'string', validation: (rule) => rule.max(320)}),
  ],
  preview: {select: {title: 'title'}},
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

export const codeBlock = defineType({
  name: 'codeBlock', title: 'Code block', type: 'object',
  fields: [
    defineField({name: 'language', type: 'string', validation: (rule) => rule.max(40)}),
    defineField({name: 'code', type: 'text', rows: 10, validation: (rule) => rule.required().max(50000)}),
  ],
  preview: {select: {title: 'language'}, prepare: ({title}) => ({title: title ? `Code (${title})` : 'Code block'})},
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
    defineArrayMember({type: 'animatedImageWithCaption'}),
    defineArrayMember({type: 'videoWithCaption'}),
    defineArrayMember({type: 'audioWithTranscript'}),
    defineArrayMember({type: 'downloadableFile'}),
    defineArrayMember({type: 'procedure'}),
    defineArrayMember({type: 'simpleTable'}),
    defineArrayMember({type: 'codeBlock'}),
  ],
})