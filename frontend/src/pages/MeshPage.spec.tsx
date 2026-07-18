import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MeshPage } from './MeshPage';
import { fetchLeader, fetchNodes as fetchMeshNodes, refreshElection } from '../api/mesh';
import { fetchHeadscaleNodes, deleteHeadscaleNode, fetchPreAuthKeys, createPreAuthKey, fetchHeadscaleUsers } from '../api/headscale';

vi.mock('../api/mesh', () => ({
  fetchLeader: vi.fn(),
  fetchNodes: vi.fn(),
  refreshElection: vi.fn(),
  fetchMeshLatency: vi.fn().mockResolvedValue({ latency_ms: {}, results: [], measured_at: new Date().toISOString() }),
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
    vi.mocked(fetchLeader).mockResolvedValue({ hostname: 'node-a.mesh', ip: '100.64.0.1' });
    vi.mocked(fetchMeshNodes).mockResolvedValue([
      {
        hostname: 'node-a.mesh',
        ip: '100.64.0.1',
        online: true,
        self: true,
        os: 'linux',
        role: 'build-host',
        labels: ['ci'],
        has_entity: true,
        title: 'Builder A',
      },
      { hostname: 'node-b.mesh', ip: '100.64.0.2', online: false, self: false, os: 'linux', has_entity: false },
    ]);

    render(<MeshPage />);

    await waitFor(() => {
      expect(screen.getAllByText('node-a.mesh').length).toBeGreaterThan(0);
      expect(screen.getAllByText('node-b.mesh').length).toBeGreaterThan(0);
    });
    expect(screen.getByTestId('mesh-topology')).toBeInTheDocument();
  });

  it('refreshes deterministic election state', async () => {
    vi.mocked(fetchLeader).mockResolvedValue({ hostname: 'node-a.mesh', ip: '100.64.0.1' });
    vi.mocked(fetchMeshNodes).mockResolvedValue([]);
    vi.mocked(refreshElection).mockResolvedValue({ hostname: 'node-a.mesh', ip: '100.64.0.1' });

    render(<MeshPage />);
    
    await waitFor(() => {
      expect(screen.getByText('Refresh Election')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText('Refresh Election'));
    expect(refreshElection).toHaveBeenCalled();
  });

  it('renders Headscale Nodes tab and allows deletion', async () => {
    vi.mocked(fetchLeader).mockResolvedValue({ hostname: 'node-a.mesh', ip: '100.64.0.1' });
    vi.mocked(fetchMeshNodes).mockResolvedValue([]);
    vi.mocked(fetchHeadscaleNodes).mockResolvedValue([
      { id: '1', name: 'node-one', user: 'testuser', ipAddresses: ['100.64.0.10'], online: true, createdAt: '2024-01-01', lastSeen: '2024-01-01T00:00:00Z' }
    ]);
    vi.mocked(deleteHeadscaleNode).mockResolvedValue(undefined);

    render(<MeshPage />);

    const tabBtn = screen.getByText('Headscale Nodes');
    await userEvent.click(tabBtn);

    await waitFor(() => {
      expect(screen.getByText('node-one')).toBeInTheDocument();
      expect(screen.getByText('100.64.0.10')).toBeInTheDocument();
    });

    const deleteBtn = screen.getByText('Delete');
    await userEvent.click(deleteBtn);
    expect(window.confirm).toHaveBeenCalled();
    expect(deleteHeadscaleNode).toHaveBeenCalledWith('1');
  });

  it('renders Pre-Auth Keys tab and supports key generation', async () => {
    vi.mocked(fetchLeader).mockResolvedValue({ hostname: 'node-a.mesh', ip: '100.64.0.1' });
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
    vi.mocked(fetchLeader).mockResolvedValue({ hostname: 'node-a.mesh', ip: '100.64.0.1' });
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
