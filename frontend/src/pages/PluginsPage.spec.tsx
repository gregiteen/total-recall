import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import PluginsPage from './PluginsPage';

// Mock fetch globally
const mockFetch = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ installed: [], catalog: [] })
});
globalThis.fetch = mockFetch as unknown as typeof fetch;

describe('PluginsPage', () => {
  it('renders plugins page', () => {
    render(<PluginsPage />);
    expect(screen.getByText(/Plugin/i)).toBeInTheDocument();
  });
});
