export function safeHref(value: unknown): string | undefined {
  // Reject control characters deliberately: URL parsers can otherwise normalize them.
  // eslint-disable-next-line no-control-regex
  if (typeof value !== 'string' || value !== value.trim() || /[\u0000-\u001f\u007f\\]/.test(value) || value.startsWith('//')) return undefined
  try {
    const url = new URL(value, 'https://help.example.invalid')
    return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? value : undefined
  } catch { return undefined }
}

export function sanityImageUrl(value: string) {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.hostname !== 'cdn.sanity.io' || !url.pathname.startsWith('/images/')) return undefined
    url.searchParams.set('w', '1200')
    url.searchParams.set('fit', 'max')
    url.searchParams.set('auto', 'format')
    return url.toString()
  } catch { return undefined }
}