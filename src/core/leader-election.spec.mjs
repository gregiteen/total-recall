import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  FAILOVER_BOUND_MS,
  getLeaderInfo,
  isLeader,
  leaderPin,
  renewLease,
  releaseLease,
  tryAcquireLease,
} from './leader-election.mjs';
import { getMeshPeers, getMeshSelf, normalizeHostname } from './mesh.mjs';

vi.mock('./mesh.mjs', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getMeshPeers: vi.fn(),
    getMeshSelf: vi.fn(),
  };
});

// leader-election.mjs resolves the operator pin from <brainDir>/config/leader.json.
// Point brainDir at a deterministic temp fixture so these tests never read the
// developer's real pin file, which would make them machine-dependent.
const PIN_BRAIN_DIR = path.join(os.tmpdir(), 'tr-leader-pin-fixture');

vi.mock('./config.mjs', async () => {
  const pathp = await import('node:path');
  const osp = await import('node:os');
  return { brainDir: pathp.join(osp.tmpdir(), 'tr-leader-pin-fixture') };
});

/** Neutral fixture names — not tied to any user's real hostnames. */
const NODE_A = { hostname: 'node-a.mesh', ip: '100.64.0.1', online: true };
const NODE_B = { hostname: 'node-b.mesh', ip: '100.64.0.2', online: true };
const NODE_C = { hostname: 'node-c.mesh', ip: '100.64.0.3', online: true };
const NODE_OFFLINE = { hostname: 'node-offline.mesh', ip: '100.64.0.0', online: false };

describe('deterministic leader election', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.TR_LEADER_IP;
  });

  it('selects the lowest online mesh IP', async () => {
    vi.mocked(getMeshPeers).mockReturnValue([NODE_C, NODE_A, NODE_OFFLINE]);
    expect(await getLeaderInfo()).toEqual({
      hostname: NODE_A.hostname,
      ip: NODE_A.ip,
      strategy: 'lowest-mesh-ip',
    });
  });

  it('excludes offline nodes even when they have the lowest IP', async () => {
    vi.mocked(getMeshPeers).mockReturnValue([
      { ...NODE_A, online: false },
      NODE_B,
      { hostname: 'node-d.mesh', ip: '100.64.0.5', online: true },
    ]);
    expect(await getLeaderInfo()).toEqual({
      hostname: NODE_B.hostname,
      ip: NODE_B.ip,
      strategy: 'lowest-mesh-ip',
    });
  });

  it('returns null when no online nodes exist', async () => {
    vi.mocked(getMeshPeers).mockReturnValue([{ ...NODE_A, online: false }]);
    expect(await getLeaderInfo()).toBeNull();
  });

  it('uses hostname as tie-break when IPs are equal (defensive)', async () => {
    vi.mocked(getMeshPeers).mockReturnValue([
      { hostname: 'zeta.mesh', ip: '100.64.0.1', online: true },
      { hostname: 'alpha.mesh', ip: '100.64.0.1', online: true },
    ]);
    expect(await getLeaderInfo()).toEqual({
      hostname: 'alpha.mesh',
      ip: '100.64.0.1',
      strategy: 'lowest-mesh-ip',
    });
  });

  it('reports leadership by IP (hostname form need not match exactly)', async () => {
    // Short local name vs MagicDNS FQDN — IP is the election key.
    vi.mocked(getMeshSelf).mockReturnValue({ hostname: 'node-a', ip: NODE_A.ip });
    vi.mocked(getMeshPeers).mockReturnValue([
      { hostname: 'node-a.example.ts.net', ip: NODE_A.ip, online: true },
      NODE_C,
    ]);
    expect(await isLeader()).toBe(true);
  });

  it('is not leader when a lower online IP exists', async () => {
    vi.mocked(getMeshSelf).mockReturnValue({ hostname: NODE_C.hostname, ip: NODE_C.ip });
    vi.mocked(getMeshPeers).mockReturnValue([NODE_A, NODE_C]);
    expect(await isLeader()).toBe(false);
  });

  it('lease shims re-evaluate isLeader without writing state', async () => {
    vi.mocked(getMeshSelf).mockReturnValue({ hostname: NODE_A.hostname, ip: NODE_A.ip });
    vi.mocked(getMeshPeers).mockReturnValue([NODE_A]);
    expect(await tryAcquireLease()).toBe(true);
    expect(await renewLease()).toBe(true);
    expect(await releaseLease()).toBe(true);
  });

  it('documents failover bound as 12s (cache 2s + tick 10s)', () => {
    expect(FAILOVER_BOUND_MS).toBe(12_000);
  });
});

describe('TR_LEADER_IP operator pin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.TR_LEADER_IP;
    // No pin file here: these cases are about the env var, and the blank-env
    // case must not fall through to a leftover file from another test.
    fs.rmSync(PIN_BRAIN_DIR, { recursive: true, force: true });
  });

  it('is ignored when unset — lowest online IP still wins', async () => {
    expect(leaderPin()).toBeNull();
    vi.mocked(getMeshPeers).mockReturnValue([NODE_A, NODE_B, NODE_C]);
    expect(await getLeaderInfo()).toEqual({
      hostname: NODE_A.hostname,
      ip: NODE_A.ip,
      strategy: 'lowest-mesh-ip',
    });
  });

  it('elects the pinned node even when a LOWER online IP exists', async () => {
    // The real case: the shared droplet holds the lowest IP but runs no Total
    // Recall, so it must not lead.
    process.env.TR_LEADER_IP = NODE_C.ip;
    vi.mocked(getMeshPeers).mockReturnValue([NODE_A, NODE_B, NODE_C]);
    expect(await getLeaderInfo()).toEqual({
      hostname: NODE_C.hostname,
      ip: NODE_C.ip,
      strategy: 'pinned-mesh-ip',
    });
  });

  it('makes the pinned node the leader and every lower node a follower', async () => {
    process.env.TR_LEADER_IP = NODE_C.ip;
    vi.mocked(getMeshPeers).mockReturnValue([NODE_A, NODE_C]);

    vi.mocked(getMeshSelf).mockReturnValue({ hostname: NODE_C.hostname, ip: NODE_C.ip });
    expect(await isLeader()).toBe(true);

    vi.mocked(getMeshSelf).mockReturnValue({ hostname: NODE_B.hostname, ip: NODE_B.ip });
    expect(await isLeader()).toBe(false);
  });

  it('fails closed (no leader) while the pinned node is offline', async () => {
    process.env.TR_LEADER_IP = NODE_A.ip;
    vi.mocked(getMeshPeers).mockReturnValue([{ ...NODE_A, online: false }, NODE_B, NODE_C]);
    expect(await getLeaderInfo()).toBeNull();

    // Nobody leads — a follower must not promote itself just because the pinned
    // brain host is away; that is how two nodes start serving secrets at once.
    vi.mocked(getMeshSelf).mockReturnValue({ hostname: NODE_B.hostname, ip: NODE_B.ip });
    expect(await isLeader()).toBe(false);
  });

  it('treats a blank or whitespace pin as unset', () => {
    process.env.TR_LEADER_IP = '   ';
    expect(leaderPin()).toBeNull();
  });
});

describe('leader pin config fallback (bare-shell daemon)', () => {
  const pinFile = () => path.join(PIN_BRAIN_DIR, 'config', 'leader.json');
  const writePin = (contents) => {
    fs.mkdirSync(path.dirname(pinFile()), { recursive: true });
    fs.writeFileSync(pinFile(), contents);
  };

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.TR_LEADER_IP;
    fs.rmSync(PIN_BRAIN_DIR, { recursive: true, force: true });
  });

  afterEach(() => {
    fs.rmSync(PIN_BRAIN_DIR, { recursive: true, force: true });
  });

  it('reads the pin from config/leader.json when TR_LEADER_IP is absent', () => {
    writePin(JSON.stringify({ leaderIp: NODE_C.ip }));
    expect(leaderPin()).toBe(NODE_C.ip);
  });

  it('elects the pinned node rather than the lowest IP with no env var set', async () => {
    writePin(JSON.stringify({ leaderIp: NODE_C.ip }));
    vi.mocked(getMeshPeers).mockReturnValue([NODE_A, NODE_B, NODE_C]);

    // Without the file fallback this returned NODE_A — the lowest IP, which on
    // the real mesh is the droplet that runs no Total Recall. The daemon then
    // started as a follower, skipped the task loop, and reported itself healthy
    // while doing nothing.
    expect(await getLeaderInfo()).toEqual({
      hostname: NODE_C.hostname,
      ip: NODE_C.ip,
      strategy: 'pinned-mesh-ip',
    });
  });

  it('prefers TR_LEADER_IP over the file', () => {
    writePin(JSON.stringify({ leaderIp: NODE_A.ip }));
    process.env.TR_LEADER_IP = NODE_C.ip;
    expect(leaderPin()).toBe(NODE_C.ip);
  });

  it('ignores a malformed, blank, empty or missing pin file', () => {
    writePin('{ not json');
    expect(leaderPin()).toBeNull();

    writePin(JSON.stringify({ leaderIp: '   ' }));
    expect(leaderPin()).toBeNull();

    writePin(JSON.stringify({}));
    expect(leaderPin()).toBeNull();

    fs.rmSync(PIN_BRAIN_DIR, { recursive: true, force: true });
    expect(leaderPin()).toBeNull();
  });
});

describe('normalizeHostname (MagicDNS trailing-dot)', () => {
  it('strips a single trailing dot', () => {
    expect(normalizeHostname('node.example.ts.net.')).toBe('node.example.ts.net');
  });

  it('leaves undotted names unchanged', () => {
    expect(normalizeHostname('node.mesh')).toBe('node.mesh');
  });

  it('returns null for empty input', () => {
    expect(normalizeHostname(null)).toBeNull();
    expect(normalizeHostname('')).toBeNull();
  });
});
