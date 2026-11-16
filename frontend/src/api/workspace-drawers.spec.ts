import { beforeEach, expect, it, vi } from 'vitest'

const apiFetch = vi.fn()
vi.mock('./_base', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args), getApiBase: () => '' }))
import { readDrawer, readDrawerHistory, restoreDrawer, saveDrawer } from './workspace-drawers'

const config = { html: '', chunks: [], panels: [], shortcuts: [] }
beforeEach(() => {
  apiFetch.mockReset()
  apiFetch.mockImplementation(async () => new Response(JSON.stringify({ config, version: null, history: [] }), { headers: { 'content-type': 'application/json' } }))
})

it('sends the named brain on every drawer read and write, never an implicit global one', async () => {
  await readDrawer('bottom', undefined, 'project:selected')
  await readDrawerHistory('bottom', undefined, 'project:selected')
  await saveDrawer('bottom', { config, version: null }, 'project:selected')
  await restoreDrawer('bottom', 'a'.repeat(64), null, 'project:selected')
  const [read, history, save, restore] = apiFetch.mock.calls
  expect(read[0]).toBe('/api/dashboard/drawers/bottom?brain=project%3Aselected')
  expect(history[0]).toBe('/api/dashboard/drawers/bottom/history?brain=project%3Aselected')
  expect(JSON.parse(save[1].body)).toMatchObject({ brainId: 'project:selected' })
  expect(JSON.parse(restore[1].body)).toMatchObject({ brainId: 'project:selected' })
  expect(apiFetch.mock.calls.flat().join(' ')).not.toContain('brain=global')
})
