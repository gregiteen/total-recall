/**
 * What this node writes about itself.
 *
 * `patchOwnMeshNode` runs on a timer, so anything it gets wrong is not a
 * one-off: it is re-applied for as long as the daemon runs. The property that
 * matters most is that a periodic probe merges into the access record rather
 * than replacing it — a probe that overwrote it would delete the operator's
 * recorded login account on the next tick, and the node would go back to
 * looking unreachable with nothing in the history to explain why.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { clearMeshStatusCache, patchOwnMeshNode } from './mesh.mjs';
import { listVfsDocumentsUnder } from './vfs-documents.mjs';
import { processViaPackageKernel } from './ssss-kernel-bridge.mjs';

vi.mock('node:child_process', () => {
  const mockedSpawnSync = vi.fn();
  return { spawnSync: mockedSpawnSync, default: { spawnSync: mockedSpawnSync } };
});

vi.mock('./ssss-kernel-bridge.mjs', () => ({
  processViaPackageKernel: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('./vfs-documents.mjs', () => ({
  defaultVaultRoot: vi.fn(() => '/tmp/tr-self-entity-vault'),
  listVfsDocumentsUnder: vi.fn(() => []),
  findVfsDocumentByPath: vi.fn(() => null),
}));

vi.mock('./network-interfaces.mjs', () => ({
  summarizeInterfacesForEntity: vi.fn(() => [{ name: 'eth0', kind: 'ethernet', ipv4: ['10.0.0.5'] }]),
}));

vi.mock('./device-io.mjs', () => ({
  detectDeviceIo: vi.fn(() => ({ channels: ['screen'] })),
  mergeIoProfiles: vi.fn((live) => live),
}));

// No tailscaled at any probed path — the sandboxed-GUI case. On Linux the
// client and daemon ship together, so the platform still reads as capable.
vi.mock('./tailscale-cli.mjs', () => ({
  hasTailscaleDaemon: vi.fn(() => false),
  resolveTailscaleBinary: vi.fn(() => 'tailscale'),
  STATUS_TIMEOUT_MS: 10_000,
  FALLBACK_BINARIES: [],
  DARWIN_DAEMON_BINARIES: [],
}));

const STATUS = {
  Self: { DNSName: 'node-self.mesh.', TailscaleIPs: ['100.64.0.2'], OS: 'linux', Online: true },
  Peer: {},
};

const SELF_DOC = {
  type: 'mesh_node',
  hostname: 'node-self.mesh',
  vfs_path: 'system/mesh-nodes/node-self-mesh.md',
  title: 'Self',
  description: 'existing',
};

function lastEnvelope() {
  return vi.mocked(processViaPackageKernel).mock.calls.at(-1)[0];
}

/**
 * The variant describes the machine running this code, so the assertions have
 * to pin the platform — read from the host, the expected answer would flip
 * between a Linux server and the developer's Mac.
 */
const realPlatform = process.platform;
function pinPlatform(platform) {
  Object.defineProperty(process, 'platform', { value: platform, configurable: true });
}

describe('patchOwnMeshNode access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMeshStatusCache();
    vi.mocked(processViaPackageKernel).mockResolvedValue({ success: true });
    vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: JSON.stringify(STATUS) });
    vi.mocked(listVfsDocumentsUnder).mockReturnValue([]);
    pinPlatform('linux');
  });

  afterEach(() => pinPlatform(realPlatform));

  it('records which Tailscale build this node runs, and what that allows', async () => {
    vi.mocked(listVfsDocumentsUnder).mockReturnValue([SELF_DOC]);

    await patchOwnMeshNode();

    // Linux ships the client and daemon in one package, so it can serve SSH
    // even though the probe found no tailscaled at a macOS path.
    expect(lastEnvelope().patches.access).toMatchObject({
      tailscale_variant: 'daemon',
      mesh_ssh: 'available',
    });
  });

  // The case this whole module exists because of: a Mac on the sandboxed GUI
  // build looks identical to a capable node until you try to connect.
  it('records a sandboxed macOS build as unable to serve mesh SSH', async () => {
    pinPlatform('darwin');
    vi.mocked(listVfsDocumentsUnder).mockReturnValue([SELF_DOC]);

    await patchOwnMeshNode();

    expect(lastEnvelope().patches.access).toMatchObject({
      tailscale_variant: 'sandboxed',
      mesh_ssh: 'unsupported',
    });
  });

  it('keeps a recorded login account that the probe knows nothing about', async () => {
    vi.mocked(listVfsDocumentsUnder).mockReturnValue([
      { ...SELF_DOC, access: { ssh_user: 'operator', ssh_port: 2222, source: 'manual' } },
    ]);

    await patchOwnMeshNode();

    expect(lastEnvelope().patches.access).toMatchObject({
      ssh_user: 'operator',
      ssh_port: 2222,
      source: 'manual',
      mesh_ssh: 'available',
    });
  });

  it('writes a complete document for a node it has never seen', async () => {
    await patchOwnMeshNode();

    const { type, content } = lastEnvelope();
    expect(type).toBe('operation');
    expect(content).toContain('"tailscale_variant":"daemon"');
    // A duplicate YAML key is silently resolved last-one-wins, which leaves a
    // stale line sitting in plain sight contributing nothing.
    const keys = content
      .split('\n')
      .filter((line) => /^[a-z_]+:/.test(line))
      .map((line) => line.split(':')[0]);
    expect([...new Set(keys)]).toHaveLength(keys.length);
  });
});
