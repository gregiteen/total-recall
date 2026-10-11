import type { CSSProperties } from 'react'
import type { CardBranding } from './contract'

const FONT_STACKS: Record<string, string> = {
  system: 'system-ui, -apple-system, "Segoe UI", sans-serif',
  inter: 'Inter, system-ui, sans-serif',
  'ibm-plex': '"IBM Plex Sans", system-ui, sans-serif',
  'space-grotesk': '"Space Grotesk", system-ui, sans-serif',
  'jetbrains-mono': '"JetBrains Mono", ui-monospace, monospace',
  'dm-sans': '"DM Sans", system-ui, sans-serif',
  outfit: 'Outfit, system-ui, sans-serif',
  fraunces: 'Fraunces, Georgia, serif',
  newsreader: 'Newsreader, Georgia, serif',
  'chivo-mono': '"Chivo Mono", ui-monospace, monospace',
}
const RADIUS = { none: '0px', sm: '3px', md: '8px', lg: '14px', pill: '22px' }
const GAP = { compact: '8px', comfortable: '14px', spacious: '22px' }

/** WCAG relative luminance; text on a brand fill uses whichever ink reads better. */
function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
export const contrast = (a: string, b: string) => { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05) }
export const inkOn = (fill: string) => contrast(fill, '#ffffff') >= contrast(fill, '#111111') ? '#ffffff' : '#111111'

export function brandStyle(branding: CardBranding): CSSProperties {
  return {
    '--card-color': branding.color, '--card-accent': branding.accent,
    '--card-on-color': inkOn(branding.color), '--card-on-accent': inkOn(branding.accent),
    '--card-font': FONT_STACKS[branding.font] || FONT_STACKS.system,
    '--card-radius': RADIUS[branding.radius], '--card-gap': GAP[branding.density],
    fontFamily: 'var(--card-font)',
  } as CSSProperties
}
