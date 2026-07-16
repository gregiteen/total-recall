import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MeshPage } from './MeshPage';
import { fetchLeader, fetchNodes, forceReElection } from '../api/mesh';

vi.mock('../api/mesh', () => ({
  fetchLeader: vi.fn(),
  fetchNodes: vi.fn(),
  forceReElection: vi.fn(),
}));

describe('MeshPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders mesh nodes and leader', async () => {
    vi.mocked(fetchLeader).mockResolvedValue({ hostname: 'macmini.mesh', ip: '1.2.3.4' });
    vi.mocked(fetchNodes).mockResolvedValue([
      { hostname: 'macmini.mesh', ip: '1.2.3.4', status: 'online', role: 'leader', lastHeartbeat: '2024-01-01T00:00:00Z' },
      { hostname: 'laptop.mesh', ip: '1.2.3.5', status: 'offline', role: 'follower', lastHeartbeat: '2024-01-01T00:00:00Z' },
    ]);

    render(<MeshPage />);

    await waitFor(() => {
      expect(screen.getByText('macmini.mesh')).toBeInTheDocument();
      expect(screen.getByText('laptop.mesh')).toBeInTheDocument();
    });
  });

  it('handles force re-election', async () => {
    vi.mocked(fetchLeader).mockResolvedValue({ hostname: 'macmini.mesh', ip: '1.2.3.4' });
    vi.mocked(fetchNodes).mockResolvedValue([]);
    vi.mocked(forceReElection).mockResolvedValue(undefined);

    render(<MeshPage />);
    
    await waitFor(() => {
      expect(screen.getByText('Force Re-Election')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText('Force Re-Election'));
    expect(forceReElection).toHaveBeenCalled();
  });
});
