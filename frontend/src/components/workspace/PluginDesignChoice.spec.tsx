import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { PluginDesignChoice } from './PluginDesignChoice'
import { usePluginDesign, refreshPluginDesign } from './usePluginDesign'
import { readPluginDesign, readPluginDesignChoice, savePluginDesignChoice } from '../../api/workspace-drawers'

vi.mock('../../api/workspace-drawers', () => ({
  readPluginDesignChoice: vi.fn(), savePluginDesignChoice: vi.fn(), readPluginDesign: vi.fn(),
}))
const markdown = '---\ncolors:\n  primary: "#abcdef"\n---\n'
const version = 'a'.repeat(64)
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(readPluginDesignChoice).mockResolvedValue({ markdown: null, version: null })
  vi.mocked(savePluginDesignChoice).mockImplementation(async (_plugin, _brain, choice) => ({ ...choice, version }))
  vi.mocked(readPluginDesign).mockResolvedValue({ revision: 'b'.repeat(64), css: ':root{--color-primary:#123456;}', components: [] })
})

function LiveDesign({ brainId = 'project:first' }: { brainId?: string }) {
  const current = usePluginDesign('design-test', brainId)
  return <output aria-label="Live design">{current?.design?.css ?? ''}{current?.issue}</output>
}

it('keeps draft edits and Cancel write-free, then saves and removes with scoped exact versions', async () => {
  render(<><PluginDesignChoice pluginId="design-test" brainId="project:first" /><LiveDesign /></>)
  await screen.findByText(':root{--color-primary:#123456;}')
  fireEvent.click(screen.getByRole('button', { name: 'Choose design' }))
  await waitFor(() => expect(screen.getByLabelText('DESIGN.md content')).toBeEnabled())
  fireEvent.change(screen.getByLabelText('DESIGN.md content'), { target: { value: markdown } })
  expect(savePluginDesignChoice).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(savePluginDesignChoice).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Choose design' }))
  await waitFor(() => expect(screen.getByLabelText('DESIGN.md content')).toBeEnabled())
  expect(screen.getByLabelText('DESIGN.md content')).toHaveValue('')
  fireEvent.change(screen.getByLabelText('DESIGN.md content'), { target: { value: markdown } })
  vi.mocked(readPluginDesign).mockResolvedValueOnce({ revision: version, css: ':root{--color-primary:#abcdef;}', components: [] })
  fireEvent.click(screen.getByRole('button', { name: 'Save design' }))
  await waitFor(() => expect(savePluginDesignChoice).toHaveBeenCalledWith('design-test', 'project:first', { markdown, version: null }))
  await waitFor(() => expect(screen.getByLabelText('Live design')).toHaveTextContent('#abcdef'))
  fireEvent.click(screen.getByRole('button', { name: 'Use owner design' }))
  await waitFor(() => expect(savePluginDesignChoice).toHaveBeenLastCalledWith('design-test', 'project:first', { markdown: null, version }))
  await waitFor(() => expect(screen.getByLabelText('Live design')).toHaveTextContent('#123456'))
})

it('preserves a rejected draft and reloads the latest version before another save', async () => {
  vi.mocked(savePluginDesignChoice).mockRejectedValueOnce(new Error('The design choice changed. Reload before saving.'))
  render(<PluginDesignChoice pluginId="design-test" brainId="project:first" />)
  fireEvent.click(screen.getByRole('button', { name: 'Choose design' }))
  await waitFor(() => expect(screen.getByLabelText('DESIGN.md content')).toBeEnabled())
  fireEvent.change(screen.getByLabelText('DESIGN.md content'), { target: { value: markdown } })
  fireEvent.click(screen.getByRole('button', { name: 'Save design' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('changed')
  expect(screen.getByLabelText('DESIGN.md content')).toHaveValue(markdown)
  vi.mocked(readPluginDesignChoice).mockResolvedValueOnce({ markdown, version })
  fireEvent.click(screen.getByRole('button', { name: 'Reload design' }))
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  fireEvent.click(screen.getByRole('button', { name: 'Save design' }))
  await waitFor(() => expect(savePluginDesignChoice).toHaveBeenLastCalledWith('design-test', 'project:first', { markdown, version }))
})

it('isolates the editor and live refresh from other brains and ignores late reads from the old scope', async () => {
  const view = render(<><PluginDesignChoice pluginId="design-test" brainId="project:first" /><LiveDesign /></>)
  fireEvent.click(screen.getByRole('button', { name: 'Choose design' }))
  await waitFor(() => expect(screen.getByLabelText('DESIGN.md content')).toBeEnabled())
  fireEvent.change(screen.getByLabelText('DESIGN.md content'), { target: { value: markdown } })
  const calls = vi.mocked(readPluginDesign).mock.calls.length
  act(() => refreshPluginDesign('design-test', 'project:other'))
  expect(readPluginDesign).toHaveBeenCalledTimes(calls)
  view.rerender(<><PluginDesignChoice pluginId="design-test" brainId="project:second" /><LiveDesign brainId="project:second" /></>)
  await waitFor(() => expect(readPluginDesignChoice).toHaveBeenLastCalledWith('design-test', 'project:second', expect.any(AbortSignal)))
  await waitFor(() => expect(screen.getByLabelText('DESIGN.md content')).toHaveValue(''))
  expect(savePluginDesignChoice).not.toHaveBeenCalled()
})

it('keeps the last valid CSS on refresh errors and clears it on a brain change', async () => {
  const view = render(<LiveDesign />)
  await waitFor(() => expect(screen.getByLabelText('Live design')).toHaveTextContent('#123456'))
  vi.mocked(readPluginDesign).mockRejectedValueOnce(new Error('Invalid design tokens'))
  act(() => refreshPluginDesign('design-test', 'project:first'))
  await waitFor(() => expect(screen.getByLabelText('Live design')).toHaveTextContent('Invalid design tokens'))
  expect(screen.getByLabelText('Live design')).toHaveTextContent('#123456')
  vi.mocked(readPluginDesign).mockImplementationOnce(() => new Promise(() => {}))
  view.rerender(<LiveDesign brainId="project:second" />)
  expect(screen.getByLabelText('Live design')).toHaveTextContent('')
  expect(screen.getByLabelText('Live design')).not.toHaveTextContent('#123456')
})
