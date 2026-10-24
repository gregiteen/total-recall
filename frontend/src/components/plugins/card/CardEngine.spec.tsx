import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PluginInfo } from '../../../api/plugins'
import { runPluginCommand } from '../../../api/plugins'
import { apiFetch } from '../../../api/_base'
import { CardEngine } from './CardEngine'
import { normalizeCard } from './contract'
import { buildArgs } from './args'
import { cliLine } from './cli-line'
import { brandStyle, contrast, inkOn } from './theme'

vi.mock('../../../api/plugins', () => ({ runPluginCommand: vi.fn(async () => ({ success: true, output: '{"state":"ok","lines":2}' })) }))
vi.mock('../../../api/_base', () => ({ API_BASE: '', apiFetch: vi.fn(async () => ({ ok: false })) }))
vi.mock('../PluginSettings', () => ({ PluginSettings: () => <div>settings-form</div> }))
vi.mock('../PluginPanel', async (original) => ({ ...await original<typeof import('../PluginPanel')>(), PluginPanel: ({ plugin }: { plugin: PluginInfo }) => <div>{plugin.id} owner interface</div> }))

const plugin = {
  id: 'demo', name: 'Demo', description: 'Demo plugin',
  ui: { elements: [{ id: 'owner', kind: 'card', tag: 'owner-card', module: './ui/card.js' }] },
  cli: { command: 'demo', subcommands: [{ name: 'status' }, { name: 'send', description: 'Send one' }, { name: 'lookup' }] },
  manifest: {
    status: { command: 'status', refresh_seconds: 30 },
    branding: { name: 'Demo Brand', color: '#1D4ED8', accent: '#FACC15', font: 'inter', header: 'band', provider: { name: 'Acme', url: 'https://acme.example' } },
    distribution: { tier: 'official', license: 'open' },
    ui: { elements: [{ id: 'owner', kind: 'card', tag: 'owner-card', module: './ui/card.js', description: 'Demo face' }] },
    cli: { subcommands: [
      { name: 'status', effect: 'read' },
      { name: 'send', effect: 'send', args: [{ name: 'to', positional: true, label: 'To', type: 'string', required: true }, { name: 'token', positional: true, label: 'Token', type: 'string', secret: true }] },
      { name: 'lookup', effect: 'read', args: [{ name: 'q', flag: '--query', label: 'Query', type: 'string', required: true }] }] },
  },
} as unknown as PluginInfo
beforeEach(() => vi.clearAllMocks())
afterEach(cleanup)

describe('card contract', () => {
  it('takes the face from the plugin manifest and never derives a layout', () => {
    const card = normalizeCard(plugin)
    expect(card.face).toEqual({ id: 'owner', tag: 'owner-card', module: './ui/card.js', description: 'Demo face' })
    expect('template' in card).toBe(false)
    expect('regions' in card).toBe(false)
    expect(card.commands.get('send')!.effect).toBe('send')
    expect(card.status).toEqual({ command: 'status', refreshSeconds: 30 })
  })
  it('resolves the face to kind card even when panels are declared first', () => {
    // A plugin has one face and as many `kind: panel` screens as it needs. A
    // panel declared before the card is a secondary screen, never the face —
    // matching on `card || panel` would mount the wrong module.
    const withPanels = {
      ...plugin,
      manifest: {
        ...plugin.manifest,
        ui: {
          elements: [
            { id: 'stashes', kind: 'panel', tag: 'tr-stashes', module: './ui/stashes.js' },
            { id: 'owner', kind: 'card', tag: 'owner-card', module: './ui/card.js', description: 'Demo face' },
            { id: 'branches', kind: 'panel', tag: 'tr-branches', module: './ui/branches.js' },
          ],
        },
      },
    } as unknown as PluginInfo
    expect(normalizeCard(withPanels).face).toEqual({ id: 'owner', tag: 'owner-card', module: './ui/card.js', description: 'Demo face' })

    // Panels alone never produce a face.
    const panelsOnly = {
      ...plugin,
      manifest: { ...plugin.manifest, ui: { elements: [{ id: 'p', kind: 'panel', tag: 'tr-p', module: './ui/p.js' }] } },
    } as unknown as PluginInfo
    expect(normalizeCard(panelsOnly).face).toBeUndefined()
  })
  it('leaves the face undefined when the plugin declares none', () => {
    const bare = normalizeCard({ id: 'x', name: 'X', description: '', cli: { command: 'x', subcommands: [{ name: 'list' }] }, manifest: { branding: { color: 'red', font: "'Syne', sans-serif" } } } as unknown as PluginInfo)
    expect(bare.face).toBeUndefined()
    expect(bare.commands.get('list')!.effect).toBe('write')
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
  it('mounts the owner face and never substitutes a host arrangement', async () => {
    render(<CardEngine plugin={plugin} />)
    await waitFor(() => expect(screen.getByText('demo owner interface')).toBeTruthy())
    expect(document.querySelector('.card-regions')).toBeNull()
    expect(document.querySelector('.card-bespoke')).toBeTruthy()
  })
  it('says so plainly when a plugin has not supplied a face', async () => {
    const faceless = { ...plugin, ui: { elements: [] }, manifest: { ...plugin.manifest, ui: { elements: [] } } } as unknown as PluginInfo
    render(<CardEngine plugin={faceless} />)
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/has not supplied its card face/))
  })
  it('renders the owner face and credits the provider without polling on its behalf', async () => {
    render(<CardEngine plugin={plugin} />)
    await waitFor(() => expect(screen.getByText('demo owner interface')).toBeTruthy())
    // Reading real state belongs to the plugin's own face, not to the host engine.
    expect(runPluginCommand).not.toHaveBeenCalled()
    expect(screen.getByRole('link', { name: 'Acme' })).toBeTruthy()
  })
  it('toggles actual host activation and never derives screens from the command list', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, activation: { enabled: false, state: 'inactive' } }) } as Response)
    render(<CardEngine plugin={plugin} />)
    await waitFor(() => expect(screen.getByText('Active')).toBeTruthy())
    fireEvent.click(screen.getByRole('switch'))
    await waitFor(() => expect(screen.getByText('Inactive')).toBeTruthy())
    expect(apiFetch).toHaveBeenCalledWith('/api/plugins/demo/activation', expect.objectContaining({ method: 'PUT', body: '{"enabled":false}' }))
    // The host hosts one mount point; it does not turn subcommands into screens.
    expect(screen.queryByLabelText(/command scene/)).toBeNull()
    expect(document.querySelectorAll('.card-scene')).toHaveLength(1)
  })
  it('shows owner command activity without recording arguments or credentials', async () => {
    render(<CardEngine plugin={plugin} />)
    await waitFor(() => expect(screen.getByText('Active')).toBeTruthy())
    act(() => { window.dispatchEvent(new CustomEvent('plugin-command-activity', { detail: { pluginId: 'demo', requestId: '1', command: 'lookup', running: true } })) })
    await waitFor(() => expect(screen.getByText('Running lookup')).toBeTruthy())
    act(() => { window.dispatchEvent(new CustomEvent('plugin-command-activity', { detail: { pluginId: 'demo', requestId: '1', command: 'lookup', running: false } })) })
    await waitFor(() => expect(screen.getByText('Active')).toBeTruthy())
  })
  it('opens the settings drawer and closes it with Escape', async () => {
    render(<CardEngine plugin={plugin} />)
    fireEvent.click(screen.getByText('Settings & usage'))
    expect(screen.getByRole('dialog')).toBeTruthy(); expect(screen.getByText('settings-form')).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
  it('contains keyboard focus in the drawer and restores the opener', async () => {
    render(<CardEngine plugin={plugin} />)
    const opener = screen.getByText('Settings & usage')
    opener.focus()
    fireEvent.click(opener)
    const close = screen.getByRole('button', { name: 'Close' })
    expect(document.activeElement).toBe(close)
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Session activity' }))
    fireEvent.keyDown(document.activeElement!, { key: 'Tab' })
    expect(document.activeElement).toBe(close)
    fireEvent.keyDown(close, { key: 'Escape' })
    await waitFor(() => expect(document.activeElement).toBe(opener))
  })
  it('shows Open workspace and mounts workspace tab for plugins with workspace', async () => {
    const phonePlugin = {
      ...plugin,
      id: 'phone',
      manifest: { ...plugin.manifest, workspace: { component: 'PhoneDialer', tabs: ['dialer', 'calls'], permissions: ['microphone'] } },
    } as unknown as PluginInfo
    render(<CardEngine plugin={phonePlugin} />)
    await waitFor(() => expect(screen.getByText('Open workspace')).toBeTruthy())
    fireEvent.click(screen.getByText('Open workspace'))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy())
    expect(screen.getByRole('tab', { name: 'Workspace' })).toBeTruthy()
  })
})
