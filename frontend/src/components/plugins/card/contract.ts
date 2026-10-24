import type { PluginInfo } from '../../../api/plugins'

export type ArgType = 'string' | 'number' | 'boolean' | 'choice'
export type Effect = 'read' | 'write' | 'destructive' | 'send'

export interface CardArg { name: string; flag?: string; positional?: boolean; label: string; type: ArgType; options?: Array<string | number>; required?: boolean; secret?: boolean }
export interface CardCommand { name: string; description?: string; args: CardArg[]; effect: Effect; output: 'json' | 'text'; timeoutMs?: number }
export interface CardBranding {
  name: string; color: string; accent: string; font: string; density: 'compact' | 'comfortable' | 'spacious'
  radius: 'none' | 'sm' | 'md' | 'lg' | 'pill'; header: 'plain' | 'ledger-rule' | 'band' | 'tab-strip' | 'badge-left'
  badge?: string; logo?: string; provider?: { name: string; url?: string }
}
export interface CardWorkspace {
  component?: string;
  tabs?: string[];
  permissions?: string[];
}
/** The plugin's own card face. Layout belongs to the plugin, never to a shared template. */
export interface CardFace { id: string; tag: string; module: string; description?: string }
export interface Card {
  id: string; title: string; description: string; face?: CardFace
  commands: Map<string, CardCommand>; branding: CardBranding; status?: { command: string; refreshSeconds: number }
  distribution?: { tier: string; license: string }
  workspace?: CardWorkspace
}

const FONTS = ['system', 'inter', 'ibm-plex', 'space-grotesk', 'jetbrains-mono', 'dm-sans', 'outfit', 'fraunces', 'newsreader', 'chivo-mono']
const HEX = /^#[0-9a-fA-F]{6}$/
/** Manifest JSON is untyped input; every field is checked before it is used. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Loose = any
const obj = (v: unknown): Record<string, Loose> => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, Loose> : {})

function normalizeArg(raw: unknown): CardArg | null {
  const a = obj(raw)
  if (typeof a.name !== 'string' || typeof a.label !== 'string') return null
  const type = ['string', 'number', 'boolean', 'choice'].includes(a.type) ? a.type : 'string'
  return { name: a.name, flag: typeof a.flag === 'string' ? a.flag : undefined, positional: a.positional === true, label: a.label, type, options: Array.isArray(a.options) ? a.options : undefined, required: a.required === true, secret: a.secret === true }
}

export function normalizeCard(plugin: PluginInfo): Card {
  const manifest = obj(plugin.manifest)
  const commands = new Map<string, CardCommand>()
  for (const sub of plugin.cli?.subcommands || []) {
    const declared = obj(manifest.cli?.subcommands?.find((item: Loose) => item?.name === sub.name))
    commands.set(sub.name, {
      name: sub.name, description: sub.description,
      args: (Array.isArray(declared.args) ? declared.args : []).map(normalizeArg).filter(Boolean) as CardArg[],
      // A grouped command such as `config set` may write. Only explicit read declarations are safe.
      effect: ['read', 'write', 'destructive', 'send'].includes(declared.effect) ? declared.effect : 'write',
      output: declared.output === 'text' ? 'text' : 'json',
      timeoutMs: Number.isFinite(declared.timeout_ms) ? declared.timeout_ms : undefined,
    })
  }
  const b = obj(manifest.branding)
  const branding: CardBranding = {
    name: typeof b.name === 'string' ? b.name : plugin.name,
    color: HEX.test(b.color) ? b.color : '#475569',
    accent: HEX.test(b.accent) ? b.accent : HEX.test(b.color) ? b.color : '#0ea5e9',
    font: FONTS.includes(b.font) ? b.font : 'system',
    density: ['compact', 'comfortable', 'spacious'].includes(b.density) ? b.density : 'comfortable',
    radius: ['none', 'sm', 'md', 'lg', 'pill'].includes(b.radius) ? b.radius : 'md',
    header: ['plain', 'ledger-rule', 'band', 'tab-strip', 'badge-left'].includes(b.header) ? b.header : 'plain',
    badge: typeof b.badge === 'string' ? b.badge : undefined,
    logo: typeof b.logo === 'string' ? b.logo : undefined,
    provider: obj(b.provider).name ? { name: String(b.provider.name), url: typeof b.provider.url === 'string' ? b.provider.url : undefined } : undefined,
  }
  const status = obj(manifest.status)
  const statusCommand = typeof status.command === 'string' && commands.has(status.command) ? status.command : undefined
  // The face is the plugin's own component; there is no shared layout to fall back to.
  // Only `kind: 'card'` is the face. A plugin may declare any number of
  // `kind: 'panel'` screens, and one declared before the card is still a
  // secondary screen, never the face.
  const elements: Loose[] = Array.isArray(manifest.ui?.elements) ? manifest.ui.elements : (Array.isArray(plugin.ui?.elements) ? plugin.ui.elements : [])
  const declared = elements.find((element: Loose) => element && typeof element === 'object' && element.kind === 'card')
  const face: CardFace | undefined = declared && typeof declared.id === 'string' && typeof declared.tag === 'string' && typeof declared.module === 'string'
    ? { id: declared.id, tag: declared.tag, module: declared.module, description: typeof declared.description === 'string' ? declared.description : undefined }
    : undefined
  const ws = obj(manifest.workspace)
  const workspace: CardWorkspace | undefined = ws && (ws.component || Array.isArray(ws.tabs)) ? {
    component: typeof ws.component === 'string' ? ws.component : undefined,
    tabs: Array.isArray(ws.tabs) ? ws.tabs.filter((t: unknown) => typeof t === 'string') : undefined,
    permissions: Array.isArray(ws.permissions) ? ws.permissions.filter((p: unknown) => typeof p === 'string') : undefined,
  } : undefined
  return {
    id: plugin.id, title: branding.name, description: plugin.description, face, commands, branding,
    status: statusCommand ? { command: statusCommand, refreshSeconds: Number.isInteger(status.refresh_seconds) ? Math.min(86400, Math.max(5, status.refresh_seconds)) : 30 } : undefined,
    distribution: obj(manifest.distribution).tier ? { tier: manifest.distribution.tier, license: manifest.distribution.license } : undefined,
    workspace,
  }
}
