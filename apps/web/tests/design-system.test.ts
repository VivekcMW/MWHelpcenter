import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8')
const tokens = read('../app/styles/tokens.css')
const components = read('../app/styles/components.css')
const layout = read('../app/styles/globals.css')
const motion = read('../app/styles/motion.css')
const feedback = read('../app/styles/feedback.css')
const root = read('../app/root.tsx')
const variables = new Map([...tokens.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((match) => [match[1], match[2].trim()]))

function resolve(name: string, visited = new Set<string>()): string {
  if (visited.has(name)) throw new Error(`Circular token: ${name}`)
  visited.add(name)
  const value = variables.get(name)
  if (!value) throw new Error(`Undefined token: ${name}`)
  return value.replace(/var\((--[\w-]+)\)/g, (_, reference: string) => resolve(reference, new Set(visited)))
}

function luminance(hex: string) {
  if (!/^#[\da-f]{6}$/i.test(hex)) throw new Error(`Expected hex color: ${hex}`)
  const channels = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map((channel) => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4)
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722
}

function contrast(foreground: string, background: string) {
  const values = [luminance(resolve(foreground)), luminance(resolve(background))]
  return (Math.max(...values) + .05) / (Math.min(...values) + .05)
}

describe('Movingwalls design system', () => {
  it.each([
    ['--mw-primary-600', '#1D65AF'],
    ['--mw-primary-700', '#165499'],
    ['--mw-secondary-600', '#EA580C'],
    ['--mw-flow-600', '#0D9488'],
    ['--mw-gray-900', '#111827'],
    ['--mw-radius', '6px'],
  ])('preserves source foundation %s', (token, value) => {
    expect(resolve(token)).toBe(value)
  })

  it('resolves all tokens used by components and layout without cycles', () => {
    for (const match of `${tokens}\n${components}\n${layout}\n${motion}\n${feedback}`.matchAll(/var\((--[\w-]+)\)/g)) {
      expect(resolve(match[1])).not.toContain('var(')
    }
  })

  it('keeps palette literals in the foundation layer', () => {
    expect(components + layout + motion + feedback).not.toMatch(/#[\da-f]{3,8}\b|\brgba?\(/i)
  })

  it.each([
    ['--mw-text', '--mw-page-bg'],
    ['--mw-text-muted', '--mw-page-bg'],
    ['--mw-text-muted', '--mw-info-bg'],
    ['--mw-on-action', '--mw-action'],
    ['--mw-on-action', '--mw-action-hover'],
    ['--mw-info-text', '--mw-info-bg'],
    ['--mw-tip-text', '--mw-tip-bg'],
    ['--mw-warning-text', '--mw-warning-bg'],
    ['--mw-danger-text', '--mw-danger-bg'],
    ['--mw-green-700', '--mw-green-50'],
    ['--mw-secondary-700', '--mw-secondary-50'],
  ])('%s text passes AA on %s', (foreground, background) => {
    expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5)
  })

  it.each(['--mw-surface', '--mw-page-bg', '--mw-info-bg'])('keeps control borders and focus visible against %s', (background) => {
    expect(contrast('--mw-border-control', background)).toBeGreaterThanOrEqual(3)
    expect(contrast('--mw-focus', background)).toBeGreaterThanOrEqual(3)
  })

  it('self-hosts actual Poppins weights and loads styles in dependency order', () => {
    for (const weight of [400, 500, 600, 700]) expect(root).toContain(`@fontsource/poppins/latin-${weight}.css`)
    expect(root.indexOf("'./styles/tokens.css'")).toBeLessThan(root.indexOf("'./styles/components.css'"))
    expect(root.indexOf("'./styles/components.css'")).toBeLessThan(root.indexOf("'./styles/globals.css'"))
    expect(root.indexOf("'./styles/globals.css'")).toBeLessThan(root.indexOf("'./styles/motion.css'"))
    expect(root.indexOf("'./styles/motion.css'")).toBeLessThan(root.indexOf("'./styles/feedback.css'"))
    expect(tokens + root).not.toContain('fonts.googleapis.com')
    expect(root).toContain(`content="${resolve('--mw-primary-600')}"`)
  })

  it('provides keyboard and reduced-motion states', () => {
    expect(components).toContain(':focus-visible')
    expect(components).toContain(':disabled')
    expect(components).toContain('[aria-invalid=true]')
    expect(layout).toContain('@media (prefers-reduced-motion: reduce)')
    expect(layout).toContain('.task-card:hover, .product-card:hover { transform: none; }')
  })

  it('ships the original logo as a local image without executable content', () => {
    const logo = read('../public/mw-logo.svg')
    expect(logo).toContain('viewBox="0 0 1788 832"')
    expect(logo).not.toMatch(/<script|<foreignObject|\son\w+=/i)
    expect(read('../app/components/layout/site-shell.tsx')).toContain('src="/mw-logo.svg"')
    expect(read('../app/components/layout/site-header.tsx')).toContain('src="/mw-logo.svg"')
  })

  it('aligns header typography with the reference and preserves native mobile access', () => {
    expect(layout).toContain('font: var(--mw-weight-medium) var(--mw-text-base)/1.4286 var(--mw-font-sans)')
    expect(resolve('--mw-text-base')).toBe('14px')
    expect(resolve('--mw-weight-medium')).toBe('500')
    expect(layout).toContain('@media (max-width: 1023px)')
    expect(layout).toContain('.mobile-navigation[open] .menu-close-icon')
    expect(layout).toContain('.main-nav a:is(:hover, :focus-visible, [aria-current])::after')
    expect(layout).toContain('.site-header .language-select-wrap select { font-size: 16px; width: 132px; }')
    const header = read('../app/components/layout/site-header.tsx')
    expect(header).toContain('<details className="mobile-navigation"')
    expect(header).toContain('<summary>')
    expect(header).not.toContain('role="menu"')
    expect(motion).toContain('.mobile-navigation[open] > nav { animation: mw-page-enter')
  })

  it('limits motion to explicit user preference and fine-pointer hover', () => {
    expect(motion).toContain('@media (prefers-reduced-motion: no-preference)')
    expect(motion).toContain('@media (prefers-reduced-motion: reduce)')
    expect(motion).toContain('@media (hover: hover) and (pointer: fine)')
    expect(motion).not.toMatch(/transition:\s*all\b|will-change:/)
    expect(resolve('--mw-duration-slow')).toBe('320ms')
    expect(resolve('--mw-duration-stagger')).toBe('40ms')
  })

  it('keeps route entrances independent of query and hash changes', () => {
    const shell = read('../app/components/layout/site-shell.tsx')
    expect(shell).toContain('const { pathname } = useLocation()')
    expect(shell).toContain('className="route-content" key={pathname}')
    expect(shell).not.toContain('key={location.key}')
    expect(motion).toContain('.route-content, .error-page { animation: mw-page-enter')
    expect(motion).not.toMatch(/animation[^;{]*\bforwards\b/)
  })

  it('uses real router pending state and an independent accessible announcement', () => {
    const shell = read('../app/components/layout/site-shell.tsx')
    expect(shell).toContain("const pending = navigation.state !== 'idle'")
    expect(shell).toContain('hidden={!pending} aria-hidden="true"')
    expect(shell).toContain('role="status" aria-live="polite" aria-atomic="true"')
    expect(shell.indexOf('role="status"')).toBeLessThan(shell.indexOf('<main'))
    expect(shell).toContain('aria-busy={pending}')
    expect(motion).toContain('.navigation-progress:not([hidden])')
    expect(motion).toContain('var(--mw-duration-feedback-delay)')
  })

  it('keeps search operable and only spins for its own submission', () => {
    const search = read('../app/components/ui/search-form.tsx')
    expect(search).toContain('navigation.formAction === action')
    expect(search).toContain("navigation.formData?.has('q') === true")
    expect(search).toContain('className="search-spinner"')
    expect(search).toContain('aria-busy={pending}')
    expect(search).not.toContain('disabled={pending}')
    expect(search).not.toContain('setTimeout')
  })

  it('reuses reference feedback patterns with reduced-motion and mobile safeguards', () => {
    for (const name of ['.mw-spinner', '.mw-skeleton', '.mw-modal-panel', '.mw-toast']) expect(feedback).toContain(name)
    expect(feedback).toContain('@media (prefers-reduced-motion: no-preference)')
    expect(feedback).toContain('@media (prefers-reduced-motion: reduce)')
    expect(feedback).toContain('.mw-pending-indicator[hidden] { display: none; }')
    expect(feedback).toContain('100dvh')
    expect(feedback).toContain('var(--mw-control-height)')
    expect(feedback).not.toMatch(/transition:\s*all\b|will-change:/)
  })
})