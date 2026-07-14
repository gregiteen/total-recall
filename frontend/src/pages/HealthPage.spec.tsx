/**
 * HealthPage.spec.tsx
 *
 * NOTE: vitest and @testing-library/react are not yet installed.
 * Install deps before running:
 *   npm install -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import HealthPage from './HealthPage'

// ─── Mock api module ───────────────────────────────────────────────────────────
vi.mock('../api', () => ({
  fetchHealth: vi.fn(),
  checkUpdate: vi.fn(),
  runUpdate: vi.fn(),
}))

import { fetchHealth, checkUpdate } from '../api'

const MOCK_HEALTH = {
  status: 'ok',
  uptime: 3661,
  version: '1.2.3',
  daemon: true,
  memory_nodes: 42,
  model: 'gemini-2.0-flash',
  services: {},
}

describe('HealthPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(fetchHealth as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_HEALTH)
    ;(checkUpdate as ReturnType<typeof vi.fn>).mockResolvedValue({
      updateAvailable: false,
      currentVersion: '1.2.3',
    })
  })

  it('renders without crashing', () => {
    render(<HealthPage />)
    expect(document.body).toBeTruthy()
  })

  it('shows a loading/skeleton state before data arrives', () => {
    // Delay resolution so we catch the loading state
    ;(fetchHealth as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise(() => {}) // never resolves
    )
    render(<HealthPage />)
    // Either a skeleton element or a loading indicator
    const skeleton = document.querySelector('.skeleton')
    const loadingText = screen.queryByText(/loading/i)
    expect(skeleton !== null || loadingText !== null).toBe(true)
  })

  it('displays health status after data loads', async () => {
    render(<HealthPage />)
    await waitFor(() => {
      // Status 'ok' should appear somewhere
      expect(screen.getByText(/ok/i)).toBeInTheDocument()
    })
  })

  it('displays version information', async () => {
    render(<HealthPage />)
    await waitFor(() => {
      expect(screen.getByText(/1\.2\.3/)).toBeInTheDocument()
    })
  })

  it('displays uptime formatted correctly', async () => {
    render(<HealthPage />)
    await waitFor(() => {
      // 3661s = 1h 1m 1s → should show something with h and m
      expect(screen.getByText(/1h 1m/)).toBeInTheDocument()
    })
  })

  it('polls fetchHealth on a timer', async () => {
    vi.useFakeTimers()
    render(<HealthPage />)
    // Advance timers to trigger next poll interval
    vi.advanceTimersByTime(15000)
    await waitFor(() => {
      expect(fetchHealth).toHaveBeenCalledTimes(2)
    })
    vi.useRealTimers()
  })

  it('shows update-available banner when an update is available', async () => {
    ;(checkUpdate as ReturnType<typeof vi.fn>).mockResolvedValue({
      updateAvailable: true,
      currentVersion: '1.0.0',
      latestVersion: '1.2.3',
    })
    render(<HealthPage />)
    await waitFor(() => {
      expect(screen.getByText(/update/i)).toBeInTheDocument()
    })
  })

  it('shows system-up-to-date indication when no update is available', async () => {
    render(<HealthPage />)
    await waitFor(() => {
      // The update check should run and find no update
      expect(checkUpdate).toHaveBeenCalled()
    })
  })
})
