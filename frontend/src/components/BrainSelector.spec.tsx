import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import BrainSelector from './BrainSelector';
import * as api from '../api';

vi.mock('../api');

describe('BrainSelector', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    global.fetch = vi.fn();
  });

  it('renders loading state initially', () => {
    vi.mocked(api.getApiBase).mockReturnValue('http://localhost:3000');
    // Promise that never resolves for testing loading state
    (global.fetch as any).mockReturnValue(new Promise(() => {}));

    render(<BrainSelector activeBrainId="default" onBrainChange={() => {}} />);
    expect(screen.getByText(/Brains…/i)).toBeInTheDocument();
  });

  it('renders brains after fetch', async () => {
    vi.mocked(api.getApiBase).mockReturnValue('http://localhost:3000');
    (global.fetch as any).mockResolvedValue({
      json: () => Promise.resolve({
        brains: [
          { id: 'default', name: 'Global Brain', layer: 'global', exists: true, node_count: 10 }
        ]
      })
    });

    render(<BrainSelector activeBrainId="default" onBrainChange={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText(/Global Brain/i)).toBeInTheDocument();
    });
  });

  it('toggles brain selection', async () => {
    vi.mocked(api.getApiBase).mockReturnValue('http://localhost:3000');
    (global.fetch as any).mockResolvedValue({
      json: () => Promise.resolve({
        brains: [
          { id: 'default', name: 'Global Brain', layer: 'global', exists: true, node_count: 10 },
          { id: 'proj', name: 'Project Brain', layer: 'project', exists: true, node_count: 5 }
        ]
      })
    });

    const onBrainChange = vi.fn();
    render(<BrainSelector activeBrainId="default" onBrainChange={onBrainChange} />);

    // Wait for load
    await waitFor(() => {
      expect(screen.getByText(/Global Brain/i)).toBeInTheDocument();
    });

    // Expand dropdown
    const trigger = screen.getByTitle('Select brain layers');
    fireEvent.click(trigger);

    // Click checkbox
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes.length).toBe(2);

    // Toggle the second one
    fireEvent.click(checkboxes[1]);

    expect(onBrainChange).toHaveBeenCalledWith('default,proj');
  });
});
