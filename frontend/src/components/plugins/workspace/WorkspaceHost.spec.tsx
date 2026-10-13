import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PluginInfo } from '../../../api/plugins'
import { normalizeCard } from '../card/contract'
import { WorkspaceHost } from './WorkspaceHost'

vi.mock('../PluginPanel', () => ({
  pluginElements: (plugin: PluginInfo) => plugin.ui?.elements || [],
  PluginPanel: ({ elementId }: { elementId: string }) => <div>Owner surface: {elementId}</div>,
}))
afterEach(cleanup)

const make = (permissions: string[] = []) => ({
  id: 'workspace-fixture', name: 'Workspace fixture', description: 'Owner interface',
  manifest: { workspace: { component: 'console', permissions } },
  ui: { elements: [{ id: 'console', tag: 'owner-console', kind: 'panel', module: 'ui/console.js' }] },
} as unknown as PluginInfo)

describe('generic workspace host', () => {
  it('mounts only the declared owner surface', () => {
    const plugin = make()
    render(<WorkspaceHost plugin={plugin} card={normalizeCard(plugin)} />)
    expect(screen.getByText('Owner surface: console')).toBeTruthy()
  })
  it('reports a missing interface rather than claiming it is active', () => {
    const plugin = { ...make(), ui: undefined }
    render(<WorkspaceHost plugin={plugin} card={normalizeCard(plugin)} />)
    expect(screen.getByRole('status').textContent).toMatch(/has not supplied/)
    expect(screen.queryByText('Owner surface: console')).toBeNull()
  })
  it('does not weaken isolation for unsupported device access', () => {
    const plugin = make(['microphone'])
    render(<WorkspaceHost plugin={plugin} card={normalizeCard(plugin)} />)
    expect(screen.getByRole('status').textContent).toMatch(/does not support/)
    expect(screen.queryByText('Owner surface: console')).toBeNull()
  })
})
