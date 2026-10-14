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
  it('requires explicit read effects even for list/config groups and falls back from unknown branding', () => {
    const bare = normalizeCard({ id: 'x', name: 'X', description: '', cli: { command: 'x', subcommands: [{ name: 'list' }, { name: 'config' }, { name: 'purge' }] }, manifest: { branding: { color: 'red', font: "'Syne', sans-serif" } } } as unknown as PluginInfo)
    expect(bare.commands.get('list')!.effect).toBe('write')
    expect(bare.commands.get('config')!.effect).toBe('write')
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
  it('mounts the owner interface for a live region rather than substituting command forms', () => {
    render(<CardEngine plugin={{ ...plugin, manifest: { ...plugin.manifest, card_layout: { template: 'workbench', regions: [{ widget: 'live' }] } } }} />)
    expect(screen.getByText('demo owner interface')).toBeTruthy()
    expect(screen.getByText('total-recall demo send <to> --json')).toBeTruthy()
  })
  it('uses the owner card as the overview when the owner has not declared a host layout', () => {
    const owned = { ...plugin, ui: { elements: [{ id: 'owner', kind: 'card', tag: 'owner-card', module: './ui/card.js' }] } }
    expect(normalizeCard(owned).regions[0].widget).toBe('live')
    render(<CardEngine plugin={owned} />)
    expect(screen.getByText('demo owner interface')).toBeTruthy()
    expect(screen.getByLabelText('send command scene')).toBeTruthy()
  })
  it('shows real status, the CLI line for every command, and credits the provider', async () => {
    render(<CardEngine plugin={plugin} />)
    await waitFor(() => expect(screen.getAllByText('ok').length).toBeGreaterThan(0))
    expect(runPluginCommand).toHaveBeenCalledWith('demo', 'status', ['--json'])
    expect(screen.getByText('total-recall demo send <to> --json')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Acme' })).toBeTruthy()
  })
  it('offers every command scene and does not send merely by opening its form', async () => {
    render(<CardEngine plugin={plugin} />)
    await waitFor(() => expect(runPluginCommand).toHaveBeenCalled())
    expect(screen.getAllByText('Try')).toHaveLength(3)
    fireEvent.click(screen.getAllByText('Try')[2])
    fireEvent.change(screen.getByLabelText(/Query/), { target: { value: 'hello' } })
    fireEvent.click(screen.getByText('Look up'))
    await waitFor(() => expect(runPluginCommand).toHaveBeenCalledWith('demo', 'lookup', ['--query', 'hello', '--json']))
    expect(runPluginCommand).not.toHaveBeenCalledWith('demo', 'send', expect.anything())
  })
  it('toggles actual host activation and offers common commands in the context menu', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, activation: { enabled: false, state: 'inactive' } }) } as Response)
    render(<CardEngine plugin={plugin} />)
    await waitFor(() => expect(screen.getByText('Active')).toBeTruthy())
    fireEvent.click(screen.getByRole('switch'))
    await waitFor(() => expect(screen.getByText('Inactive')).toBeTruthy())
    expect(apiFetch).toHaveBeenCalledWith('/api/plugins/demo/activation', expect.objectContaining({ method: 'PUT', body: '{"enabled":false}' }))
    fireEvent.contextMenu(screen.getByLabelText('Demo Brand scenes'))
    expect(screen.getByRole('menu', { name: 'Demo Brand common commands' })).toBeTruthy()
    expect(screen.getAllByRole('menuitem').map(item => item.textContent)).toEqual(['status', 'send', 'lookup'])
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
  })
  it('requires confirmation for sends and transports a declared credential only through stdin', async () => {
    render(<CardEngine plugin={plugin} />)
    fireEvent.click(screen.getAllByText('Try')[1])
    fireEvent.change(screen.getByLabelText(/^To\s/), { target: { value: 'recipient@example.test' } })
    fireEvent.change(screen.getByLabelText('Token'), { target: { value: 'private-fixture' } })
    expect(screen.getByText('Run command').closest('button')?.disabled).toBe(true)
    fireEvent.click(screen.getByLabelText('Confirm send'))
    fireEvent.click(screen.getByText('Run command'))
    await waitFor(() => expect(runPluginCommand).toHaveBeenCalledWith('demo', 'send', ['recipient@example.test', '--json'], { stdin: 'private-fixture' }))
    expect((screen.getByLabelText('Token') as HTMLInputElement).value).toBe('')
    expect(screen.queryByText('private-fixture')).toBeNull()
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
  it('does not invent a zero usage meter when the source has no measurements', async () => {
    render(<CardEngine plugin={{ ...plugin, manifest: { ...plugin.manifest, card_layout: { template: 'monitor', regions: [{ widget: 'gauge', source: { command: 'status' } }] } } }} />)
    await waitFor(() => expect(screen.getByText('No valid usage measurement is available.')).toBeTruthy())
    expect(screen.queryByRole('meter')).toBeNull()
  })
  it('shows Open workspace and mounts workspace tab for plugins with workspace', async () => {
    const phonePlugin = {
      ...plugin,
      id: 'phone',
      manifest: {
        ...plugin.manifest,
        workspace: { component: 'PhoneDialer', tabs: ['dialer', 'calls'], permissions: ['microphone'] }
      }
    } as unknown as PluginInfo
    render(<CardEngine plugin={phonePlugin} />)
    await waitFor(() => expect(screen.getByText('Open workspace')).toBeTruthy())
    fireEvent.click(screen.getByText('Open workspace'))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy())
    expect(screen.getByRole('tab', { name: 'Workspace' })).toBeTruthy()
  })
})
