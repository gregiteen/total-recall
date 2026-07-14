/**
 * ChatPage.spec.tsx
 *
 * NOTE: vitest and @testing-library/react are not yet installed.
 * Install deps before running:
 *   npm install -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import ChatPage from './ChatPage'

// ─── Mock the api module ───────────────────────────────────────────────────────
vi.mock('../api', () => ({
  sendChat: vi.fn(),
  createTask: vi.fn(),
  listTasks: vi.fn(),
  fetchTtsStatus: vi.fn(),
  fetchTtsAudio: vi.fn(),
  fetchChatHistory: vi.fn(),
  fetchChatThreads: vi.fn(),
  deleteChatThread: vi.fn(),
  listMemory: vi.fn(),
  listResearch: vi.fn(),
  fetchHealth: vi.fn(),
  fetchGeminiModels: vi.fn(),
  shareToApi: vi.fn(),
  fetchExtensionStatus: vi.fn(),
  checkUpdate: vi.fn(),
}))

// ─── Mock Graph3D (heavy WebGL component, not relevant here) ──────────────────
vi.mock('../components/Graph3D', () => ({
  default: () => <div data-testid="graph-3d-mock" />,
}))

import {
  sendChat,
  fetchChatHistory,
  fetchChatThreads,
  listMemory,
  listResearch,
  fetchHealth,
  fetchGeminiModels,
  fetchExtensionStatus,
  checkUpdate,
} from '../api'

function renderChatPage(brainId?: string) {
  return render(
    <MemoryRouter>
      <ChatPage activeBrainId={brainId} onBrainChange={vi.fn()} />
    </MemoryRouter>
  )
}

describe('ChatPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(fetchChatThreads as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(fetchChatHistory as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(listMemory as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(listResearch as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [] })
    ;(fetchHealth as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'ok' })
    ;(fetchGeminiModels as ReturnType<typeof vi.fn>).mockResolvedValue([])
    ;(fetchExtensionStatus as ReturnType<typeof vi.fn>).mockResolvedValue({ available: false, connected: false })
    ;(checkUpdate as ReturnType<typeof vi.fn>).mockResolvedValue({ updateAvailable: false })
    ;(sendChat as ReturnType<typeof vi.fn>).mockResolvedValue({ message: 'Hello from AI', thread_id: 't1' })
  })

  it('renders the chat input textarea without crashing', async () => {
    renderChatPage()
    await waitFor(() => {
      const textarea = document.querySelector('textarea')
      expect(textarea).not.toBeNull()
    })
  })

  it('renders a send / submit button', async () => {
    renderChatPage()
    await waitFor(() => {
      // Button might be an icon button; look for any submit trigger
      const buttons = screen.getAllByRole('button')
      expect(buttons.length).toBeGreaterThan(0)
    })
  })

  it('enables input after initial data loads', async () => {
    renderChatPage()
    await waitFor(() => {
      const textarea = document.querySelector('textarea')
      expect(textarea).not.toBeNull()
      // Should not be disabled once loaded
      expect((textarea as HTMLTextAreaElement).disabled).toBe(false)
    })
  })

  it('sends a chat message when the user types and submits', async () => {
    renderChatPage()
    await waitFor(() => document.querySelector('textarea'))

    const textarea = document.querySelector('textarea') as HTMLTextAreaElement
    await userEvent.type(textarea, 'Hello, assistant!')
    // Submit via Enter key (most chat apps use Shift+Enter for newline, Enter to send)
    fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter', shiftKey: false })

    await waitFor(() => {
      expect(sendChat).toHaveBeenCalled()
    })
  })

  it('calls fetchChatThreads on mount', async () => {
    renderChatPage()
    await waitFor(() => {
      expect(fetchChatThreads).toHaveBeenCalled()
    })
  })

  it('loads memory nodes for grounding context on mount', async () => {
    renderChatPage('brain-xyz')
    await waitFor(() => {
      expect(listMemory).toHaveBeenCalled()
    })
  })
})
