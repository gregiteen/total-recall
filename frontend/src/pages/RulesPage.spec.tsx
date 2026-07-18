import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import RulesPage from './RulesPage';

const apiFetch = vi.fn();
const getApiBase = vi.fn().mockReturnValue('');

vi.mock('../api', () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
  getApiBase: () => getApiBase(),
}));

describe('RulesPage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        rules: [
          {
            slug: 'test-inv',
            category: 'invariants',
            title: 'Always test',
            status: 'active',
            importance: 4,
            body: 'Run tests.',
            scope: 'global',
          },
        ],
        count: 1,
      }),
    });
  });

  it('renders the Agent Rules title and rule cards', async () => {
    render(<RulesPage activeBrainId="test-brain" />);
    expect(await screen.findByText('Agent Rules')).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText('Always test')).toBeTruthy();
    });
    expect(screen.getByTestId('rule-card')).toBeTruthy();
  });

  it('shows error state when API fails', async () => {
    apiFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Failed to load agent rules' }),
    });
    render(<RulesPage activeBrainId="test-brain" />);
    expect(await screen.findByTestId('rules-error')).toBeTruthy();
    expect(screen.getByText(/Failed to load agent rules/i)).toBeTruthy();
  });
});
