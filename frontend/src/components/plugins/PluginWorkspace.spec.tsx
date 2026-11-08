import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import PluginWorkspace from './PluginWorkspace'
import type { PluginInfo } from '../../api/plugins'

const ownerCard = { id: 'card', kind: 'card', tag: 'demo-card', module: 'ui/card.js' }
const ownerPanel = { id: 'inventory', kind: 'panel', tag: 'demo-inventory', module: 'ui/inventory.js' }
const plugin: PluginInfo = {
  id: 'demo', name: 'Demo plugin', version: '1.0.0', description: 'Inventory owner',
  core: true,
  author: null, license: null, homepage: null, use_cases: [],
  valid: true, errors: [], scope: 'global', linked: false, dir: '/plugins/demo',
  shared: false, mesh_shared: false, share_url: null, source: { kind: 'local', ref: '/plugins/demo' },
  installed_at: null, sha256: null, installed_sha256: null, modified_since_install: false,
  file_count: null, size_bytes: null, categories: [], tasks: [], openwiki_hubs: [],
  cli: { command: 'demo', subcommands: [{ name: 'inventory' }] }, has_generator: false,
  activation: { enabled: true, state: 'active' },
  secrets: [{ key: 'DEMO_TOKEN', required: true }],
  ui: { elements: [ownerCard, ownerPanel] },
}

let installed: PluginInfo[]
let activationFailure: boolean
let listFailure: boolean
const requests: Array<{ path: string; init?: RequestInit }> = []

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))
}

beforeEach(() => {
  installed = [plugin]
  activationFailure = false
  listFailure = false
  requests.length = 0
  globalThis.fetch = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
    const path = String(url)
    requests.push({ path, init })
    if (path.endsWith('/api/plugins')) return json({ plugins: installed }, listFailure ? 500 : 200)
    if (path.endsWith('/activation')) {
      if (activationFailure) return json({ error: 'Activation rejected' }, 400)
      const { enabled } = JSON.parse(String(init?.body))
      installed = [{ ...plugin, activation: { enabled, state: enabled ? 'active' : 'inactive' } }]
      return json({ success: true })
    }
    if (path.endsWith('/ui/inventory')) return Promise.resolve(new Response('customElements.define("demo-inventory", class extends HTMLElement {})'))
    if (path.startsWith('/api/ui-chunks?')) return json({ chunks: [] })
    if (path.endsWith('/configuration')) return json({ fields: [], values: {} })
    if (path.endsWith('/auth/secrets')) return json([])
    if (path.endsWith('/available')) return json({ plugins: [] })
    if (path.endsWith('/install')) return json({ success: true })
    if (path.endsWith('/peers')) return json({
      mesh: { available: true, configured: true },
      peers: [{ hostname: 'dev-node', status: 'ok', plugins: [{ id: 'reading-list', name: 'Reading List' }] }],
    })
    return json({}, 404)
  })
})

function renderWorkspace(path = '/memory') {
  return render(<MemoryRouter initialEntries={[path]}>
    <PluginWorkspace activeBrainId="global" onOpenPlugin={() => {}} renderShell={(folder, page) => <><nav>{folder}</nav>{page}</>} />
  </MemoryRouter>)
}

async function choosePlugin() {
  fireEvent.click(screen.getByRole('button', { name: 'Plugins' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Demo plugin' }))
  return screen.findByRole('region', { name: 'Demo plugin' })
}

describe('PluginWorkspace', () => {
  it('opens a plugin from the sidebar without rendering its card or executing commands', async () => {
    renderWorkspace()
    expect(screen.getByRole('button', { name: 'Plugins' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('button', { name: 'Demo plugin' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Demo plugin' })).not.toBeInTheDocument()
    const drawer = await choosePlugin()
    const view = within(drawer)
    expect(view.getByText('Active')).toBeInTheDocument()
    expect(view.getByText('Credential required')).toBeInTheDocument()
    expect(view.getByText(/1.0.0 · Core · global/)).toBeInTheDocument()
    expect(view.getByText('Unreported')).toBeInTheDocument()
    expect(await view.findByTitle('Demo plugin interface')).toHaveAttribute('sandbox', 'allow-scripts')
    expect(requests.some(request => request.path.endsWith('/ui/card') || request.path.endsWith('/run'))).toBe(false)
  })

  it('opens declared operations from Home without executing or loading a legacy card', async () => {
    installed = [{ ...plugin, ui: { elements: [ownerCard] } }]
    renderWorkspace('/memory?plugin=demo')
    const view = within(await screen.findByRole('region', { name: 'Demo plugin' }))
    expect(view.getByRole('button', { name: 'Home' })).toHaveAttribute('aria-pressed', 'true')
    expect(view.queryByRole('button', { name: 'Interface' })).not.toBeInTheDocument()
    fireEvent.click(view.getByRole('button', { name: 'inventory' }))
    expect(view.getByRole('option', { name: 'inventory' })).toBeInTheDocument()
    expect(requests.some(request => request.path.endsWith('/ui/card') || request.path.endsWith('/run'))).toBe(false)
  })

  it('reads the saved activation after switching off', async () => {
    renderWorkspace('/memory?plugin=demo')
    const toggle = await screen.findByRole('switch', { name: 'Demo plugin activation' })
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(toggle)
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'false'))
    expect(requests.filter(request => request.path.endsWith('/api/plugins')).length).toBeGreaterThan(1)
  })

  it('surfaces rejected activation without claiming the switch changed', async () => {
    activationFailure = true
    renderWorkspace('/memory?plugin=demo')
    const toggle = await screen.findByRole('switch', { name: 'Demo plugin activation' })
    fireEvent.click(toggle)
    expect(await screen.findByRole('alert')).toHaveTextContent('Activation rejected')
    expect(toggle).toHaveAttribute('aria-checked', 'true')
  })

  it('shows an inventory error and can retry it', async () => {
    listFailure = true
    renderWorkspace()
    fireEvent.click(screen.getByRole('button', { name: 'Plugins' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load plugins')
    listFailure = false
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('button', { name: 'Demo plugin' })).toBeInTheDocument()
  })

  it('installs a shared plugin from the text browse dialog', async () => {
    renderWorkspace()
    fireEvent.click(screen.getByRole('button', { name: 'Plugins' }))
    fireEvent.click(screen.getByRole('button', { name: 'Browse and install' }))
    const view = within(await screen.findByRole('dialog', { name: 'Browse and install plugins' }))
    fireEvent.click(view.getByText('Mesh peers'))
    fireEvent.click(view.getByRole('button', { name: 'Load shared plugins' }))
    fireEvent.click(await view.findByRole('button', { name: 'Reading List' }))
    fireEvent.click(view.getByRole('button', { name: 'Install' }))
    expect(await view.findByRole('status')).toHaveTextContent('Plugin installed.')
    expect(requests.find(request => request.path.endsWith('/install'))?.init?.body).toBe(JSON.stringify({ source: 'peer:dev-node/reading-list' }))
  })
})
