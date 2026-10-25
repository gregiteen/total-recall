import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CardScenes } from './CardScenes'
import type { PluginInfo } from '../../../api/plugins'

vi.mock('./runner-context', () => ({ useRunner: () => ({ card: { title: 'Owner', commands: new Map([['status', {}], ['delete', {}]]) }, busy: new Set() }) }))
vi.mock('./ExecutionPicker', () => ({ ExecutionPicker: () => <div>Execution choices</div> }))
vi.mock('../../../api/_base', () => ({ API_BASE: '', apiFetch: vi.fn() }))
const plugin = { id: 'owner', name: 'Owner', activation: { enabled: true }, card_face: { quick_actions: [{ subcommand: 'status', label: 'Command-derived screen' }] } } as unknown as PluginInfo
const owned = [{ id: 'machines', label: 'Machines' }, { id: 'flows', label: 'Flows' }, { id: 'placement', label: 'Placement' }]
const announce = (screens: unknown, pluginId = plugin.id) => act(() => { window.dispatchEvent(new CustomEvent('plugin-screens', { detail: { pluginId, screens } })) })
const changed = (value: string, pluginId = plugin.id) => act(() => { window.dispatchEvent(new CustomEvent('plugin-screen-changed', { detail: { pluginId, screen: value } })) })
afterEach(cleanup)

describe('owner-declared card screen navigation', () => {
  it('never derives screens from commands or quick actions and disables empty/single screen arrows', () => {
    render(<CardScenes plugin={plugin}><div>Owner interface</div></CardScenes>)
    expect(screen.queryByRole('button', { name: 'Screens' })).toBeNull()
    expect((screen.getByRole('button', { name: 'Next screen' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Previous screen' }) as HTMLButtonElement).disabled).toBe(true)
    announce(owned, 'another-owner')
    expect(screen.queryByRole('button', { name: 'Screens' })).toBeNull()
    announce([owned[0]])
    expect((screen.getByRole('button', { name: 'Next screen' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.queryByText('Command-derived screen')).toBeNull()
  })
  it('context menus use only the exact owner screens and request a declared selection', () => {
    render(<CardScenes plugin={plugin}><div>Owner interface</div></CardScenes>)
    announce([...owned, owned[0], { id: '<bad>', label: 'Invalid' }])
    act(() => { window.dispatchEvent(new CustomEvent('plugin-context-menu', { detail: { pluginId: plugin.id } })) })
    expect(screen.getAllByRole('menuitem').map(item => item.textContent)).toEqual(['Machines', 'Flows', 'Placement'])
    const request = vi.fn()
    window.addEventListener('plugin-show-screen', request)
    try {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Placement' }))
      expect((request.mock.calls[0][0] as CustomEvent).detail).toEqual({ pluginId: plugin.id, screen: 'placement' })
      expect(screen.queryByRole('menu')).toBeNull()
      // The owner, not a speculative navigation click, confirms its active screen.
      expect(screen.getByLabelText('Current screen').textContent).toBe('Machines')
      changed('placement')
      expect(screen.getByLabelText('Current screen').textContent).toBe('Placement')
    } finally { window.removeEventListener('plugin-show-screen', request) }
  })
  it('next and previous wrap owner order and follow valid internal screen changes', () => {
    render(<CardScenes plugin={plugin}><div>Owner interface</div></CardScenes>)
    announce(owned)
    const request = vi.fn()
    window.addEventListener('plugin-show-screen', request)
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Next screen' }))
      expect((request.mock.calls.at(-1)![0] as CustomEvent).detail.screen).toBe('flows')
      changed('flows')
      fireEvent.click(screen.getByRole('button', { name: 'Next screen' }))
      expect((request.mock.calls.at(-1)![0] as CustomEvent).detail.screen).toBe('placement')
      changed('placement')
      fireEvent.click(screen.getByRole('button', { name: 'Next screen' }))
      expect((request.mock.calls.at(-1)![0] as CustomEvent).detail.screen).toBe('machines')
      changed('machines')
      changed('delete'); changed('flows', 'another-owner')
      fireEvent.click(screen.getByRole('button', { name: 'Previous screen' }))
      expect((request.mock.calls.at(-1)![0] as CustomEvent).detail.screen).toBe('placement')
      announce([])
      expect(screen.queryByLabelText('Current screen')).toBeNull()
      expect((screen.getByRole('button', { name: 'Previous screen' }) as HTMLButtonElement).disabled).toBe(true)
    } finally { window.removeEventListener('plugin-show-screen', request) }
  })
})
