// Decorative by default: callers provide a single localized busy announcement.
export function Spinner({ size = 'sm', className = '' }: {
  readonly size?: 'sm' | 'md' | 'lg'; readonly className?: string
}) {
  return <span className={`mw-spinner mw-spinner--${size} ${className}`} aria-hidden="true" />
}