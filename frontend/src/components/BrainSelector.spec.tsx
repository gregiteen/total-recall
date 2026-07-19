import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import BrainSelector from './BrainSelector';

vi.mock('../api', () => ({
  apiFetch: vi.fn(),
  getApiBase: vi.fn(() => ''),
}));

import { apiFetch } from '../api';

describe('BrainSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading then brains from API', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        brains: [
          { id: 'global', name: 'Global Brain', layer: 'global', exists: true, node_count: 10 },
          {
            id: 'project:demo',
            name: 'demo',
            layer: 'project',
            exists: true,
            node_count: 5,
            project_root: '/tmp/demo',
          },
        ],
      }),
    } as any);

    const onBrainChange = vi.fn();
    render(<BrainSelector activeBrainId="global" onBrainChange={onBrainChange} />);

    expect(screen.getByTestId('brain-selector-loading')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('brain-selector')).toBeInTheDocument();
    });
    expect(screen.getByText(/Global Brain/i)).toBeInTheDocument();
  });

  it('selects a single brain on row click', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        brains: [
          { id: 'global', name: 'Global Brain', layer: 'global', exists: true, node_count: 10 },
          { id: 'project:demo', name: 'demo', layer: 'project', exists: true, node_count: 5 },
        ],
      }),
    } as any);

    const onBrainChange = vi.fn();
    render(<BrainSelector activeBrainId="global" onBrainChange={onBrainChange} />);

    await waitFor(() => expect(screen.getByTestId('brain-selector-trigger')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('brain-selector-trigger'));
    fireEvent.click(screen.getByTestId('brain-option-project:demo'));
    expect(onBrainChange).toHaveBeenCalledWith('project:demo');
  });

  it('multi-select via checkbox', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        brains: [
          { id: 'global', name: 'Global Brain', layer: 'global', exists: true, node_count: 10 },
          { id: 'project:demo', name: 'demo', layer: 'project', exists: true, node_count: 5 },
        ],
      }),
    } as any);

    const onBrainChange = vi.fn();
    render(<BrainSelector activeBrainId="global" onBrainChange={onBrainChange} />);
    await waitFor(() => expect(screen.getByTestId('brain-selector-trigger')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('brain-selector-trigger'));
    const checkbox = screen.getByLabelText('Include demo');
    fireEvent.click(checkbox);
    expect(onBrainChange).toHaveBeenCalledWith('global,project:demo');
  });

  it('shows error with retry when API fails', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Authentication required' }),
    } as any);

    render(<BrainSelector activeBrainId="global" onBrainChange={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByTestId('brain-selector-error')).toBeInTheDocument();
    });
  });
});
