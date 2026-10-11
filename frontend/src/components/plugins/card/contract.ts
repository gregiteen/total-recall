import type { PluginInfo } from '../../../api/plugins'

export type ArgType = 'string' | 'number' | 'boolean' | 'choice'
export type Effect = 'read' | 'write' | 'destructive' | 'send'
export type Template = 'console' | 'ledger' | 'monitor' | 'inbox' | 'dashboard' | 'workbench' | 'vault'
export type WidgetKind = 'status' | 'actions' | 'table' | 'detail' | 'log' | 'form' | 'keypad' | 'gauge' | 'list' | 'settings' | 'credentials' | 'activity' | 'live'
export type CellFormat = 'text' | 'number' | 'money' | 'date' | 'datetime' | 'bytes' | 'percent' | 'status'

export interface CardArg { name: string; flag?: string; positional?: boolean; label: string; type: ArgType; options?: Array<string | number>; required?: boolean; secret?: boolean }
export interface CardCommand { name: string; description?: string; args: CardArg[]; effect: Effect; output: 'json' | 'text'; timeoutMs?: number }
export interface CardColumn { key: string; label: string; format?: CellFormat }
export interface CardRegion { widget: WidgetKind; title?: string; source?: { command: string; args?: string[] }; columns?: CardColumn[]; command?: string; commands?: string[]; span?: number }
export interface CardBranding {
  name: string; color: string; accent: string; font: string; density: 'compact' | 'comfortable' | 'spacious'
  radius: 'none' | 'sm' | 'md' | 'lg' | 'pill'; header: 'plain' | 'ledger-rule' | 'band' | 'tab-strip' | 'badge-left'
  badge?: string; logo?: string; provider?: { name: string; url?: string }
}
export interface Card {
  id: string; title: string; description: string; template: Template; regions: CardRegion[]
  commands: Map<string, CardCommand>; branding: CardBranding; status?: { command: string; refreshSeconds: number }
  distribution?: { tier: string; license: string }
}

const TEMPLATES: Template[] = ['console', 'ledger', 'monitor', 'inbox', 'dashboard', 'workbench', 'vault']
const FONTS = ['system', 'inter', 'ibm-plex', 'space-grotesk', 'jetbrains-mono', 'dm-sans', 'outfit', 'fraunces', 'newsreader', 'chivo-mono']
const HEX = /^#[0-9a-fA-F]{6}$/
/** Manifest JSON is untyped input; every field is checked before it is used. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Loose = any
const obj = (v: unknown): Record<string, Loose> => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, Loose> : {})

/** Inferred when a plugin declares nothing: a read command is a safe action, a write command is not. */
const inferEffect = (name: string): Effect => /^(status|list|get|show|view|info|check|read|search|history|stats|verify|config)/.test(name) ? 'read' : 'write'

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
      effect: ['read', 'write', 'destructive', 'send'].includes(declared.effect) ? declared.effect : inferEffect(sub.name),
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
  const layout = obj(manifest.card_layout)
  const known = (r: Loose) => r && typeof r === 'object'
  const regions: CardRegion[] = Array.isArray(layout.regions) ? layout.regions.filter(known).slice(0, 12) : []
  const template: Template = TEMPLATES.includes(layout.template) ? layout.template : 'console'
  if (regions.length === 0) {
    // No declared layout: show real state, every command with its arguments, then configuration.
    if (statusCommand) regions.push({ widget: 'status', title: 'Status' })
    regions.push({ widget: 'actions', title: 'Commands' }, { widget: 'activity', title: 'Recent activity' })
  }
  return {
    id: plugin.id, title: branding.name, description: plugin.description, template, regions, commands, branding,
    status: statusCommand ? { command: statusCommand, refreshSeconds: Number.isInteger(status.refresh_seconds) ? Math.min(86400, Math.max(5, status.refresh_seconds)) : 30 } : undefined,
    distribution: obj(manifest.distribution).tier ? { tier: manifest.distribution.tier, license: manifest.distribution.license } : undefined,
  }
}
