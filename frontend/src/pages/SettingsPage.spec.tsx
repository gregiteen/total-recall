/**
 * SettingsPage.spec.tsx
 *
 * NOTE: vitest and @testing-library/react are not yet installed.
 * Install deps before running:
 *   npm install -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import SettingsPage from './SettingsPage'

// ─── Mock api module ───────────────────────────────────────────────────────────
vi.mock('../api', () => ({
  fetchConfigJson: vi.fn(),
  saveConfigJson: vi.fn(),
  runSandbox: vi.fn(),
  fetchHealth: vi.fn(),
  runAgentDiagnostics: vi.fn(),
  checkUpdate: vi.fn(),
  runUpdate: vi.fn(),
  fetchBrains: vi.fn(),
}))

import {
  fetchConfigJson,
  saveConfigJson,
  fetchHealth,
  checkUpdate,
  fetchBrains,
} from '../api'

const MOCK_CONFIG = {
  security: {
    dashboard: {},
    api: {},
    network: {},
    bind: {},
    rate_limits: {},
    sandbox: {},
    privacy: {},
  },
  budget: { budget: { enabled: true, daily_cap_usd: 5, weekly_cap_usd: 25 } },
  brain: {},
  secrets: {},
}

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(fetchConfigJson as ReturnType<typeof vi.fn>).mockResolvedValue({ ...MOCK_CONFIG })
    ;(saveConfigJson as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true })
    ;(fetchHealth as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 'ok', version: '1.0.0' })
    ;(checkUpdate as ReturnType<typeof vi.fn>).mockResolvedValue({ updateAvailable: false })
    ;(fetchBrains as ReturnType<typeof vi.fn>).mockResolvedValue([])
  })

  it('renders the settings page without crashing', async () => {
    render(<SettingsPage />)
    expect(document.body).toBeTruthy()
    await waitFor(() => expect(fetchConfigJson).toHaveBeenCalled())
  })

  it('loads config JSON on mount', async () => {
    render(<SettingsPage />)
    await waitFor(() => {
      expect(fetchConfigJson).toHaveBeenCalledTimes(1)
    })
  })

  it('shows a save button', async () => {
    render(<SettingsPage />)
    await waitFor(() => {
      const saveBtn = screen.queryByText(/save/i)
      expect(saveBtn).not.toBeNull()
    })
  })

  it('calls saveConfigJson when the save button is clicked', async () => {
    render(<SettingsPage />)
    await waitFor(() => screen.queryByText(/save/i))

    const saveBtn = screen.getByText(/save/i)
    fireEvent.click(saveBtn)

    await waitFor(() => {
      expect(saveConfigJson).toHaveBeenCalled()
    })
  })

  it('shows saved confirmation after successful save', async () => {
    render(<SettingsPage />)
    await waitFor(() => screen.queryByText(/save/i))

    fireEvent.click(screen.getByText(/save/i))

    await waitFor(() => {
      // Should show 'saved', 'success', or similar feedback
      const feedback = screen.queryByText(/saved|success/i)
      expect(feedback).not.toBeNull()
    })
  })

  it('loads brains list on mount', async () => {
    render(<SettingsPage activeBrainId="brain-1" />)
    await waitFor(() => {
      expect(fetchBrains).toHaveBeenCalled()
    })
  })

  it('renders section headings for major settings areas', async () => {
    render(<SettingsPage />)
    await waitFor(() => {
      // Settings page has sections like Security, Budget, etc.
      const headings = document.querySelectorAll('h2, h3')
      expect(headings.length).toBeGreaterThan(0)
    })
  })
})
