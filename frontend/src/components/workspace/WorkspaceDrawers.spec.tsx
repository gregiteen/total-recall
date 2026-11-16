import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import { WorkspaceDrawers } from './WorkspaceDrawers'

const layout = vi.fn()
vi.mock('./DrawerLayout', () => ({
  DrawerLayout: (props: { side: string; view: string; brainId: string }) => {
    layout(props)
    return <output aria-label={`${props.side} ${props.view}`}>{props.brainId}</output>
  },
  DrawerPanel: () => null,
}))
vi.mock('./DrawerChat', () => ({ DrawerChat: () => null }))
vi.mock('../../pages/HelpPage', () => ({ default: () => null }))

beforeEach(() => layout.mockClear())
const open = (activeBrainId: string) => render(
  <MemoryRouter><WorkspaceDrawers edge="bottom" onChange={() => {}} plugins={[]} activeBrainId={activeBrainId} /></MemoryRouter>,
)

it.each(['project:a,project:b', 'global,project:a', 'all', '', 'project:'])(
  'does not open or edit any drawer layout for the ambiguous selection %j', selection => {
    open(selection)
    expect(screen.getByText('Select one local brain to open shortcuts.')).toBeInTheDocument()
    expect(layout).not.toHaveBeenCalled()
  })

it.each(['global', 'project:selected'])('opens shortcuts only for the one selected brain %s', selection => {
  open(selection)
  expect(layout).toHaveBeenCalledWith(expect.objectContaining({ side: 'bottom', view: 'shortcuts', brainId: selection }))
  expect(screen.getByLabelText('bottom shortcuts')).toHaveTextContent(selection)
})
