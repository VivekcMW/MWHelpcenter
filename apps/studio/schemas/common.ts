import {defineField, type ValidationContext} from 'sanity'

export const language = defineField({
  name: 'language',
  type: 'string',
  initialValue: 'en',
  options: {list: [{title: 'English', value: 'en'}, {title: '日本語', value: 'ja'}]},
  validation: (rule) => rule.required().custom((value) =>
    !value || value === 'en' || value === 'ja' ? true : 'Choose English or Japanese.',
  ),
})

export const slug = defineField({
  name: 'slug',
  type: 'slug',
  options: {
    source: 'title',
    maxLength: 96,
    isUnique: async (value, context) => {
      const document = context.document
      if (!document) return true
      const id = document._id.replace(/^drafts\./, '')
      return context.getClient({apiVersion: '2026-09-01'}).fetch<boolean>(
        `count(*[_type == $type && language == $language && slug.current == $slug
          && !(_id in [$id, $draftId]) && !(_id in path("versions.**"))]) == 0`,
        {type: document._type, language: document.language ?? 'en', slug: value, id, draftId: `drafts.${id}`},
      )
    },
  },
  validation: (rule) => rule.required().custom((value) =>
    !value?.current || /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.current) && value.current.length <= 96
      ? true
      : 'Use lowercase letters, digits and single hyphens (maximum 96 characters).',
  ),
})

export const title = defineField({name: 'title', type: 'string', validation: (rule) => rule.required().min(2).max(120)})
export const description = defineField({name: 'description', type: 'text', rows: 3, validation: (rule) => rule.required().max(320)})

export function isSafeHref(value: string): boolean {
  // Block control characters before URL normalization.
  // eslint-disable-next-line no-control-regex
  if (/[\s\\\u0000-\u001f\u007f]/.test(value)) return false
  return /^\/(?!\/)/.test(value) || /^#[\w-]+$/.test(value) || /^(https?:\/\/[^/]+|mailto:[^@]+@[^@]+)$/i.test(value) || /^https?:\/\/[^/]+\//i.test(value)
}

export function isLocalPath(value: unknown): boolean {
  // eslint-disable-next-line no-control-regex -- Control characters are forbidden in redirects.
  return typeof value === 'string' && /^\/(?!\/)[^?#\s\\]*$/.test(value) && !/[\u0000-\u001f\u007f]/.test(value)
}

// Editor validation is not access control. Published references remain strong.
export async function sameLanguage(value: unknown, context: ValidationContext): Promise<true | string> {
  if (!value) return true
  const references = (Array.isArray(value) ? value : [value]) as Array<{_ref?: string}>
  const ids = references.map((reference) => reference?._ref).filter((id): id is string => Boolean(id))
  if (ids.some((id) => /^(drafts|versions)\./.test(id))) return 'Reference a published document ID, not a draft or version ID.'
  if (!ids.length) return true
  const targets = await context.getClient({apiVersion: '2026-09-01'}).fetch<Array<{_id: string; language?: string}>>(
    '*[_id in $ids]{_id, language}', {ids},
  )
  return targets.length === new Set(ids).size && targets.every((target) => target.language === (context.document?.language ?? 'en'))
    ? true : 'Publish the referenced documents in the same language first.'
}