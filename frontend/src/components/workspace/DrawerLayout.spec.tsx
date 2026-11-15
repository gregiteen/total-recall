import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import { DrawerLayout, DrawerPanel } from './DrawerLayout'
import { readDrawer, readDrawerHistory, readPluginDesign, restoreDrawer, saveDrawer, type DrawerConfig } from '../../api/workspace-drawers'
import { refreshPluginDesign } from './usePluginDesign'
import type { PluginInfo } from '../../api/plugins'

vi.mock('../../api/workspace-drawers', () => ({
  readDrawer: vi.fn(), readDrawerHistory: vi.fn(), restoreDrawer: vi.fn(), saveDrawer: vi.fn(),
  findWorkspaceChunks: vi.fn().mockResolvedValue({ chunks: [] }), readPluginDesign: vi.fn().mockResolvedValue({ revision: null, css: '', components: [] }),
}))
vi.mock('../plugins/PluginPanel', () => ({
  pluginElements: (plugin: PluginInfo) => plugin.ui?.elements ?? [],
  PluginPanel: ({ designCss }: { designCss?: string }) => <output aria-label="Panel design">{designCss}</output>,
}))

const config: DrawerConfig = { html: '<p>Saved</p>', chunks: [], panels: [], shortcuts: [] }
const current = { config, version: 'b'.repeat(64) }
const saved = { config: { ...config, html: '<p>Prior</p>' }, version: 'a'.repeat(64), savedAt: '2026-11-15T12:00:00.000Z' }
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(readDrawer).mockResolvedValue(current)
  vi.mocked(readDrawerHistory).mockResolvedValue({ version: current.version, history: [saved] })
  vi.mocked(restoreDrawer).mockResolvedValue({ config: saved.config, version: 'c'.repeat(64) })
  vi.mocked(saveDrawer).mockResolvedValue({ config: { ...config, html: '<p>New</p>' }, version: 'd'.repeat(64) })
})
const layout = (brainId = 'project:first', side: 'right' | 'bottom' = 'right') => <MemoryRouter>
  <DrawerLayout side={side} view="custom" plugins={[]} brainId={brainId} />
</MemoryRouter>

it('previews sanitized draft HTML and cancels without saving or restoring', async () => {
  render(layout())
  fireEvent.click(await screen.findByRole('button', { name: 'Edit drawer' }))
  fireEvent.change(screen.getByLabelText('Drawer HTML'), { target: { value: '<p>Draft</p><script>alert(1)</script>' } })
  fireEvent.click(screen.getByRole('button', { name: 'Preview HTML' }))
  const preview = screen.getByTitle('Draft HTML preview')
  expect(preview).toHaveAttribute('sandbox', '')
  expect(preview.getAttribute('srcdoc')).toContain('<p>Draft</p>')
  expect(preview.getAttribute('srcdoc')).not.toContain('<script>')
  expect(saveDrawer).not.toHaveBeenCalled()
  expect(restoreDrawer).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.queryByTitle('Draft HTML preview')).toBeNull()
  expect(screen.getByTitle('right drawer custom HTML').getAttribute('srcdoc')).toContain('<p>Saved</p>')
  expect(saveDrawer).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Edit drawer' }))
  expect(screen.getByLabelText('Drawer HTML')).toHaveValue(config.html)
  fireEvent.change(screen.getByLabelText('Drawer HTML'), { target: { value: '<p>New</p>' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save drawer' }))
  await waitFor(() => expect(saveDrawer).toHaveBeenCalledWith('right', { config: { ...config, html: '<p>New</p>' }, version: current.version }, 'project:first'))
})

it('reads history without writes, sends its exact version on restore, and preserves conflicts for review', async () => {
  vi.mocked(restoreDrawer).mockRejectedValueOnce(new Error('The drawer changed elsewhere. Reload it.'))
  render(layout())
  fireEvent.click(await screen.findByRole('button', { name: 'Saved revisions' }))
  const select = await screen.findByLabelText('Saved revision')
  expect(readDrawerHistory).toHaveBeenCalledWith('right', undefined, 'project:first')
  expect(restoreDrawer).not.toHaveBeenCalled()
  fireEvent.change(select, { target: { value: saved.version } })
  fireEvent.click(screen.getByRole('button', { name: 'Restore saved revision' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('changed elsewhere')
  expect(restoreDrawer).toHaveBeenCalledWith('right', saved.version, current.version, 'project:first')
  expect(screen.getByTitle('right drawer custom HTML').getAttribute('srcdoc')).toContain('<p>Saved</p>')
  expect(saveDrawer).not.toHaveBeenCalled()
})

it('discards drafts and saved revision state on brain or edge changes and ignores old pending reads', async () => {
  let finish!: (value: typeof current) => void
  vi.mocked(readDrawer).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const view = render(layout())
  view.rerender(layout('project:second'))
  fireEvent.click(await screen.findByRole('button', { name: 'Edit drawer' }))
  fireEvent.change(screen.getByLabelText('Drawer HTML'), { target: { value: 'Unwritten second brain draft' } })
  await act(async () => finish({ config: { ...config, html: 'Old first brain content' }, version: 'f'.repeat(64) }))
  expect(screen.getByLabelText('Drawer HTML')).toHaveValue('Unwritten second brain draft')
  view.rerender(layout('project:second', 'bottom'))
  await screen.findByRole('button', { name: 'Edit drawer' })
  expect(screen.queryByLabelText('Drawer HTML')).toBeNull()
  expect(readDrawer).toHaveBeenLastCalledWith('bottom', expect.any(AbortSignal), 'project:second')
  expect(saveDrawer).not.toHaveBeenCalled()
  expect(restoreDrawer).not.toHaveBeenCalled()
})

it('refreshes a standalone drawer panel with the selected brain design', async () => {
  const plugin = { id: 'design-test', name: 'Design test', valid: true, activation: { enabled: true, state: 'active' },
    ui: { elements: [{ id: 'home', kind: 'panel', tag: 'design-test-home', module: 'home.js' }] } } as PluginInfo
  vi.mocked(readPluginDesign).mockResolvedValueOnce({ revision: 'a'.repeat(64), css: ':root{--color-primary:#123456;}', components: [] })
  render(<MemoryRouter><DrawerPanel plugins={[plugin]} reference={{ plugin: plugin.id, element: 'home' }} brainId="project:first" /></MemoryRouter>)
  await waitFor(() => expect(screen.getByLabelText('Panel design')).toHaveTextContent('#123456'))
  vi.mocked(readPluginDesign).mockResolvedValueOnce({ revision: 'b'.repeat(64), css: ':root{--color-primary:#abcdef;}', components: [] })
  act(() => refreshPluginDesign('design-test', 'project:first'))
  await waitFor(() => expect(screen.getByLabelText('Panel design')).toHaveTextContent('#abcdef'))
  expect(readPluginDesign).toHaveBeenLastCalledWith('design-test', null, expect.any(AbortSignal), 'project:first')
})
