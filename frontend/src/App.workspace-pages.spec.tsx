import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

vi.mock('./pages/GraphPage', () => ({ default: () => null }))
vi.mock('./pages/MemoryPage', () => ({ default: () => <h1>Vault</h1> }))

const pageId = 'plugin-home-verification'
const savedPage = { id: pageId, title: 'Plugin Home verification', version: 'page-version' }
const recap = { key: 'decision:recap', plugin: 'decision', id: 'recap', title: 'Conversation recap', surfaces: ['page'], sha256: 'recap' }
const handoff = { key: 'meta-harness:chat', plugin: 'meta-harness', id: 'chat', title: 'Chat handoff', surfaces: ['page'], sha256: 'chat', panel: 'home' }
const harness = {
  id: 'meta-harness', name: 'Metaharness', version: '1.0.0', description: 'Default chat handoff',
  source: { kind: 'local' }, scope: 'global', valid: true, activation: { state: 'active', enabled: true },
  ui: { home: 'home', elements: [{ id: 'home', kind: 'panel', tag: 'tr-test-chat', module: 'ui/home.js' }] },
}

const requests: { url: URL; signal?: AbortSignal | null }[] = []
let globalPages: typeof savedPage[]
let pendingPage: Promise<Response> | undefined

function json(value: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } }))
}

beforeEach(() => {
  localStorage.setItem('tr-onboarding-complete', '1')
  window.history.replaceState(null, '', '/memory')
  requests.length = 0
  globalPages = [savedPage]
  pendingPage = undefined
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), window.location.origin)
    const brain = url.searchParams.get('brain')
    requests.push({ url, signal: init?.signal })
    if (url.pathname === '/auth/me' || url.pathname === '/health') return json({})
    if (url.pathname === '/api/brains') return json({ brains: [
      { id: 'global', name: 'Global Brain', layer: 'global', exists: true, node_count: 0 },
      { id: 'project:music', name: 'Music', layer: 'project', exists: true, node_count: 0 },
    ] })
    if (url.pathname === '/api/plugins') return json({ plugins: [harness] })
    if (url.pathname === '/api/workspace/pages') return json({ pages: brain === 'global'
      ? globalPages : [{ ...savedPage, title: 'Music project page' }] })
    if (url.pathname === `/api/workspace/pages/${pageId}`) return pendingPage || json({ ...savedPage, chunks: [recap, handoff] })
    if (url.pathname === '/api/ui-chunks/decision/recap') return json({ chunk: { ...recap, html: '<p>Verified 34 Homes</p>' } })
    if (url.pathname === '/api/ui-chunks/meta-harness/chat') return json({ chunk: { ...handoff, html: '' } })
    if (url.pathname.endsWith('/design/revision')) return json({
      revision: 'design-version', css: ':root{--conversation-accent:#314159}', components: [],
    })
    if (url.pathname === '/api/plugins/meta-harness/ui/home') return Promise.resolve(new Response(
      'customElements.define("tr-test-chat", class extends HTMLElement {})',
    ))
    if (url.pathname === '/api/ui-chunks') return json({ chunks: [] })
    if (url.pathname.endsWith('/composition/current')) return json({ version: null, chunks: [] })
    return json({}, 404)
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('saved workspace pages', () => {
  it('opens a scoped saved page from the drawer and renders the two owners in order', async () => {
    render(<App />)
    const drawer = await screen.findByRole('button', { name: 'Workspace navigation' })
    fireEvent.click(drawer)
    expect(requests.some(({ url }) => url.pathname === '/api/workspace/pages')).toBe(false)
    fireEvent.click(screen.getByText('Saved pages', { selector: 'summary' }))
    const link = await screen.findByRole('link', { name: savedPage.title })
    expect(link).toHaveAttribute('href', `/memory?page=${pageId}&brain=global`)
    fireEvent.click(link)
    expect(drawer).toHaveAttribute('aria-expanded', 'false')
    const page = await screen.findByRole('region', { name: savedPage.title })
    const markup = await screen.findByTitle(recap.title)
    const panel = await screen.findByTitle('Metaharness interface')
    await waitFor(() => expect(markup.getAttribute('srcdoc')).toContain('--conversation-accent:#314159'))
    expect(markup.getAttribute('srcdoc')).toContain('Verified 34 Homes')
    expect(panel.getAttribute('srcdoc')).toContain('tr-test-chat')
    expect([...page.querySelectorAll('section[aria-label]')].map(section => section.getAttribute('aria-label')))
      .toEqual([recap.title, handoff.title])
    expect(requests.filter(({ url }) => url.pathname.startsWith('/api/ui-chunks/') ||
      url.pathname.startsWith('/api/workspace/pages')).every(({ url }) => url.searchParams.get('brain') === 'global')).toBe(true)

    fireEvent.click(drawer)
    fireEvent.click(screen.getByRole('button', { name: 'Plugins' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Metaharness' }))
    expect(await screen.findByRole('region', { name: 'Metaharness' })).toBeInTheDocument()
    expect(new URLSearchParams(window.location.search).has('page')).toBe(false)
  })

  it('refreshes the list when the drawer or the Saved pages section reopens', async () => {
    render(<App />)
    const drawer = await screen.findByRole('button', { name: 'Workspace navigation' })
    fireEvent.click(drawer)
    const summary = screen.getByText('Saved pages', { selector: 'summary' })
    fireEvent.click(summary)
    await screen.findByRole('link', { name: savedPage.title })
    fireEvent.click(drawer)
    globalPages = [{ ...savedPage, title: 'Fresh publication' }]
    fireEvent.click(drawer)
    await screen.findByRole('link', { name: 'Fresh publication' })
    fireEvent.click(summary)
    await waitFor(() => expect(screen.queryByText('Fresh publication')).toBeNull())
    globalPages = [{ ...savedPage, title: 'New title' }]
    fireEvent.click(summary)
    await screen.findByRole('link', { name: 'New title' })
    expect(requests.filter(({ url }) => url.pathname === '/api/workspace/pages')).toHaveLength(3)
  })

  it('honors a linked brain and discards its pending page when another brain is selected', async () => {
    window.history.replaceState(null, '', `/memory?page=${pageId}&brain=global`)
    localStorage.setItem('total-recall-active-brain', 'project:music')
    let resolvePage: (value: Response) => void = () => {}
    pendingPage = new Promise(resolve => { resolvePage = resolve })
    render(<App />)
    await screen.findByText('Loading saved page…')
    const detail = requests.find(({ url }) => url.pathname === `/api/workspace/pages/${pageId}`)
    expect(detail?.url.searchParams.get('brain')).toBe('global')
    fireEvent.click(screen.getByRole('button', { name: 'Workspace navigation' }))
    fireEvent.click(await screen.findByTestId('brain-selector-trigger'))
    fireEvent.click(screen.getByTestId('brain-option-project:music'))
    await screen.findByRole('heading', { name: 'Vault' })
    expect(window.location.search).toBe('')
    expect(detail?.signal?.aborted).toBe(true)
    await act(async () => { resolvePage(await json({ ...savedPage, chunks: [recap] })) })
    expect(screen.queryByRole('region', { name: savedPage.title })).toBeNull()
    expect(requests.filter(({ url }) => url.pathname === `/api/workspace/pages/${pageId}`)).toHaveLength(1)
  })
})
