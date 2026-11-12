import { beforeEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { runPluginCommand, type PluginInfo } from '../../api/plugins'
import { readWorkspaceChunk } from '../../api/workspace-drawers'
import { PublishedChunk } from '../workspace/DrawerLayout'
import { ScopedPluginCommands } from './ScopedPluginCommands'

vi.mock('../../api/plugins', async importOriginal => ({
  ...await importOriginal<typeof import('../../api/plugins')>(),
  runPluginCommand: vi.fn(),
}))
vi.mock('../../api/workspace-drawers', async importOriginal => ({
  ...await importOriginal<typeof import('../../api/workspace-drawers')>(),
  readWorkspaceChunk: vi.fn(),
}))

const owner = {
  id: 'evidence-owner', name: 'Evidence owner', valid: true, sha256: 'fixture',
  activation: { enabled: true, state: 'active' },
  cli: { subcommands: [
    { name: 'inspect', effect: 'read', args: [
      { name: 'path', label: 'Document path', flag: '--file', required: true, type: 'string' },
    ] },
    { name: 'edit', effect: 'write', args: [
      { name: 'label', label: 'Label', positional: true, type: 'string', required: true },
    ] },
    { name: 'secret', args: [{ name: 'value', label: 'Value', type: 'string', secret: true }] },
    { name: 'private', sensitive_output: true },
    { name: 'terminal', terminal_only: true },
    { name: 'unrelated' },
  ] },
} as unknown as PluginInfo

const metadata = {
  key: 'evidence-owner:document', id: 'document', title: 'Document evidence',
  plugin: 'evidence-owner', description: '', intents: [], sha256: 'chunk',
  surfaces: ['page', 'right'] as Array<'page' | 'right'>,
  operations: ['inspect', 'edit', 'secret', 'private', 'terminal', 'unknown'],
  html: '<section>Current evidence</section>',
}

beforeEach(() => {
  vi.mocked(runPluginCommand).mockReset()
  vi.mocked(runPluginCommand).mockResolvedValue({ success: true, output: 'Owner result' })
  vi.mocked(readWorkspaceChunk).mockReset()
  vi.mocked(readWorkspaceChunk).mockResolvedValue(metadata)
})

it('uses the block owner and selected brain with literal typed arguments and confirmation for edits', async () => {
  const parent = { ...owner, id: 'another-owner', name: 'Another owner' }
  render(<PublishedChunk name={metadata.key} side="page" plugins={[parent, owner]} brainId="project:Music" />)
  const form = within(await screen.findByRole('form', { name: 'Document evidence operations' }))
  expect(form.getAllByRole('option').map(option => option.textContent)).toEqual(['inspect', 'edit'])
  expect(runPluginCommand).not.toHaveBeenCalled()
  fireEvent.change(form.getByLabelText('Document path'), { target: { value: 'Notes/My document.md' } })
  fireEvent.click(form.getByRole('button', { name: 'Run command' }))
  expect(await form.findByText('Owner result')).toBeInTheDocument()
  expect(runPluginCommand).toHaveBeenNthCalledWith(1, 'evidence-owner', 'inspect', ['--file', 'Notes/My document.md'], { brainId: 'project:Music' })

  fireEvent.change(form.getByLabelText('Command'), { target: { value: 'edit' } })
  fireEvent.change(form.getByLabelText('Label'), { target: { value: 'first value' } })
  fireEvent.click(form.getByRole('button', { name: 'Run command' }))
  expect(form.getByRole('group', { name: 'Confirm command' })).toBeInTheDocument()
  expect(runPluginCommand).toHaveBeenCalledTimes(1)
  fireEvent.change(form.getByLabelText('Label'), { target: { value: 'changed; literal' } })
  expect(form.queryByRole('group', { name: 'Confirm command' })).not.toBeInTheDocument()
  fireEvent.click(form.getByRole('button', { name: 'Run command' }))
  expect(runPluginCommand).toHaveBeenCalledTimes(1)
  fireEvent.click(form.getByRole('button', { name: 'Confirm and run' }))
  expect(await form.findByText('Owner result')).toBeInTheDocument()
  expect(runPluginCommand).toHaveBeenNthCalledWith(2, 'evidence-owner', 'edit', ['changed; literal'], { brainId: 'project:Music' })
})

it('drops an open drawer command when the selected brain changes and the owner is off', async () => {
  const { rerender } = render(<PublishedChunk name={metadata.key} side="right" plugins={[owner]} brainId="global" />)
  expect(await screen.findByRole('form', { name: 'Document evidence operations' })).toBeInTheDocument()
  vi.mocked(readWorkspaceChunk).mockImplementationOnce(() => new Promise(() => {}))
  rerender(<PublishedChunk name={metadata.key} side="right" plugins={[
    { ...owner, activation: { enabled: false, state: 'inactive' } },
  ]} brainId="project:Music" />)
  expect(screen.queryByRole('form', { name: 'Document evidence operations' })).not.toBeInTheDocument()
  expect(runPluginCommand).not.toHaveBeenCalled()
})

it('requires literal argument arrays for older commands and blocks terminal-only flags', async () => {
  const operation = { name: 'inspect', effect: 'read', terminal_only_args: ['--unsafe'] }
  const legacy: PluginInfo = { ...owner, cli: { command: 'evidence-owner', subcommands: [operation] } }
  render(<ScopedPluginCommands plugin={legacy} brainId="global" />)
  const args = screen.getByLabelText('Arguments (JSON array)')
  const submit = screen.getByRole('button', { name: 'Run command' })
  fireEvent.change(args, { target: { value: '--flag two words' } })
  fireEvent.click(submit)
  expect(screen.getByRole('alert')).toHaveTextContent('JSON array of strings')
  fireEvent.change(args, { target: { value: '["--unsafe=yes"]' } })
  fireEvent.click(submit)
  expect(screen.getByRole('alert')).toHaveTextContent('terminal-only')
  expect(runPluginCommand).not.toHaveBeenCalled()
  fireEvent.change(args, { target: { value: '["--flag", "two words"]' } })
  fireEvent.click(submit)
  expect(await screen.findByText('Owner result')).toBeInTheDocument()
  expect(runPluginCommand).toHaveBeenCalledWith('evidence-owner', 'inspect', ['--flag', 'two words'], { brainId: 'global' })
})
