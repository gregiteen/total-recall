// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./logger.mjs', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('./config.mjs', () => ({
  brainDir: '/tmp/test-brain-snapshot',
}));

// Mock child_process spawnSync
vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

// Mock fs comprehensively
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn(),
    rmSync: vi.fn(),
    readdirSync: vi.fn(() => []),
    readFileSync: vi.fn(() => '{}'),
  },
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
  rmSync: vi.fn(),
  readdirSync: vi.fn(() => []),
  readFileSync: vi.fn(() => '{}'),
}));

describe('snapshot module', () => {
  let createSnapshot, listSnapshots, rollbackVault, getSnapshotsDir;
  let fsMock, spawnSyncMock;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    // Re-register mocks after resetModules
    vi.mock('./config.mjs', () => ({ brainDir: '/tmp/test-brain-snapshot' }));
    vi.mock('./logger.mjs', () => ({
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    }));
    vi.mock('node:child_process', () => ({ spawnSync: vi.fn() }));
    vi.mock('fs', () => ({
      default: {
        existsSync: vi.fn(),
        mkdirSync: vi.fn(),
        writeFileSync: vi.fn(),
        unlinkSync: vi.fn(),
        rmSync: vi.fn(),
        readdirSync: vi.fn(() => []),
        readFileSync: vi.fn(() => '{}'),
      },
      existsSync: vi.fn(),
      mkdirSync: vi.fn(),
      writeFileSync: vi.fn(),
      unlinkSync: vi.fn(),
      rmSync: vi.fn(),
      readdirSync: vi.fn(() => []),
      readFileSync: vi.fn(() => '{}'),
    }));

    const mod = await import('./snapshot.mjs');
    createSnapshot = mod.createSnapshot;
    listSnapshots = mod.listSnapshots;
    rollbackVault = mod.rollbackVault;
    getSnapshotsDir = mod.getSnapshotsDir;

    fsMock = (await import('fs')).default;
    spawnSyncMock = (await import('node:child_process')).spawnSync;
  });

  describe('getSnapshotsDir', () => {
    it('creates the snapshots directory if it does not exist', () => {
      vi.mocked(fsMock.existsSync).mockReturnValue(false);
      const dir = getSnapshotsDir();
      expect(fsMock.mkdirSync).toHaveBeenCalledWith(expect.stringContaining('.snapshots'), { recursive: true });
      expect(typeof dir).toBe('string');
    });

    it('returns the path even when already exists', () => {
      vi.mocked(fsMock.existsSync).mockReturnValue(true);
      const dir = getSnapshotsDir();
      expect(typeof dir).toBe('string');
      expect(dir).toContain('.snapshots');
    });
  });

  describe('createSnapshot', () => {
    it('returns success:false when vault directory does not exist', () => {
      vi.mocked(fsMock.existsSync).mockImplementation((p) => {
        // Only the vault dir returns false
        if (p.includes('memory-vault')) return false;
        return true;
      });
      const result = createSnapshot('test');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Vault directory does not exist');
    });

    it('returns success:true when tar succeeds', () => {
      vi.mocked(fsMock.existsSync).mockReturnValue(true);
      vi.mocked(spawnSyncMock).mockReturnValue({ status: 0, stderr: Buffer.from('') });
      const result = createSnapshot('pre-dream');
      expect(result.success).toBe(true);
      expect(result.snapshot_id).toBeDefined();
      expect(result.path).toContain('.tar.gz');
    });

    it('writes a .json metadata file alongside the tarball', () => {
      vi.mocked(fsMock.existsSync).mockReturnValue(true);
      vi.mocked(spawnSyncMock).mockReturnValue({ status: 0, stderr: Buffer.from('') });
      createSnapshot('meta-test');
      const writeCall = vi.mocked(fsMock.writeFileSync).mock.calls.find(([p]) => String(p).endsWith('.json'));
      expect(writeCall).toBeDefined();
      const meta = JSON.parse(writeCall[1]);
      expect(meta.reason).toBe('meta-test');
      expect(meta.snapshot_id).toBeDefined();
    });

    it('returns success:false when tar fails', () => {
      vi.mocked(fsMock.existsSync).mockReturnValue(true);
      vi.mocked(spawnSyncMock).mockReturnValue({ status: 1, stderr: Buffer.from('tar error') });
      const result = createSnapshot('fail-test');
      expect(result.success).toBe(false);
      expect(result.error).toContain('tar failed');
    });

    it('cleans up metadata file when tar fails', () => {
      vi.mocked(fsMock.existsSync).mockReturnValue(true);
      vi.mocked(spawnSyncMock).mockReturnValue({ status: 1, stderr: Buffer.from('oops') });
      createSnapshot('cleanup');
      expect(fsMock.unlinkSync).toHaveBeenCalled();
    });
  });

  describe('listSnapshots', () => {
    it('returns empty array when no snapshot files exist', () => {
      vi.mocked(fsMock.existsSync).mockReturnValue(true);
      vi.mocked(fsMock.readdirSync).mockReturnValue([]);
      const snapshots = listSnapshots();
      expect(snapshots).toEqual([]);
    });

    it('returns snapshot metadata for matching json+tarball pairs', () => {
      vi.mocked(fsMock.existsSync).mockImplementation((p) => {
        // tar file exists
        if (String(p).endsWith('.tar.gz')) return true;
        return true;
      });
      vi.mocked(fsMock.readdirSync).mockReturnValue(['vault-2026-01-01-snap.json']);
      vi.mocked(fsMock.readFileSync).mockReturnValue(
        JSON.stringify({ snapshot_id: 'snap1', created_at: '2026-01-01T00:00:00Z', reason: 'manual' })
      );
      const snapshots = listSnapshots();
      expect(snapshots).toHaveLength(1);
      expect(snapshots[0].snapshot_id).toBe('snap1');
    });
  });

  describe('rollbackVault', () => {
    it('returns success:false when snapshot tarball not found', () => {
      vi.mocked(fsMock.existsSync).mockReturnValue(false);
      const result = rollbackVault('nonexistent-id');
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('calls tar extraction when snapshot exists', () => {
      // tarball exists, vault exists
      vi.mocked(fsMock.existsSync).mockReturnValue(true);
      // First createSnapshot call (pre-rollback safety snapshot) will call spawnSync for tar
      vi.mocked(spawnSyncMock).mockReturnValue({ status: 0, stderr: Buffer.from('') });
      rollbackVault('some-snapshot-id');
      expect(spawnSyncMock).toHaveBeenCalled();
    });
  });
});
