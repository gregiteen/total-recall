import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CardEngine } from './CardEngine'
import { apiFetch } from '../../../api/_base'
import { runPluginCommand } from '../../../api/plugins'
import type { PluginInfo } from '../../../api/plugins'

vi.mock('../../../api/_base', () => ({ API_BASE: '', apiFetch: vi.fn(async (url: string) => ({ ok: true, json: async () => url.includes('?node=') ? { success: true, agents: [{ id: 'codex', name: 'Codex', installed: true, versionVerified: true, authenticated: true }, { id: 'hermes', name: 'Hermes', installed: false }] } : { success: true, nodes: [{ id: 'build-box', name: 'Build box', online: true, accessConfigured: true }, { id: 'offline', name: 'Offline box', online: false }] } })) }))
vi.mock('../../../api/plugins', () => ({ runPluginCommand: vi.fn(async () => ({ success: true, output: '{}' })) }))
vi.mock('../PluginSettings', () => ({ PluginSettings: () => null }))
const plugin = { id: 'example', name: 'Example', description: 'Inspect example', cli: { command: 'example', subcommands: [{ name: 'inspect' }] }, manifest: { cli: { subcommands: [{ name: 'inspect', effect: 'read', args: [] }] } } } as unknown as PluginInfo
afterEach(() => { cleanup(); vi.clearAllMocks() })
describe('selected node, agent and command permissions', () => {
  it('uses installed readiness, requires explicit remote workspace and passes booleans with the command', async () => {
    render(<CardEngine plugin={plugin} />)
    fireEvent.click(screen.getByText('Agent, node & permissions'))
    await waitFor(() => expect(screen.getByRole('option', { name: 'Codex' })).toBeTruthy())
    expect((screen.getByRole('option', { name: /Hermes/ }) as HTMLOptionElement).disabled).toBe(true)
    expect((screen.getByRole('option', { name: /Offline box/ }) as HTMLOptionElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Mesh node'), { target: { value: 'build-box' } })
    await waitFor(() => expect(screen.getByLabelText('CLI agent').closest('fieldset')?.disabled).toBe(false))
    fireEvent.change(screen.getByLabelText('CLI agent'), { target: { value: 'codex' } })
    fireEvent.change(screen.getByLabelText('Workspace on selected node'), { target: { value: '/workspace/example' } })
    fireEvent.click(screen.getByLabelText('Write commands'))
    fireEvent.click(screen.getByText('Try'))
    fireEvent.click(screen.getByText('Look up'))
    await waitFor(() => expect(runPluginCommand).toHaveBeenCalledWith('example', 'inspect', ['--json'], { execution: { agent: 'codex', node: 'build-box', cwd: '/workspace/example', allowUnknownAuth: true, permissions: { read: true, write: true, send: false, destructive: false } } }))
    expect(apiFetch).toHaveBeenCalledWith('/api/plugins/execution-targets?node=build-box')
  })
});
