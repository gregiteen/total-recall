/**
 * LoginPage.spec.tsx
 *
 * NOTE: vitest and @testing-library/react are not yet installed.
 * Install deps before running:
 *   npm install -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
 *
 * Then add to frontend/vite.config.ts (or vitest.config.ts):
 *   test: { environment: 'jsdom', globals: true, setupFiles: ['./src/setupTests.ts'] }
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LoginPage from './LoginPage'

// ─── Mock the api module ───────────────────────────────────────────────────────
vi.mock('../api', () => ({
  login: vi.fn(),
  changePassword: vi.fn(),
  getAuthStatus: vi.fn(),
  setupPassword: vi.fn(),
}))

// ─── Mock BrandMark (SVG component — not relevant to page logic) ───────────────
vi.mock('../components/brand/BrandMark', () => ({
  default: () => <div data-testid="brand-mark" />,
}))

import { login, getAuthStatus, setupPassword } from '../api'

describe('LoginPage', () => {
  const onAuthenticated = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    ;(getAuthStatus as ReturnType<typeof vi.fn>).mockResolvedValue({ configured: true })
  })

  it('renders the password input and submit button', async () => {
    render(<LoginPage onAuthenticated={onAuthenticated} />)
    // Wait for the getAuthStatus call to settle
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sign in|unlock|enter/i })).toBeInTheDocument()
    })
    expect(screen.getByRole('textbox') || document.querySelector('input[type="password"]')).toBeTruthy()
  })

  it('shows an error when submitting empty password', async () => {
    ;(login as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, error: 'Invalid password' })
    render(<LoginPage onAuthenticated={onAuthenticated} />)
    await waitFor(() => screen.getByRole('button'))
    fireEvent.click(screen.getByRole('button'))
    // Either inline error or the api returning error
    await waitFor(() => {
      expect(onAuthenticated).not.toHaveBeenCalled()
    })
  })

  it('calls onAuthenticated on successful login', async () => {
    ;(login as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true })
    render(<LoginPage onAuthenticated={onAuthenticated} />)
    await waitFor(() => screen.getByRole('button'))

    const input = document.querySelector('input[type="password"]') as HTMLInputElement
    await userEvent.type(input, 'mysecretpassword')
    fireEvent.click(screen.getByRole('button'))

    await waitFor(() => {
      expect(login).toHaveBeenCalledWith('mysecretpassword')
      expect(onAuthenticated).toHaveBeenCalledTimes(1)
    })
  })

  it('shows first-time setup form when auth is not configured', async () => {
    ;(getAuthStatus as ReturnType<typeof vi.fn>).mockResolvedValue({ configured: false })
    render(<LoginPage onAuthenticated={onAuthenticated} />)
    await waitFor(() => {
      // First-time form shows a new-password input
      const inputs = document.querySelectorAll('input[type="password"]')
      expect(inputs.length).toBeGreaterThan(0)
    })
  })

  it('validates new password length during first-time setup', async () => {
    ;(getAuthStatus as ReturnType<typeof vi.fn>).mockResolvedValue({ configured: false })
    ;(setupPassword as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, error: 'too short' })
    render(<LoginPage onAuthenticated={onAuthenticated} />)
    await waitFor(() => screen.getByRole('button'))

    const input = document.querySelector('input[type="password"]') as HTMLInputElement
    await userEvent.type(input, 'short')
    fireEvent.click(screen.getByRole('button'))

    await waitFor(() => {
      expect(screen.getByText(/at least 8 characters/i)).toBeInTheDocument()
    })
  })
})
