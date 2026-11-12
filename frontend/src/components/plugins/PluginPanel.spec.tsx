import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PluginPanel } from './PluginPanel'
import type { PluginInfo } from '../../api/plugins'
import { runPluginCommand } from '../../api/plugins'
import { readPluginDesign } from '../../api/workspace-drawers'
import { allowedFrameCommand, pluginCommandTimeouts, pluginFrameDocument } from './plugin-frame'

vi.mock('../../api/plugins', () => ({ runPluginCommand: vi.fn(async () => ({ success: true, output: '{"ok":true}' })) }))
vi.mock('../../api/_base', () => ({ API_BASE: '', apiFetch: vi.fn(async () => ({ ok: true, text: async () => 'throw new Error("owner code must never execute in dashboard")' })) }))
vi.mock('../../api/workspace-drawers', () => ({ readPluginDesign: vi.fn(async () => ({ unchanged: true })) }))
const plugin = { id: 'audit-fixture', name: 'Audit fixture', sha256: 'abc', cli: { subcommands: [{ name: 'status' }] },
  ui: { elements: [{ id: 'panel', kind: 'panel', tag: 'audit-panel', module: './ui.js' }] } } as unknown as PluginInfo
beforeEach(() => vi.clearAllMocks())
afterEach(cleanup)

function frameDocumentFixture() {
  const styles: Array<{ textContent: string }> = []
  return {
    styles,
    createElement: () => ({ textContent: '', sheet: { cssRules: [{ style: { setProperty: vi.fn() } }] } }),
    head: { append: (...elements: typeof styles) => styles.push(...elements) },
  }
}

function frameHost(source: string): { operations: readonly string[] } {
  const script = /<script nonce="[^"]+" type="module">([\s\S]*?)<\/script>/.exec(source)![1]
  // Exercise the generated bridge without importing the owner's component.
  const bootstrap = script.slice(0, script.indexOf('try{\n const url='))
  return new Function('window', 'document', 'parent', bootstrap + '\nreturn host;')(
    { addEventListener: vi.fn() }, frameDocumentFixture(), { postMessage: vi.fn() },
  )
}

function frameBridge(source: string) {
  const script = /<script nonce="[^"]+" type="module">([\s\S]*?)<\/script>/.exec(source)![1]
  const bootstrap = script.slice(0, script.indexOf('try{\n const url='))
  const parent = { postMessage: vi.fn() }
  const document = frameDocumentFixture()
  let receive: (event: unknown) => void = () => {}
  const window = { addEventListener: (type: string, listener: typeof receive) => { if (type === 'message') receive = listener } }
  new Function('window', 'document', 'parent', bootstrap)(window, document, parent)
  return { parent, receive, styles: document.styles }
}

describe('plugin UI boundary', () => {
  it('applies the selected brain owner design to a directly mounted panel', async () => {
    const css = ':root{--color-ink:#231709}'
    vi.mocked(readPluginDesign).mockResolvedValueOnce({ revision: 'fixture', css, components: [] })
    render(<PluginPanel plugin={plugin} elementId="panel" brainId="project-brain" />)
    const frame = await screen.findByTitle('Audit fixture interface') as HTMLIFrameElement
    const post = vi.spyOn(frame.contentWindow!, 'postMessage')
    fireEvent.load(frame)
    expect(readPluginDesign).toHaveBeenCalledWith(plugin.id, null, expect.any(AbortSignal), 'project-brain')
    expect(post).toHaveBeenCalledWith(expect.objectContaining({ type: 'design', css }), '*')
  })

  it('updates the native frame stylesheet only for its authenticated parent channel', () => {
    const bridge = frameBridge(pluginFrameDocument('', 'audit-panel', 'design-channel'))
    const data = { channel: 'design-channel', type: 'design', css: ':root{--color-ink:#231709}' }
    bridge.receive({ source: {}, data })
    bridge.receive({ source: bridge.parent, data: { ...data, channel: 'other' } })
    expect(bridge.styles[1].textContent).toBe('')
    bridge.receive({ source: bridge.parent, data })
    expect(bridge.styles[1].textContent).toBe(data.css)
  })
  it('exposes a frozen snapshot of permitted operations to owner code', () => {
    const permitted = ['inspect', 'configure']
    const source = pluginFrameDocument('', 'audit-panel', 'bridge-test', {}, 'audit-fixture', {}, permitted)
    permitted.push('destroy')
    const host = frameHost(source)
    expect(host.operations).toEqual(['inspect', 'configure'])
    expect(Object.isFrozen(host)).toBe(true)
    expect(Object.isFrozen(host.operations)).toBe(true)
    expect(() => (host.operations as string[]).push('destroy')).toThrow()
    expect(frameHost(pluginFrameDocument('', 'audit-panel', 'bridge-default')).operations).toEqual([])
  })
  it('lists exactly the readonly operations and rejects writes and destructive calls', async () => {
    const effects = { ...plugin, cli: { subcommands: [{ name: 'inspect' }, { name: 'configure' }, { name: 'destroy' }, { name: 'unclassified' }] },
      manifest: { cli: { subcommands: [{ name: 'inspect', effect: 'read' }, { name: 'configure', effect: 'write' }, { name: 'destroy', effect: 'destructive' }, { name: 'unclassified' }, { name: 'not-installed', effect: 'read' }] } } } as unknown as PluginInfo
    render(<PluginPanel plugin={effects} readOnly />)
    const frame = await screen.findByTitle('Audit fixture interface') as HTMLIFrameElement
    expect(frameHost(frame.srcdoc).operations).toEqual(['inspect'])
    const post = vi.spyOn(frame.contentWindow!, 'postMessage')
    const channel = JSON.parse(/const channel=("[^"]+")/.exec(frame.srcdoc)![1])
    for (const subcommand of ['configure', 'destroy', 'unclassified', 'not-installed']) {
      window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, origin: 'null', data: { channel, type: 'run', requestId: subcommand, subcommand, args: [] } }))
    }
    expect(runPluginCommand).not.toHaveBeenCalled()
    expect(post.mock.calls).toHaveLength(4)
    expect(post.mock.calls.every(([reply]) => reply.error === 'Operation is not available')).toBe(true)
    window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, origin: 'null', data: { channel, type: 'run', requestId: 'inspect', subcommand: 'inspect', args: [] } }))
    await waitFor(() => expect(runPluginCommand).toHaveBeenCalledWith('audit-fixture', 'inspect', ['--json']))
  })
  it('loads owner code in a scripts-only opaque frame and rejects forged/undeclared requests', async () => {
    render(<PluginPanel plugin={plugin} />)
    const frame = await screen.findByTitle('Audit fixture interface') as HTMLIFrameElement
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts')
    expect(frame.srcdoc).toContain("connect-src 'none'")
    const channel = /const channel=("[^"]+")/.exec(frame.srcdoc)!
    const data = { channel: JSON.parse(channel[1]), type: 'run', requestId: '1', subcommand: 'status', args: [] }
    window.dispatchEvent(new MessageEvent('message', { source: window, origin: 'null', data }))
    window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, origin: 'https://untrusted.invalid', data }))
    window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, origin: 'null', data: { ...data, subcommand: 'hidden' } }))
    expect(runPluginCommand).not.toHaveBeenCalled()
    window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, origin: 'null', data }))
    await waitFor(() => expect(runPluginCommand).toHaveBeenCalledWith('audit-fixture', 'status', ['--json']))
  })
  it('rejects malformed and oversized bridge arguments', () => {
    const allowed = new Set(['status'])
    for (const args of [null, ['x'.repeat(8193)], [1], Array(65).fill('x')])
      expect(allowedFrameCommand({ requestId: '1', subcommand: 'status', args }, allowed)).toBe(false)
  })

  it('refuses a valid frame request for an operation that returns private output', async () => {
    const withPrivate = { ...plugin, cli: { command: 'audit-fixture', subcommands: [{ name: 'status' }, { name: 'token', sensitive_output: true }] } }
    render(<PluginPanel plugin={withPrivate} />)
    const frame = await screen.findByTitle('Audit fixture interface') as HTMLIFrameElement
    const channel = /const channel=("[^"]+")/.exec(frame.srcdoc)!
    window.dispatchEvent(new MessageEvent('message', {
      source: frame.contentWindow, origin: 'null',
      data: { channel: JSON.parse(channel[1]), type: 'run', requestId: 'private', subcommand: 'token', args: [] },
    }))
    expect(runPluginCommand).not.toHaveBeenCalled()
  })
  it('denies an empty command list and limits stdin to declared secret operations', () => {
    const request = { requestId: '1', subcommand: 'save', args: [] }
    expect(allowedFrameCommand(request, new Set())).toBe(false)
    expect(allowedFrameCommand({ ...request, stdin: 'private' }, new Set(['save']))).toBe(false)
    expect(allowedFrameCommand({ ...request, stdin: 'private' }, new Set(['save']), new Set(['save']))).toBe(true)
    expect(allowedFrameCommand({ ...request, stdin: '😀'.repeat(16385) }, new Set(['save']), new Set(['save']))).toBe(false)
  })
  it('preserves unsuccessful audit output as an error rather than a success', async () => {
    vi.mocked(runPluginCommand).mockResolvedValueOnce({ success: false, exitCode: 1, output: '{"status":"at-risk","checks":[{"id":"firewall","state":"fail"}]}' })
    render(<PluginPanel plugin={plugin} />)
    const frame = await screen.findByTitle('Audit fixture interface') as HTMLIFrameElement
    const post = vi.spyOn(frame.contentWindow!, 'postMessage')
    const channel = JSON.parse(/const channel=("[^"]+")/.exec(frame.srcdoc)![1])
    window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, origin: 'null', data: { channel, type: 'run', requestId: 'risk-report', subcommand: 'status', args: [] } }))
    await waitFor(() => expect(post).toHaveBeenCalled())
    const reply = post.mock.calls[0][0]
    expect(reply.result).toBeUndefined()
    expect(JSON.parse(reply.error).status).toBe('at-risk')
  })
  it('accepts bounded owner timeouts and drops invalid timeout declarations', () => {
    expect(pluginCommandTimeouts({ cli: { subcommands: [{ name: 'fleet', timeout_ms: 600000 }, { name: 'invalid', timeout_ms: Infinity }, { name: 'too-long', timeout_ms: 600001 }, { name: 'negative', timeout_ms: -1 }] } })).toEqual({ fleet: 600000 })
  })
  it('sends declared credentials through stdin and never returns owner output to the frame', async () => {
    const credentialPlugin = { ...plugin, cli: { command: 'audit-fixture', subcommands: [{ name: 'save-key' }] },
      manifest: { cli: { subcommands: [{ name: 'save-key', args: [{ name: 'key', secret: true, type: 'string' }] }] } } } as unknown as PluginInfo
    vi.mocked(runPluginCommand).mockResolvedValueOnce({ success: true, output: 'private-fixture' })
    render(<PluginPanel plugin={credentialPlugin} />)
    const frame = await screen.findByTitle('Audit fixture interface') as HTMLIFrameElement
    const post = vi.spyOn(frame.contentWindow!, 'postMessage')
    const channel = JSON.parse(/const channel=("[^"]+")/.exec(frame.srcdoc)![1])
    window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, origin: 'null', data: { channel, type: 'run', requestId: 'save', subcommand: 'save-key', args: [], stdin: 'private-fixture' } }))
    await waitFor(() => expect(post).toHaveBeenCalled())
    expect(runPluginCommand).toHaveBeenCalledWith('audit-fixture', 'save-key', ['--json'], { stdin: 'private-fixture' })
    expect(post.mock.calls[0][0].result).toEqual({ ok: true })
    expect(JSON.stringify(post.mock.calls[0][0])).not.toContain('private-fixture')
  })
  it('blocks writes from a read-only native panel even if the owner requests a declared command', async () => {
    const writer = { ...plugin, manifest: { cli: { subcommands: [{ name: 'status', effect: 'write' }] } } } as unknown as PluginInfo
    render(<PluginPanel plugin={writer} readOnly />)
    const frame = await screen.findByTitle('Audit fixture interface') as HTMLIFrameElement
    const post = vi.spyOn(frame.contentWindow!, 'postMessage')
    const channel = JSON.parse(/const channel=("[^"]+")/.exec(frame.srcdoc)![1])
    window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, origin: 'null', data: { channel, type: 'run', requestId: 'write', subcommand: 'status', args: [] } }))
    await waitFor(() => expect(post).toHaveBeenCalled())
    expect(runPluginCommand).not.toHaveBeenCalled()
    expect(post.mock.calls[0][0].error).toBe('Operation is not available')
  })
});
