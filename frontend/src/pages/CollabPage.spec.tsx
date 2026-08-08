import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import CollabPage from './CollabPage';

// Mock fetch globally
const mockFetch = vi.fn();
globalThis.fetch = mockFetch as unknown as typeof fetch;

describe('CollabPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
  });

  it('renders login view by default when no token', () => {
    render(<CollabPage />);
    expect(screen.getByText(/Total Recall Collaboration/i)).toBeInTheDocument();
    expect(screen.getByText(/Access Collab Hub/i)).toBeInTheDocument();
  });

  it('handles login successfully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ token: 'mock-token', username: 'testuser' })
    });

    // Mock the subsequent groups fetch
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ([])
    });

    render(<CollabPage />);

    // removed variables

    fireEvent.change(screen.getByText(/Username/i).nextElementSibling as HTMLInputElement, { target: { value: 'testuser' } });
    fireEvent.change(screen.getByText(/Password/i).nextElementSibling as HTMLInputElement, { target: { value: 'password123' } });

    fireEvent.click(screen.getByText(/Access Collab Hub/i));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/collab/auth/login', expect.any(Object));
      expect(screen.getByText(/Collab Spaces for/i)).toBeInTheDocument();
      expect(screen.getByText(/testuser/i)).toBeInTheDocument();
    });
  });

  it('renders dashboard directly if token exists', async () => {
    localStorage.setItem('collab_token', 'mock-token');
    localStorage.setItem('collab_username', 'testuser');

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ([])
    });

    render(<CollabPage />);

    await waitFor(() => {
      expect(screen.getByText(/Collab Spaces for/i)).toBeInTheDocument();
    });
  });
});
