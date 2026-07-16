import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MeshPage } from './MeshPage';
import { fetchLeader, fetchNodes as fetchMeshNodes, forceReElection } from '../api/mesh';
import { fetchHeadscaleNodes, deleteHeadscaleNode, fetchPreAuthKeys, createPreAuthKey, fetchHeadscaleUsers } from '../api/headscale';

vi.mock('../api/mesh', () => ({
  fetchLeader: vi.fn(),
  fetchNodes: vi.fn(),
  forceReElection: vi.fn(),
}));

vi.mock('../api/headscale', () => ({
  fetchHeadscaleNodes: vi.fn(),
  deleteHeadscaleNode: vi.fn(),
  fetchPreAuthKeys: vi.fn(),
  createPreAuthKey: vi.fn(),
  fetchHeadscaleUsers: vi.fn(),
}));

describe('MeshPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.confirm = vi.fn(() => true);
  });

  it('renders mesh nodes and leader', async () => {
    vi.mocked(fetchLeader).mockResolvedValue({ hostname: 'macmini.mesh', ip: '1.2.3.4' });
    vi.mocked(fetchMeshNodes).mockResolvedValue([
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
    vi.mocked(fetchMeshNodes).mockResolvedValue([]);
    vi.mocked(forceReElection).mockResolvedValue(undefined);

    render(<MeshPage />);
    
    await waitFor(() => {
      expect(screen.getByText('Force Re-Election')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText('Force Re-Election'));
    expect(forceReElection).toHaveBeenCalled();
  });

  it('renders Headscale Nodes tab and allows deletion', async () => {
    vi.mocked(fetchLeader).mockResolvedValue({ hostname: 'macmini.mesh', ip: '1.2.3.4' });
    vi.mocked(fetchMeshNodes).mockResolvedValue([]);
    vi.mocked(fetchHeadscaleNodes).mockResolvedValue([
      { id: '1', name: 'node-one', user: 'testuser', ipAddresses: ['100.64.0.1'], online: true, createdAt: '2024-01-01', lastSeen: '2024-01-01T00:00:00Z' }
    ]);
    vi.mocked(deleteHeadscaleNode).mockResolvedValue(undefined);

    render(<MeshPage />);

    const tabBtn = screen.getByText('Headscale Nodes');
    await userEvent.click(tabBtn);

    await waitFor(() => {
      expect(screen.getByText('node-one')).toBeInTheDocument();
      expect(screen.getByText('100.64.0.1')).toBeInTheDocument();
    });

    const deleteBtn = screen.getByText('Delete');
    await userEvent.click(deleteBtn);
    expect(window.confirm).toHaveBeenCalled();
    expect(deleteHeadscaleNode).toHaveBeenCalledWith('1');
  });

  it('renders Pre-Auth Keys tab and supports key generation', async () => {
    vi.mocked(fetchLeader).mockResolvedValue({ hostname: 'macmini.mesh', ip: '1.2.3.4' });
    vi.mocked(fetchMeshNodes).mockResolvedValue([]);
    vi.mocked(fetchPreAuthKeys).mockResolvedValue([
      { id: 'key1', key: 'hspkey_xyz', user: 'default', reusable: true, expiration: '2099-12-31T23:59:59Z', createdAt: '2024-01-01', used: false }
    ]);
    vi.mocked(createPreAuthKey).mockResolvedValue({} as any);

    render(<MeshPage />);

    const tabBtn = screen.getByText('Pre-Auth Keys');
    await userEvent.click(tabBtn);

    await waitFor(() => {
      expect(screen.getByText('hspkey_xyz')).toBeInTheDocument();
      expect(screen.getByText('Generate Key')).toBeInTheDocument();
    });

    const generateBtn = screen.getByText('Generate Key');
    await userEvent.click(generateBtn);

    expect(createPreAuthKey).toHaveBeenCalledWith({
      user: 'default',
      reusable: false,
      ephemeral: false,
      expiration: '2099-12-31T23:59:59Z'
    });
  });

  it('renders Users tab', async () => {
    vi.mocked(fetchLeader).mockResolvedValue({ hostname: 'macmini.mesh', ip: '1.2.3.4' });
    vi.mocked(fetchMeshNodes).mockResolvedValue([]);
    vi.mocked(fetchHeadscaleUsers).mockResolvedValue([
      { id: 'u1', name: 'alice', createdAt: '2024-01-01T00:00:00Z' }
    ]);

    render(<MeshPage />);

    const tabBtn = screen.getByText('Users');
    await userEvent.click(tabBtn);

    await waitFor(() => {
      expect(screen.getByText('alice')).toBeInTheDocument();
    });
  });
});
