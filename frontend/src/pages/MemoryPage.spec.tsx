/**
 * MemoryPage.spec.tsx
 *
 * NOTE: vitest and @testing-library/react are not yet installed.
 * Install deps before running:
 *   npm install -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import MemoryPage from './MemoryPage'

// ─── Mock api module ───────────────────────────────────────────────────────────
vi.mock('../api', () => ({
  listMemory: vi.fn(),
  searchMemory: vi.fn(),
  readMemory: vi.fn(),
  fetchConflicts: vi.fn(),
  resolveConflict: vi.fn(),
  saveMemory: vi.fn(),
  createMemory: vi.fn(),
  deleteMemory: vi.fn(),
  fetchSessions: vi.fn(),
  deleteSession: vi.fn(),
}))

import {
  listMemory,
  searchMemory,
  fetchConflicts,
  fetchSessions,
} from '../api'

const MOCK_NODES = [
  {
    slug: 'test-node-1',
    title: 'Test Memory Node 1',
    body: 'Some memory content',
    category: 'facts',
    tags: ['test'],
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  {
    slug: 'test-node-2',
    title: 'Test Memory Node 2',
    body: 'More memory content',
    category: 'preferences',
    tags: [],
    created_at: '2024-01-02T00:00:00Z',
    updated_at: '2024-01-02T00:00:00Z',
  },
]

function renderMemoryPage(brainId?: string) {
  return render(
    <MemoryRouter>
      <MemoryPage activeBrainId={brainId} />
    </MemoryRouter>
  )
}

describe('MemoryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(listMemory as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_NODES)
    ;(fetchConflicts as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(fetchSessions as ReturnType<typeof vi.fn>).mockResolvedValue({ sessions: [], total: 0 })
    ;(searchMemory as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_NODES)
  })

  it('renders the memory page without crashing', async () => {
    renderMemoryPage()
    // Component should mount successfully
    expect(document.body).toBeTruthy()
  })

  it('shows memory nodes after loading', async () => {
    renderMemoryPage()
    await waitFor(() => {
      expect(screen.getByText('Test Memory Node 1')).toBeInTheDocument()
    })
    expect(screen.getByText('Test Memory Node 2')).toBeInTheDocument()
  })

  it('shows empty state when no nodes exist', async () => {
    ;(listMemory as ReturnType<typeof vi.fn>).mockResolvedValue([])
    renderMemoryPage()
    await waitFor(() => {
      // Either a "no memories" message or empty list
      expect(listMemory).toHaveBeenCalled()
    })
    // Should not show node titles when empty
    expect(screen.queryByText('Test Memory Node 1')).not.toBeInTheDocument()
  })

  it('calls listMemory with the activeBrainId', async () => {
    renderMemoryPage('brain-abc-123')
    await waitFor(() => {
      expect(listMemory).toHaveBeenCalledWith('brain-abc-123')
    })
  })

  it('renders category filter buttons', async () => {
    renderMemoryPage()
    await waitFor(() => {
      // CATEGORIES constant includes 'all', 'invariants', etc.
      expect(screen.getByText('all')).toBeInTheDocument()
    })
  })

  it('triggers search when query changes', async () => {
    renderMemoryPage()
    await waitFor(() => screen.getByText('Test Memory Node 1'))

    const searchInput = screen.getByPlaceholderText(/search/i)
    fireEvent.change(searchInput, { target: { value: 'test query' } })

    await waitFor(() => {
      expect(searchMemory).toHaveBeenCalledWith(
        expect.stringContaining('test query'),
        expect.anything(),
        expect.anything()
      )
    })
  })
})
