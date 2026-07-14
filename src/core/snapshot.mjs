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
 * Create a point-in-time snapshot of the memory vault.
 *
 * @param {string} reason - The reason for the snapshot (e.g. 'pre-dream', 'manual')
 * @returns {{ success: boolean, snapshot_id: string, path: string, error?: string }}
 */
export function createSnapshot(reason = 'manual') {
  try {
    const vaultDir = path.join(brainDir, 'memory-vault');
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
 * Rollback the memory vault to a specific snapshot.
 *
 * @param {string} snapshotId - The ID of the snapshot to restore.
 * @returns {{ success: boolean, error?: string }}
 */
export function rollbackVault(snapshotId) {
  try {
    const vaultDir = path.join(brainDir, 'memory-vault');
    const snapshotsDir = getSnapshotsDir();

    const tarball = path.join(snapshotsDir, `vault-${snapshotId}.tar.gz`);
    if (!fs.existsSync(tarball)) {
      return { success: false, error: `Snapshot ${snapshotId} not found.` };
    }

    // Safety measure: take a backup of the CURRENT state before destroying it
    const preRollback = createSnapshot(`pre-rollback-to-${snapshotId}`);
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

    logger.info('snapshot', `Rolled back to snapshot ${snapshotId}`);
    return { success: true };
  } catch (err) {
    logger.error('snapshot', `Rollback failed: ${err.message}`);
    return { success: false, error: err.message };
  }
}
