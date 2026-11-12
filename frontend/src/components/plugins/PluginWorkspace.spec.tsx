import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
  ui: { home: ownerPanel.id, elements: [ownerPanel] },
}

let installed: PluginInfo[]
let activationFailure: boolean
let cleanupFailure: boolean
let listFailure: boolean
let delayedInventory: Map<string, Promise<Response>>
let design: { revision: string; css: string; components: string[] } | undefined
let designInvalid: boolean
let composition: { chunks: { key: string; plugin: string; title: string; surfaces: string[]; sha256: string }[]; version: string | null }
const requests: Array<{ path: string; init?: RequestInit }> = []

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))
}

beforeEach(() => {
  installed = [plugin]
  activationFailure = false
  cleanupFailure = false
  listFailure = false
  delayedInventory = new Map()
  design = undefined
  designInvalid = false
  composition = { chunks: [], version: null }
  requests.length = 0
  globalThis.fetch = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
    const path = String(url)
    const parsed = new URL(path, 'http://localhost')
    requests.push({ path, init })
    if (parsed.pathname === '/api/plugins') return delayedInventory.get(parsed.searchParams.get('brain') || '') ??
      json({ plugins: installed }, listFailure ? 500 : 200)
    if (path.endsWith('/activation')) {
      if (activationFailure) return json({ error: 'Activation rejected' }, 400)
      const { enabled: manual, mode, brainIds } = JSON.parse(String(init?.body))
      const enabled = mode === 'use' || manual === true
      const activation = { enabled, state: enabled ? 'active' as const : 'inactive' as const,
        ...(mode === 'on-use' ? { mode: 'on-use' as const } : {}) }
      installed = [{ ...plugin, activation, activationByBrain: [
        { brainId: brainIds[0], name: brainIds[0] === 'global' ? 'Global Brain' : 'Music', ...activation },
      ] }]
      if (cleanupFailure && manual === false) return json({ success: false, results: [{
        brainId: brainIds[0], name: 'Music', success: false,
        cleanup: { ok: false, state: 'pending' }, error: 'The plugin is off, but cleanup did not finish. Retry cleanup.',
      }] })
      return json({ success: true })
    }
    if (parsed.pathname.endsWith('/ui/inventory')) return Promise.resolve(new Response('customElements.define("demo-inventory", class extends HTMLElement {})'))
    if (parsed.pathname.endsWith('/composition/current')) return json(composition)
    if (path.startsWith('/api/ui-chunks/linked-owner/summary?')) return json({
      chunk: { ...composition.chunks[0], html: '<section><h2>Linked owner evidence</h2></section>' },
    })
    if (path.includes('/demo/design/revision')) {
      if (designInvalid) return json({ error: 'Invalid design revision' }, 400)
      if (design && parsed.searchParams.get('revision') === design.revision) return json({ unchanged: true })
      return json(design || { revision: null, css: '', components: [] })
    }
    const chunk = { key: 'demo:design', plugin: 'demo', title: 'Owner patterns', surfaces: ['page'],
      html: '<template data-design-components><div><span data-design-label></span><script>window.alert(1)</script></div></template>' }
    if (path.startsWith('/api/ui-chunks?')) return json({ chunks: design ? [chunk] : [] })
    if (path.startsWith('/api/ui-chunks/demo/design?')) return json({ chunk })
    if (path.endsWith('/configuration')) return json({ fields: [], values: {} })
    if (path.includes('/auth/secrets')) return json({ keys: [] })
    if (path.endsWith('/available')) return json({ plugins: [] })
    if (path.endsWith('/install')) return json({ success: true })
    if (path.endsWith('/peers')) return json({
      mesh: { available: true, configured: true },
      peers: [{ hostname: 'dev-node', status: 'ok', plugins: [{ id: 'reading-list', name: 'Reading List' }] }],
    })
    return json({}, 404)
  })
})

function workspace(path: string, activeBrainId: string) {
  return <MemoryRouter initialEntries={[path]}>
    <PluginWorkspace activeBrainId={activeBrainId} onOpenPlugin={() => {}} renderShell={(folder, page) => <><nav>{folder}</nav>{page}</>} />
  </MemoryRouter>
}

function renderWorkspace(path = '/memory', activeBrainId = 'global') {
  return render(workspace(path, activeBrainId))
}

async function choosePlugin() {
  fireEvent.click(screen.getByRole('button', { name: 'Plugins' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Demo plugin' }))
  return screen.findByRole('region', { name: 'Demo plugin' })
}

describe('PluginWorkspace', () => {
  it('opens the native Home from the sidebar without executing commands', async () => {
    renderWorkspace()
    expect(screen.getByRole('button', { name: 'Plugins' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('button', { name: 'Demo plugin' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Demo plugin' })).not.toBeInTheDocument()
    const drawer = await choosePlugin()
    const view = within(drawer)
    expect(view.getByText('Active')).toBeInTheDocument()
    expect(await view.findByText('Credential required')).toBeInTheDocument()
    expect(view.getByText(/1.0.0 · Core · global/)).toBeInTheDocument()
    expect(view.getByText('Unreported')).toBeInTheDocument()
    expect(await view.findByTitle('Demo plugin interface')).toHaveAttribute('sandbox', 'allow-scripts')
    expect(requests.some(request => request.path.endsWith('/run'))).toBe(false)
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

  it('omits private output operations from Home and the generic command picker', async () => {
    installed = [{ ...plugin, cli: { command: 'demo', subcommands: [
      { name: 'inventory' }, { name: 'private-token', sensitive_output: true },
    ] } }]
    renderWorkspace()
    const view = within(await choosePlugin())
    expect(view.queryByRole('button', { name: 'private-token' })).not.toBeInTheDocument()
    fireEvent.click(view.getByRole('button', { name: 'inventory' }))
    expect(view.getByRole('option', { name: 'inventory' })).toBeInTheDocument()
    expect(view.queryByRole('option', { name: 'private-token' })).not.toBeInTheDocument()
  })

  it('generates new design elements in the open Home when DESIGN.md changes', async () => {
    design = { revision: '1'.repeat(64), css: ':root{--color-accent:#123456}', components: ['badge'] }
    renderWorkspace('/memory?plugin=demo')
    const block = await screen.findByTitle('Owner patterns')
    await waitFor(() => expect(block.getAttribute('srcdoc')).toContain('data-design-component="badge"'))
    expect(block.getAttribute('srcdoc')).not.toContain('<script>')
    design = { revision: '2'.repeat(64), css: ':root{--color-accent:#abcdef}', components: ['badge', 'callout'] }
    await waitFor(() => {
      expect(block.getAttribute('srcdoc')).toContain('data-design-component="callout"')
      expect(block.getAttribute('srcdoc')).toContain('--color-accent:#abcdef')
    }, { timeout: 3500 })
    designInvalid = true
    expect(await screen.findByText('Invalid design revision', {}, { timeout: 3500 })).toBeInTheDocument()
    expect(block.getAttribute('srcdoc')).toContain('data-design-component="callout"')
    expect(requests.filter(request => request.path.startsWith('/api/ui-chunks?'))).toHaveLength(1)
    expect(requests.some(request => request.path.endsWith('/suggest') || request.path.endsWith('/run'))).toBe(false)
  })

  it('shows a publication from another installed owner without a view prompt', async () => {
    installed = [plugin, { ...plugin, id: 'linked-owner', name: 'Linked owner' }]
    renderWorkspace('/memory?plugin=demo')
    const view = within(await screen.findByRole('region', { name: 'Demo plugin' }))
    expect(await view.findByTitle('Demo plugin interface')).toBeInTheDocument()
    expect(view.queryByRole('button', { name: /build view|choose with decision/i })).toBeNull()
    composition = {
      version: '1'.repeat(64),
      chunks: [{ key: 'linked-owner:summary', plugin: 'linked-owner', title: 'Linked owner evidence', surfaces: ['page'], sha256: 'evidence' }],
    }
    const frame = await view.findByTitle('Linked owner evidence', {}, { timeout: 3500 })
    expect(frame.getAttribute('srcdoc')).toContain('Linked owner evidence')
  })

  it('reads the saved activation after switching off', async () => {
    renderWorkspace('/memory?plugin=demo')
    const toggle = await screen.findByRole('switch', { name: 'Demo plugin activation' })
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(toggle)
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'false'))
    expect(requests.filter(request => request.path.endsWith('/api/plugins?brain=global')).length).toBeGreaterThan(1)
    const mutation = requests.find(request => request.path.endsWith('/activation'))
    expect(JSON.parse(String(mutation?.init?.body))).toEqual({ enabled: false, brainIds: ['global'] })
  })

  it('shows each selected brain when activation is mixed', async () => {
    installed = [{ ...plugin, activation: { enabled: false, state: 'mixed' }, activationByBrain: [
      { brainId: 'global', name: 'Global Brain', enabled: true, state: 'active' },
      { brainId: 'project:music', name: 'Music', enabled: false, state: 'inactive' },
    ] }]
    renderWorkspace('/memory?plugin=demo', 'global,project:music')
    const view = within(await screen.findByRole('region', { name: 'Demo plugin' }))
    expect(view.getByText('Mixed')).toBeInTheDocument()
    expect(view.getByText(/Shared default/)).toBeInTheDocument()
    expect(view.getByRole('switch', { name: 'Demo plugin activation for Global Brain' })).toHaveAttribute('aria-checked', 'true')
    expect(view.getByRole('combobox', { name: 'Demo plugin activation for Music' })).toHaveValue('off')
    expect(view.getByText(/select one brain/i)).toBeInTheDocument()
    expect(requests[0].path).toContain('brain=global%2Cproject%3Amusic')
    expect(requests.some(request => request.path.includes('/ui/inventory'))).toBe(false)
  })

  it('keeps On use dormant until an explicit open in the selected project', async () => {
    installed = [{ ...plugin, activation: { enabled: false, state: 'inactive' }, activationByBrain: [
      { brainId: 'project:music', name: 'Music', enabled: false, state: 'inactive' },
    ] }]
    renderWorkspace('/memory?plugin=demo', 'project:music')
    const view = within(await screen.findByRole('region', { name: 'Demo plugin' }))
    const policy = view.getByRole('combobox', { name: 'Demo plugin activation for Music' })
    fireEvent.change(policy, { target: { value: 'on-use' } })
    const open = await view.findByRole('button', { name: 'Open plugin' })
    expect(policy).toHaveValue('on-use')
    expect(requests.some(request => request.path.includes('/ui/inventory') || request.path.endsWith('/run'))).toBe(false)
    fireEvent.click(open)
    expect(await view.findByTitle('Demo plugin interface')).toBeInTheDocument()
    expect(policy).toHaveValue('on')
    expect(requests.filter(request => request.path.endsWith('/activation')).map(request => JSON.parse(String(request.init?.body)))).toEqual([
      { mode: 'on-use', brainIds: ['project:music'] }, { mode: 'use', brainIds: ['project:music'] },
    ])
    expect(requests.some(request => request.path.endsWith('/ui/inventory?brain=project%3Amusic'))).toBe(true)
  })

  it('activates an armed plugin from a deliberate folder click', async () => {
    installed = [{ ...plugin, activation: { enabled: false, state: 'inactive', mode: 'on-use' }, activationByBrain: [
      { brainId: 'project:music', name: 'Music', enabled: false, state: 'inactive', mode: 'on-use' },
    ] }]
    renderWorkspace('/memory', 'project:music')
    const view = within(await choosePlugin())
    expect(await view.findByTitle('Demo plugin interface')).toBeInTheDocument()
    const activations = requests.filter(request => request.path.endsWith('/activation'))
    expect(activations.map(request => JSON.parse(String(request.init?.body)))).toEqual([{ mode: 'use', brainIds: ['project:music'] }])
  })

  it('shows Off after a cleanup failure and retries for that project only', async () => {
    cleanupFailure = true
    renderWorkspace('/memory?plugin=demo', 'project:music')
    const view = within(await screen.findByRole('region', { name: 'Demo plugin' }))
    const policy = view.getByRole('combobox', { name: 'Demo plugin activation for music' })
    fireEvent.change(policy, { target: { value: 'off' } })
    const retry = await view.findByRole('button', { name: 'Retry cleanup for Music' })
    expect(view.getByRole('combobox', { name: 'Demo plugin activation for Music' })).toHaveValue('off')
    expect(view.getByRole('alert')).toHaveTextContent('cleanup did not finish')
    cleanupFailure = false
    fireEvent.click(retry)
    await waitFor(() => expect(view.queryByRole('button', { name: 'Retry cleanup for Music' })).toBeNull())
    expect(view.getByRole('combobox', { name: 'Demo plugin activation for Music' })).toHaveValue('off')
    expect(requests.filter(request => request.path.endsWith('/activation')).map(request => JSON.parse(String(request.init?.body)))).toEqual([
      { enabled: false, brainIds: ['project:music'] }, { enabled: false, brainIds: ['project:music'] },
    ])
  })

  it('ignores inventory that returns after the selected brain changes', async () => {
    let finish!: (response: Response) => void
    delayedInventory.set('global', new Promise(resolve => { finish = resolve }))
    const view = renderWorkspace('/memory?plugin=demo')
    await waitFor(() => expect(requests.some(request => request.path.endsWith('/api/plugins?brain=global'))).toBe(true))
    installed = [{ ...plugin, name: 'Project plugin' }]
    view.rerender(workspace('/memory?plugin=demo', 'project:music'))
    expect(await screen.findByRole('region', { name: 'Project plugin' })).toBeInTheDocument()
    await act(async () => finish(await json({ plugins: [plugin] })))
    expect(screen.getByRole('region', { name: 'Project plugin' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Demo plugin' })).toBeNull()
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
    expect(requests.find(request => request.path.endsWith('/install'))?.init?.body).toBe(JSON.stringify({ source: 'peer:dev-node/reading-list', global: true }))
  })
})
