import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PluginsPage from './PluginsPage';

// Mock fetch globally
const mockFetch = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ installed: [], catalog: [] })
});
globalThis.fetch = mockFetch as unknown as typeof fetch;

describe('PluginsPage', () => {
  it('renders plugins page', () => {
    // PluginsPage reads useSearchParams(), so it must be rendered inside a
    // Router — without one react-router throws and nothing mounts.
    render(
      <MemoryRouter>
        <PluginsPage />
      </MemoryRouter>,
    );
    // getByText(/Plugin/i) matched both the heading and the install button.
    expect(screen.getByRole('heading', { name: /Plugins/i })).toBeInTheDocument();
  });
});
