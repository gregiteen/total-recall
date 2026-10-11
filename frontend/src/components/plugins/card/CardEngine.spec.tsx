import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PluginInfo } from '../../../api/plugins'
import { runPluginCommand } from '../../../api/plugins'
import { CardEngine } from './CardEngine'
import { normalizeCard } from './contract'
import { buildArgs } from './args'
import { cliLine } from './cli-line'
import { brandStyle, contrast, inkOn } from './theme'

vi.mock('../../../api/plugins', () => ({ runPluginCommand: vi.fn(async () => ({ success: true, output: '{"state":"ok","lines":2}' })) }))
vi.mock('../../../api/_base', () => ({ API_BASE: '', apiFetch: vi.fn(async () => ({ ok: false })) }))
vi.mock('../PluginSettings', () => ({ PluginSettings: () => <div>settings-form</div> }))

const plugin = {
  id: 'demo', name: 'Demo', description: 'Demo plugin', cli: { command: 'demo', subcommands: [{ name: 'status' }, { name: 'send', description: 'Send one' }, { name: 'lookup' }] },
  manifest: {
    status: { command: 'status', refresh_seconds: 30 },
    branding: { name: 'Demo Brand', color: '#1D4ED8', accent: '#FACC15', font: 'inter', header: 'band', provider: { name: 'Acme', url: 'https://acme.example' } },
    distribution: { tier: 'official', license: 'open' },
    cli: { subcommands: [
      { name: 'status', effect: 'read' },
      { name: 'send', effect: 'send', args: [{ name: 'to', positional: true, label: 'To', type: 'string', required: true }, { name: 'token', positional: true, label: 'Token', type: 'string', secret: true }] },
      { name: 'lookup', effect: 'read', args: [{ name: 'q', flag: '--query', label: 'Query', type: 'string', required: true }] }] },
  },
} as unknown as PluginInfo
beforeEach(() => vi.clearAllMocks())
afterEach(cleanup)

describe('card contract', () => {
  it('derives a layout, effects and a status poll from the manifest', () => {
    const card = normalizeCard(plugin)
    expect(card.regions.map(r => r.widget)).toEqual(['status', 'actions', 'activity'])
    expect(card.commands.get('send')!.effect).toBe('send')
    expect(card.status).toEqual({ command: 'status', refreshSeconds: 30 })
  })
  it('infers read for lookups and falls back from unknown branding', () => {
    const bare = normalizeCard({ id: 'x', name: 'X', description: '', cli: { command: 'x', subcommands: [{ name: 'list' }, { name: 'purge' }] }, manifest: { branding: { color: 'red', font: "'Syne', sans-serif" } } } as unknown as PluginInfo)
    expect(bare.commands.get('list')!.effect).toBe('read')
    expect(bare.commands.get('purge')!.effect).toBe('write')
    expect(bare.branding.color).toBe('#475569'); expect(bare.branding.font).toBe('system')
  })
  it('never puts secret arguments on the command line and builds the agent CLI line', () => {
    const card = normalizeCard(plugin); const send = card.commands.get('send')!
    expect(buildArgs(send, { to: 'a@b.c', token: 'SECRET' })).toEqual(['a@b.c', '--json'])
    expect(cliLine(card, send, 'demo')).toBe('total-recall demo send <to> --json')
  })
})

describe('theme', () => {
  it('chooses readable ink on brand fills', () => {
    expect(inkOn('#FACC15')).toBe('#111111'); expect(inkOn('#0A2A66')).toBe('#ffffff')
    expect(contrast('#FACC15', '#111111')).toBeGreaterThan(4.5)
    expect(brandStyle(normalizeCard(plugin).branding)).toMatchObject({ '--card-color': '#1D4ED8', '--card-on-accent': '#111111' })
  })
})

describe('card engine', () => {
  it('shows real status, the CLI line for every command, and credits the provider', async () => {
    render(<CardEngine plugin={plugin} />)
    await waitFor(() => expect(screen.getAllByText('ok').length).toBeGreaterThan(0))
    expect(runPluginCommand).toHaveBeenCalledWith('demo', 'status', ['--json'])
    expect(screen.getByText('total-recall demo send <to> --json')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Acme' })).toBeTruthy()
  })
  it('only runs read commands; send is reference-only', async () => {
    render(<CardEngine plugin={plugin} />)
    await waitFor(() => expect(runPluginCommand).toHaveBeenCalled())
    expect(screen.getAllByText('Try')).toHaveLength(2)
    fireEvent.click(screen.getAllByText('Try')[1])
    fireEvent.change(screen.getByLabelText(/Query/), { target: { value: 'hello' } })
    fireEvent.click(screen.getByText('Look up'))
    await waitFor(() => expect(runPluginCommand).toHaveBeenCalledWith('demo', 'lookup', ['--query', 'hello', '--json']))
    expect(runPluginCommand).not.toHaveBeenCalledWith('demo', 'send', expect.anything())
  })
  it('opens the settings drawer and closes it with Escape', async () => {
    render(<CardEngine plugin={plugin} />)
    fireEvent.click(screen.getByText('Settings & usage'))
    expect(screen.getByRole('dialog')).toBeTruthy(); expect(screen.getByText('settings-form')).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})
