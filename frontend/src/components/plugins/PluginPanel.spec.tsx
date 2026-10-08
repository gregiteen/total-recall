import { render, screen, waitFor, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PluginPanel } from './PluginPanel'
import type { PluginInfo } from '../../api/plugins'
import { runPluginCommand } from '../../api/plugins'
import { allowedFrameCommand } from './plugin-frame'

vi.mock('../../api/plugins', () => ({ runPluginCommand: vi.fn(async () => ({ success: true, output: '{"ok":true}' })) }))
vi.mock('../../api/_base', () => ({ API_BASE: '', apiFetch: vi.fn(async () => ({ ok: true, text: async () => 'throw new Error("owner code must never execute in dashboard")' })) }))
const plugin = { id: 'audit-fixture', name: 'Audit fixture', sha256: 'abc', cli: { subcommands: [{ name: 'status' }] },
  ui: { elements: [{ id: 'panel', kind: 'panel', tag: 'audit-panel', module: './ui.js' }] } } as unknown as PluginInfo
beforeEach(() => vi.clearAllMocks())
afterEach(cleanup)

describe('plugin UI boundary', () => {
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
});
