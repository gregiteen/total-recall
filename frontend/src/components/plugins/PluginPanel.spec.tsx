import { render, screen, waitFor, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PluginPanel } from './PluginPanel'
import type { PluginInfo } from '../../api/plugins'
import { runPluginCommand } from '../../api/plugins'
import { allowedFrameCommand, pluginCommandTimeouts, pluginFrameDocument, sanitizePluginScreens } from './plugin-frame'

vi.mock('../../api/plugins', () => ({ runPluginCommand: vi.fn(async () => ({ success: true, output: '{"ok":true}' })) }))
vi.mock('../../api/_base', () => ({ API_BASE: '', apiFetch: vi.fn(async () => ({ ok: true, text: async () => 'throw new Error("owner code must never execute in dashboard")' })) }))
const plugin = { id: 'audit-fixture', name: 'Audit fixture', sha256: 'abc', cli: { subcommands: [{ name: 'status' }] },
  ui: { elements: [{ id: 'panel', kind: 'panel', tag: 'audit-panel', module: './ui.js' }] } } as unknown as PluginInfo
beforeEach(() => vi.clearAllMocks())
afterEach(cleanup)

function frameHost(source: string): { operations: readonly string[] } {
  const script = /<script nonce="[^"]+" type="module">([\s\S]*?)<\/script>/.exec(source)![1]
  // Exercise the generated bridge without importing the owner's component.
  const bootstrap = script.slice(0, script.indexOf('try{\n const url='))
  return new Function('window', 'document', 'parent', bootstrap + '\nreturn host;')(
    { addEventListener: vi.fn() }, { documentElement: { style: { setProperty: vi.fn() } } }, { postMessage: vi.fn() },
  )
}

function frameScreenBridge(source: string) {
  const script = /<script nonce="[^"]+" type="module">([\s\S]*?)<\/script>/.exec(source)![1]
  const bootstrap = script.slice(0, script.indexOf('try{\n const url='))
  const parent = { postMessage: vi.fn() }
  let receive: (event: unknown) => void = () => {}
  const window = { addEventListener: (type: string, listener: typeof receive) => { if (type === 'message') receive = listener }, dispatchEvent: vi.fn() }
  const bridge = new Function('window', 'document', 'parent', bootstrap + '\nreturn {host,publishScreens};')(
    window, { documentElement: { style: { setProperty: vi.fn() } } }, parent,
  )
  return { ...bridge, parent, window, receive }
}

describe('plugin UI boundary', () => {
  it('sanitizes owner screens and validates both directions of the frame screen bridge', () => {
    const declared = [{ id: 'machines', label: 'Machines' }, { id: 'flows', label: 'Flows' }, { id: 'machines', label: 'Duplicate' }, { id: '<script>', label: 'Invalid' }, { id: 'bad-label', label: '\n' }]
    expect(sanitizePluginScreens(declared)).toEqual(declared.slice(0, 2))
    const bridge = frameScreenBridge(pluginFrameDocument('', 'audit-card', 'screens-test', {}, 'audit-fixture'))
    bridge.publishScreens({ screens: declared, screen: 'flows' })
    expect(bridge.parent.postMessage.mock.calls.map(([message]: [{ type: string }]) => message.type)).toEqual(['screens', 'screen-changed'])
    expect(bridge.parent.postMessage.mock.calls[0][0].screens).toEqual(declared.slice(0, 2))
    bridge.parent.postMessage.mockClear()
    bridge.host.screenChanged('undeclared')
    expect(bridge.parent.postMessage).not.toHaveBeenCalled()
    bridge.host.screenChanged('machines')
    expect(bridge.parent.postMessage.mock.calls[0][0]).toEqual({ channel: 'screens-test', type: 'screen-changed', screen: 'machines' })
    const data = { channel: 'screens-test', type: 'show-screen', screen: 'flows' }
    bridge.receive({ source: {}, data })
    bridge.receive({ source: bridge.parent, data: { ...data, channel: 'forged' } })
    bridge.receive({ source: bridge.parent, data: { ...data, screen: 'undeclared' } })
    expect(bridge.window.dispatchEvent).not.toHaveBeenCalled()
    bridge.receive({ source: bridge.parent, data })
    expect(bridge.window.dispatchEvent).toHaveBeenCalledOnce()
    expect(bridge.window.dispatchEvent.mock.calls[0][0].detail).toEqual({ pluginId: 'audit-fixture', screen: 'flows' })
  })
  it('relays only source-bound card screen declarations and declared screen selections', async () => {
    const face = { ...plugin, ui: { elements: [{ id: 'face', kind: 'card', tag: 'audit-card', module: './ui.js' }] } } as unknown as PluginInfo
    const declared = vi.fn(); const changed = vi.fn()
    window.addEventListener('plugin-screens', declared); window.addEventListener('plugin-screen-changed', changed)
    try {
      render(<PluginPanel plugin={face} />)
      const frame = await screen.findByTitle('Audit fixture interface') as HTMLIFrameElement
      const channel = JSON.parse(/const channel=("[^"]+")/.exec(frame.srcdoc)![1])
      const announce = { channel, type: 'screens', screens: [{ id: 'inspect', label: 'Inspect' }, { id: 'history', label: 'History' }] }
      window.dispatchEvent(new MessageEvent('message', { source: window, origin: 'null', data: announce }))
      window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, origin: 'https://forged.invalid', data: announce }))
      window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, origin: 'null', data: { ...announce, channel: 'forged' } }))
      expect(declared).not.toHaveBeenCalled()
      window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, origin: 'null', data: announce }))
      expect(declared).toHaveBeenCalledOnce()
      expect((declared.mock.calls[0][0] as CustomEvent).detail).toEqual({ pluginId: plugin.id, screens: announce.screens })
      const post = vi.spyOn(frame.contentWindow!, 'postMessage')
      window.dispatchEvent(new CustomEvent('plugin-show-screen', { detail: { pluginId: 'other', screen: 'inspect' } }))
      window.dispatchEvent(new CustomEvent('plugin-show-screen', { detail: { pluginId: plugin.id, screen: 'status' } }))
      expect(post).not.toHaveBeenCalled()
      window.dispatchEvent(new CustomEvent('plugin-show-screen', { detail: { pluginId: plugin.id, screen: 'history' } }))
      expect(post).toHaveBeenCalledWith({ channel, type: 'show-screen', screen: 'history' }, '*')
      window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, origin: 'null', data: { channel, type: 'screen-changed', screen: 'status' } }))
      expect(changed).not.toHaveBeenCalled()
      window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, origin: 'null', data: { channel, type: 'screen-changed', screen: 'history' } }))
      expect((changed.mock.calls[0][0] as CustomEvent).detail).toEqual({ pluginId: plugin.id, screen: 'history' })
      expect(runPluginCommand).not.toHaveBeenCalled()
    } finally { window.removeEventListener('plugin-screens', declared); window.removeEventListener('plugin-screen-changed', changed) }
  })
  it('does not accept screen declarations from settings or secondary panels', async () => {
    const declared = vi.fn()
    window.addEventListener('plugin-screens', declared)
    try {
      render(<PluginPanel plugin={plugin} />)
      const frame = await screen.findByTitle('Audit fixture interface') as HTMLIFrameElement
      const channel = JSON.parse(/const channel=("[^"]+")/.exec(frame.srcdoc)![1])
      window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, origin: 'null', data: { channel, type: 'screens', screens: [{ id: 'fake', label: 'Fake' }] } }))
      expect(declared).not.toHaveBeenCalled()
    } finally { window.removeEventListener('plugin-screens', declared) }
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
  it('opens owner context menus only from the source-bound opaque frame', async () => {
    const opened = vi.fn();
    window.addEventListener('plugin-context-menu', opened);
    try {
      render(<PluginPanel plugin={plugin} />);
      const frame = await screen.findByTitle('Audit fixture interface') as HTMLIFrameElement;
      const channel = JSON.parse(/const channel=("[^"]+")/.exec(frame.srcdoc)![1]);
      const data = { channel, type: 'contextmenu' };
      window.dispatchEvent(new MessageEvent('message', { source: window, origin: 'null', data }));
      window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, origin: 'https://untrusted.invalid', data }));
      expect(opened).not.toHaveBeenCalled();
      window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, origin: 'null', data }));
      expect(opened).toHaveBeenCalledOnce();
      expect((opened.mock.calls[0][0] as CustomEvent).detail).toEqual({ pluginId: plugin.id });
    } finally { window.removeEventListener('plugin-context-menu', opened); }
  });
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
  it('blocks writes from a card live panel even if the owner requests a declared command', async () => {
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
