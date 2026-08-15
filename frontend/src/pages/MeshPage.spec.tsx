import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MeshPage } from './MeshPage';
import {
  fetchLeader,
  fetchNodes as fetchMeshNodes,
  refreshElection,
  fetchEnrollmentStatus,
  enrollThisNode,
  fetchAccessProposals,
  importAccessFromSshConfig,
  setNodeAccess,
} from '../api/mesh';
import { fetchHeadscaleNodes, deleteHeadscaleNode, fetchPreAuthKeys, createPreAuthKey, fetchHeadscaleUsers } from '../api/headscale';

vi.mock('../api/mesh', () => ({
  fetchLeader: vi.fn(),
  fetchNodes: vi.fn(),
  refreshElection: vi.fn(),
  fetchMeshLatency: vi.fn().mockResolvedValue({
    latency_ms: { 'node-a.mesh': 0, 'node-b.mesh': 12 },
    results: [],
    measured_at: new Date().toISOString(),
  }),
  fetchMeshInterfaces: vi.fn().mockResolvedValue({
    interfaces: [],
    summary: [{ name: 'eth0', kind: 'ethernet', ipv4: ['192.168.1.10'] }],
    measured_at: new Date().toISOString(),
  }),
  fetchLanDiscovery: vi.fn().mockResolvedValue({
    discovered_at: new Date().toISOString(),
    interfaces: [],
    local_lan: [],
    hosts: [{ ip: '192.168.1.20', mac: 'aa:bb:cc:dd:ee:ff', tr_reachable: false }],
    host_count: 1,
    tr_reachable_count: 0,
  }),
  fetchDeviceIo: vi.fn().mockResolvedValue({
    io: {
      headless: false,
      display: { present: true, touch: false, count: 1, width: 1920, height: 1080 },
      audio: { input: true, output: true },
      camera: { present: false },
      input: { keyboard: true, pointer: true, touch: false },
      channels: ['screen', 'keyboard', 'pointer', 'microphone', 'speaker'],
      ui_hints: ['desktop_or_browser_ui', 'voice_input_ok'],
    },
    ui_hints: ['desktop_or_browser_ui', 'voice_input_ok'],
    entity_path: null,
  }),
  registerLanMeshNodes: vi.fn().mockResolvedValue({
    success: true,
    discovery: { host_count: 1, tr_reachable_count: 0, discovered_at: new Date().toISOString() },
    registration: { attempted: 0, written_count: 0, results: [] },
  }),
  fetchElectionHistory: vi.fn().mockResolvedValue([]),
  logElectionObservation: vi.fn().mockResolvedValue({ success: true, recorded: true }),
  fetchEnrollmentStatus: vi.fn().mockResolvedValue({
    state: 'enrolled',
    enrolled: true,
    backend_state: 'Running',
    auth_url: null,
    ips: ['100.64.0.1'],
    hostname: 'node-a',
    login_server: 'https://control.example.org',
    can_auto_enroll: true,
    auto_enroll_blocked_reason: null,
    auto_enroll_enabled: true,
    client_available: true,
    checked_at: new Date().toISOString(),
  }),
  enrollThisNode: vi.fn(),
  // Default to a host with no ssh config to import from, so the access banner
  // stays out of the way of tests asserting on other things.
  fetchAccessProposals: vi.fn().mockResolvedValue({
    proposals: [],
    missing_access: [],
    checked_at: new Date().toISOString(),
  }),
  importAccessFromSshConfig: vi.fn(),
  setNodeAccess: vi.fn(),
}));

vi.mock('../api/headscale', () => ({
  fetchHeadscaleNodes: vi.fn(),
  deleteHeadscaleNode: vi.fn(),
  fetchPreAuthKeys: vi.fn(),
  createPreAuthKey: vi.fn(),
  fetchHeadscaleUsers: vi.fn(),
  // Mesh SSH policy: default to "already configured" so the banner stays out of
  // the way of tests that are asserting on other things.
  fetchHeadscalePolicy: vi.fn().mockResolvedValue({ policy: '{}', configured: true }),
  saveHeadscalePolicy: vi.fn().mockResolvedValue({ policy: '{}', configured: true }),
  buildMeshSshPolicy: vi.fn(() => '{}'),
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
    expect(screen.getByTestId('latency-matrix')).toBeInTheDocument();
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
    vi.mocked(createPreAuthKey).mockResolvedValue({} as never);

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

  describe('enrollment banner', () => {
    const notEnrolled = {
      state: 'needs_login' as const,
      enrolled: false,
      backend_state: 'NeedsLogin',
      auth_url: 'https://control.example.org/register/abc123',
      ips: [],
      hostname: 'node-a',
      login_server: 'https://control.example.org',
      can_auto_enroll: true,
      auto_enroll_blocked_reason: null,
      auto_enroll_enabled: true,
      client_available: true,
      checked_at: new Date().toISOString(),
    };

    beforeEach(() => {
      vi.mocked(fetchLeader).mockResolvedValue({ hostname: 'node-a.mesh', ip: '100.64.0.1' });
      vi.mocked(fetchMeshNodes).mockResolvedValue([]);
    });

    it('stays hidden when this node is already on the mesh', async () => {
      vi.mocked(fetchEnrollmentStatus).mockResolvedValue({ ...notEnrolled, state: 'enrolled', enrolled: true });
      render(<MeshPage />);
      await waitFor(() => expect(screen.getByText('Mesh Operations Center')).toBeInTheDocument());
      expect(screen.queryByTestId('enrollment-banner')).not.toBeInTheDocument();
    });

    it('prompts to enroll and shows the pending registration link', async () => {
      vi.mocked(fetchEnrollmentStatus).mockResolvedValue(notEnrolled);
      render(<MeshPage />);

      const banner = await screen.findByTestId('enrollment-banner');
      expect(banner).toHaveTextContent('This node is not on the mesh');
      expect(screen.getByRole('link', { name: /approve this node/i })).toHaveAttribute(
        'href',
        'https://control.example.org/register/abc123',
      );
      expect(screen.getByRole('button', { name: /enroll this node/i })).toBeInTheDocument();
    });

    it('enrolls on click and re-syncs enrollment state from the server', async () => {
      const enrolled = { ...notEnrolled, state: 'enrolled' as const, enrolled: true, ips: ['100.64.0.7'], auth_url: null };
      // The page must trust the server, not its own optimistic state: the
      // status call flips to `enrolled` only once the node is really up.
      vi.mocked(fetchEnrollmentStatus).mockResolvedValueOnce(notEnrolled).mockResolvedValue(enrolled);
      vi.mocked(enrollThisNode).mockResolvedValue({
        ok: true,
        changed: true,
        state: 'enrolled',
        method: 'preauth-key',
        status: enrolled,
      });

      render(<MeshPage />);
      await userEvent.click(await screen.findByRole('button', { name: /enroll this node/i }));

      await waitFor(() => expect(enrollThisNode).toHaveBeenCalled());
      await waitFor(() => expect(screen.queryByTestId('enrollment-banner')).not.toBeInTheDocument());
    });

    it('explains what to configure when no automatic path exists', async () => {
      vi.mocked(fetchEnrollmentStatus).mockResolvedValue({
        ...notEnrolled,
        can_auto_enroll: false,
        auto_enroll_blocked_reason: 'no-headscale-api-key',
        login_server: null,
      });
      render(<MeshPage />);
      const banner = await screen.findByTestId('enrollment-banner');
      expect(banner).toHaveTextContent(/No control server configured/i);
    });

    it('hides the enroll button when no tailscale client is installed', async () => {
      vi.mocked(fetchEnrollmentStatus).mockResolvedValue({
        ...notEnrolled,
        state: 'client_unavailable',
        client_available: false,
        auth_url: null,
        can_auto_enroll: false,
      });
      render(<MeshPage />);
      const banner = await screen.findByTestId('enrollment-banner');
      expect(banner).toHaveTextContent(/No Tailscale client detected/i);
      expect(screen.queryByRole('button', { name: /enroll this node/i })).not.toBeInTheDocument();
    });
  });

  // A node reached with the wrong login refuses the connection in exactly the
  // way an unreachable node does. The page has to say so, or the operator
  // debugs the network instead of the one missing fact.
  describe('node access', () => {
    const reachable = {
      hostname: 'node-a.mesh',
      ip: '100.64.0.1',
      online: true,
      self: false,
      os: 'linux',
      access: { ssh_user: 'operator', source: 'ssh_config' as const },
      access_resolved: {
        user: 'operator',
        host: '100.64.0.1',
        port: 22,
        identity_file: null,
        mesh_ssh: 'unknown' as const,
        tailscale_variant: 'unknown' as const,
        source: 'ssh_config' as const,
        verified_at: null,
        complete: true,
        target: 'operator@100.64.0.1',
      },
    };
    const noLogin = {
      hostname: 'node-b.mesh',
      ip: '100.64.0.2',
      online: true,
      self: false,
      os: 'linux',
      access_resolved: { ...reachable.access_resolved, user: null, host: '100.64.0.2', source: 'unknown' as const, complete: false, target: null },
    };

    beforeEach(() => {
      vi.mocked(fetchLeader).mockResolvedValue({ hostname: 'node-a.mesh', ip: '100.64.0.1' });
    });

    it('shows the resolved login target for a node that has one', async () => {
      vi.mocked(fetchMeshNodes).mockResolvedValue([reachable]);
      render(<MeshPage />);
      await waitFor(() => expect(screen.getAllByText('operator@100.64.0.1').length).toBeGreaterThan(0));
      expect(screen.queryByTestId('mesh-access-banner')).not.toBeInTheDocument();
    });

    it('warns about nodes with no recorded login account', async () => {
      vi.mocked(fetchMeshNodes).mockResolvedValue([reachable, noLogin]);
      render(<MeshPage />);
      const banner = await screen.findByTestId('mesh-access-banner');
      expect(banner).toHaveTextContent('1 node has no recorded login account');
      expect(banner).toHaveTextContent('node-b.mesh');
      // Nothing to import from: the button must not appear and imply otherwise.
      expect(screen.queryByRole('button', { name: /import from ssh config/i })).not.toBeInTheDocument();
    });

    it('offers the ssh config as a source and imports it on click', async () => {
      vi.mocked(fetchMeshNodes).mockResolvedValue([noLogin]);
      vi.mocked(fetchAccessProposals).mockResolvedValue({
        proposals: [
          { hostname: 'node-b.mesh', ip: '100.64.0.2', matched_host: 'node-b', access: { ssh_user: 'operator', source: 'ssh_config' } },
        ],
        missing_access: ['node-b.mesh'],
        checked_at: new Date().toISOString(),
      });
      vi.mocked(importAccessFromSshConfig).mockResolvedValue({
        success: true, attempted: 1, saved: 1, failed: 0,
        results: [{ hostname: 'node-b.mesh', ssh_user: 'operator', matched_host: 'node-b', written: true, reason: null }],
      });

      render(<MeshPage />);
      // The proposal is shown before it is applied — a wrong login written to
      // the vault is worse than none, because it looks authored.
      const proposals = await screen.findByTestId('access-proposals');
      expect(proposals).toHaveTextContent('from Host node-b');

      await userEvent.click(screen.getByRole('button', { name: /import from ssh config/i }));
      await waitFor(() => expect(importAccessFromSshConfig).toHaveBeenCalled());
      expect(await screen.findByText(/Recorded a login account for 1 node/)).toBeInTheDocument();
    });

    it('reports a partial import honestly rather than as a success', async () => {
      vi.mocked(fetchMeshNodes).mockResolvedValue([noLogin]);
      vi.mocked(fetchAccessProposals).mockResolvedValue({
        proposals: [
          { hostname: 'node-b.mesh', ip: '100.64.0.2', matched_host: 'node-b', access: { ssh_user: 'operator', source: 'ssh_config' } },
        ],
        missing_access: ['node-b.mesh'],
        checked_at: new Date().toISOString(),
      });
      vi.mocked(importAccessFromSshConfig).mockResolvedValue({
        success: false, attempted: 2, saved: 1, failed: 1,
        results: [],
      });

      render(<MeshPage />);
      await userEvent.click(await screen.findByRole('button', { name: /import from ssh config/i }));
      expect(await screen.findByText(/Recorded 1 of 2; 1 could not be saved/)).toBeInTheDocument();
    });

    it('records a login typed for the selected node', async () => {
      vi.mocked(fetchMeshNodes).mockResolvedValue([noLogin]);
      vi.mocked(setNodeAccess).mockResolvedValue({
        success: true,
        path: 'system/mesh-nodes/node-b.md',
        access: { ssh_user: 'operator' },
      });

      render(<MeshPage />);
      await userEvent.click(await screen.findByTestId('node-row-node-b.mesh'));

      await userEvent.type(screen.getByLabelText(/login account/i), 'operator');
      await userEvent.type(screen.getByLabelText(/^port$/i), '2222');
      await userEvent.click(screen.getByRole('button', { name: /save access/i }));

      await waitFor(() =>
        expect(setNodeAccess).toHaveBeenCalledWith({
          node: 'node-b.mesh',
          ssh_user: 'operator',
          ssh_port: '2222',
          identity_file: '',
          ssh_host: '',
        }),
      );
      expect(await screen.findByTestId('access-save-msg')).toHaveTextContent('Saved to the node entity');
    });

    // Polling replaces the node list on every cycle; a captured node object
    // would keep the pane on the state at the moment of the click — including
    // straight after an edit, where it would show the value it just replaced.
    it('keeps the detail pane on live data after a reload', async () => {
      vi.mocked(refreshElection).mockResolvedValue({ hostname: 'node-a.mesh', ip: '100.64.0.1' });
      vi.mocked(fetchMeshNodes)
        .mockResolvedValueOnce([noLogin])
        .mockResolvedValue([
          { ...noLogin, access: { ssh_user: 'operator' }, access_resolved: reachable.access_resolved },
        ]);

      render(<MeshPage />);
      await userEvent.click(await screen.findByTestId('node-row-node-b.mesh'));
      expect(await screen.findByTestId('node-access-target')).toHaveTextContent('no login recorded');

      await userEvent.click(screen.getByText('Refresh Election'));
      await waitFor(() =>
        expect(screen.getByTestId('node-access-target')).toHaveTextContent('operator@100.64.0.1'),
      );
    });
  });
});
