import fs from 'fs';
import path from 'path';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import { brainDir } from './config.mjs';
import { logger } from './logger.mjs';

/**
 * SSSS Snapshot & Rollback
 *
 * Implements local VFS snapshotting for the Total Recall OS.
 * Since the memory-vault is excluded from git, we use fast local
 * tarballs to provide point-in-time recovery for the vault.
 */

export function getSnapshotsDir() {
  const snapshotsDir = path.join(brainDir, '.snapshots');
  if (!fs.existsSync(snapshotsDir)) {
    fs.mkdirSync(snapshotsDir, { recursive: true });
  }
  return snapshotsDir;
}

/**
 * Create a point-in-time snapshot of a memory vault.
 *
 * `vaultDir` is explicit because this used to always snapshot the global brain
 * vault no matter which vault the caller was about to modify — so a migration
 * against a project vault took its safety snapshot of an unrelated vault and
 * the thing being changed had no backup at all.
 *
 * @param {string} reason - The reason for the snapshot (e.g. 'pre-dream', 'manual')
 * @param {string} [vaultDir] - Vault to snapshot; defaults to the global brain vault
 * @returns {{ success: boolean, snapshot_id: string, path: string, error?: string }}
 */
export function createSnapshot(reason = 'manual', vaultDir = path.join(brainDir, 'memory-vault')) {
  try {
    const snapshotsDir = getSnapshotsDir();

    if (!fs.existsSync(vaultDir)) {
      return { success: false, error: 'Vault directory does not exist.' };
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const shortId = crypto.randomBytes(3).toString('hex');
    const snapshotId = `${timestamp}-${shortId}`;
    const snapshotName = `vault-${snapshotId}.tar.gz`;
    const destPath = path.join(snapshotsDir, snapshotName);

    // Create the snapshot metadata
    const metaPath = path.join(snapshotsDir, `vault-${snapshotId}.json`);
    const metadata = {
      snapshot_id: snapshotId,
      created_at: new Date().toISOString(),
      reason,
      vault_dir: vaultDir,
    };
    fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2));

    // Tar the vault
    // We use tar -C so the archive contains paths relative to memory-vault
    const result = spawnSync('tar', ['-czf', destPath, '-C', vaultDir, '.'], { stdio: 'pipe' });
    if (result.status !== 0) {
      fs.unlinkSync(metaPath);
      throw new Error(`tar failed: ${result.stderr.toString()}`);
    }

    logger.info('snapshot', `Created snapshot ${snapshotId} (${reason})`);
    return { success: true, snapshot_id: snapshotId, path: destPath };
  } catch (err) {
    logger.error('snapshot', `Failed to create snapshot: ${err.message}`);
    return { success: false, error: err.message };
  }
}

/**
 * List all available snapshots, sorted newest first.
 */
export function listSnapshots() {
  const snapshotsDir = getSnapshotsDir();
  const files = fs.readdirSync(snapshotsDir);
  const snapshots = [];

  for (const file of files) {
    if (file.endsWith('.json')) {
      try {
        const meta = JSON.parse(fs.readFileSync(path.join(snapshotsDir, file), 'utf8'));
        const tarball = file.replace('.json', '.tar.gz');
        if (fs.existsSync(path.join(snapshotsDir, tarball))) {
          snapshots.push({ ...meta, file: tarball });
        }
      } catch { /* Ignore corrupted meta */ }
    }
  }

  return snapshots.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

/**
 * Rollback a memory vault to a specific snapshot.
 *
 * Restores into the vault the snapshot was actually taken from, recorded in its
 * metadata. This used to always restore into the global brain vault, so rolling
 * back a project snapshot would have deleted the global vault and unpacked
 * another project's nodes over it — destroying good data while leaving the
 * vault in trouble untouched. Snapshots predating the recorded field came from
 * the global vault, which is the fallback.
 *
 * @param {string} snapshotId - The ID of the snapshot to restore.
 * @returns {{ success: boolean, error?: string }}
 */
export function rollbackVault(snapshotId) {
  try {
    const snapshotsDir = getSnapshotsDir();

    const tarball = path.join(snapshotsDir, `vault-${snapshotId}.tar.gz`);
    if (!fs.existsSync(tarball)) {
      return { success: false, error: `Snapshot ${snapshotId} not found.` };
    }

    let vaultDir = path.join(brainDir, 'memory-vault');
    const metaPath = path.join(snapshotsDir, `vault-${snapshotId}.json`);
    if (fs.existsSync(metaPath)) {
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        if (meta.vault_dir) vaultDir = meta.vault_dir;
      } catch (err) {
        return { success: false, error: `Snapshot ${snapshotId} metadata is unreadable: ${err.message}` };
      }
    }

    // Safety measure: back up the CURRENT state of that same vault first
    const preRollback = createSnapshot(`pre-rollback-to-${snapshotId}`, vaultDir);
    if (!preRollback.success) {
      return { success: false, error: `Failed to create pre-rollback safety snapshot: ${preRollback.error}` };
    }

    // Purge current vault
    if (fs.existsSync(vaultDir)) {
      fs.rmSync(vaultDir, { recursive: true, force: true });
    }
    fs.mkdirSync(vaultDir, { recursive: true });

    // Restore from tarball
    const result = spawnSync('tar', ['-xzf', tarball, '-C', vaultDir], { stdio: 'pipe' });
    if (result.status !== 0) {
      throw new Error(`tar extraction failed: ${result.stderr.toString()}`);
    }

    logger.info('snapshot', `Rolled back ${vaultDir} to snapshot ${snapshotId}`);
    return { success: true, vault_dir: vaultDir };
  } catch (err) {
    logger.error('snapshot', `Rollback failed: ${err.message}`);
    return { success: false, error: err.message };
  }
}
