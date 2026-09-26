/**
 * Total Recall — Capability Deployment Upgrader
 *
 * Implements Phase 3 of CAPABILITY_DEPLOYMENT_PLUGINS:
 * - Structural-only migration between capability versions
 * - Preservation of tenant-private data and user customizations
 * - Rollback on interrupted or failing upgrade
 * - Truthful status and append-only event logging
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { createDeploymentPlan } from './plan.mjs';
import { applyDeploymentPlan, resolveAppVaultDir, formatSsssDocument } from './apply.mjs';
import { resolveCapabilitySource } from './source.mjs';

export class AppUpgradeError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'AppUpgradeError';
    this.details = details;
  }
}

/**
 * Reads the installed capability record from the target app vault.
 * @param {string} targetDir
 * @param {string} capabilityId
 * @returns {object|null}
 */
export function getInstalledCapabilityRecord(targetDir, capabilityId) {
  const vaultDir = resolveAppVaultDir(targetDir);
  const recordPath = path.join(vaultDir, 'system', 'capabilities', `${capabilityId}.md`);
  if (!fs.existsSync(recordPath)) return null;

  const content = fs.readFileSync(recordPath, 'utf8');
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) return null;

  const raw = frontmatterMatch[1];
  const record = {};
  for (const line of raw.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let val = line.slice(colonIdx + 1).trim();
    if (val.startsWith('"') && val.endsWith('"')) {
      val = val.slice(1, -1);
    } else if (val.startsWith('[') || val.startsWith('{')) {
      try {
        val = JSON.parse(val);
      } catch {}
    }
    record[key] = val;
  }
  return record;
}

/**
 * Upgrades an installed capability in an application to a new version or pinned hash.
 *
 * @param {string} capabilityId - ID of capability to upgrade
 * @param {object} options
 * @param {string} options.to - New source path, git ref, or pinned package
 * @param {string} [options.target] - Target app directory (default: cwd)
 * @param {string} [options.adapter] - Adapter override
 * @param {boolean} [options.dryRun] - Preflight only
 * @param {string} [options.actor] - SSSS actor
 * @returns {Promise<{
 *   success: boolean,
 *   capability_id: string,
 *   from_version: string,
 *   to_version: string,
 *   plan_hash: string,
 *   removed_files: string[],
 *   applied_files: number,
 *   dryRun?: boolean
 * }>}
 */
export async function upgradeCapability(capabilityId, options = {}) {
  const targetDir = options.target || process.cwd();
  const actor = options.actor || 'total-recall/app-deploy';

  if (!options.to) {
    throw new AppUpgradeError('Missing target source (--to) for upgrade');
  }

  // 1. Verify existing capability installation
  const existingRecord = getInstalledCapabilityRecord(targetDir, capabilityId);
  if (!existingRecord) {
    throw new AppUpgradeError(
      `Capability '${capabilityId}' is not installed in target application (${targetDir})`
    );
  }

  const fromVersion = existingRecord.version || 'unknown';
  const oldFiles = Array.isArray(existingRecord.files) ? existingRecord.files : [];

  // 2. Staged upgrade with rollback protection
  const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-upgrade-backup-'));
  const obsoleteBackups = [];
  const vaultDir = resolveAppVaultDir(targetDir);
  const capInstallDir = path.join(vaultDir, 'system', 'capabilities');
  const eventDir = path.join(vaultDir, 'system', 'events');
  let newPlan = null;

  try {
    newPlan = await createDeploymentPlan(options.to, {
      target: targetDir,
      adapter: options.adapter || existingRecord.adapter || 'ssss-app',
      pluginResolver: options.pluginResolver
    });

    if (!newPlan.valid) {
      throw new AppUpgradeError(
        `Cannot upgrade capability: new version produces ${newPlan.conflicts?.length || 0} conflict(s)`
      );
    }

    // Identify files from old version that no longer exist in new version
    const newFilePaths = new Set((newPlan.file_operations || []).map((op) => op.path));
    const obsoleteFiles = oldFiles.filter((f) => !newFilePaths.has(f.path));

    // If dry-run, return planned diff
    if (options.dryRun) {
      fs.rmSync(backupDir, { recursive: true, force: true });
      newPlan.cleanup?.();
      return {
        success: true,
        dryRun: true,
        capability_id: capabilityId,
        from_version: fromVersion,
        to_version: newPlan.capabilities[0]?.version || 'unknown',
        plan_hash: newPlan.plan_hash,
        removed_files: obsoleteFiles.map((f) => f.path),
        applied_files: newPlan.file_operations?.length || 0
      };
    }

    // Backup obsolete files before removing them
    for (const obs of obsoleteFiles) {
      const targetFilePath = path.join(targetDir, obs.path);
      if (fs.existsSync(targetFilePath)) {
        const backupPath = path.join(backupDir, obs.path);
        fs.mkdirSync(path.dirname(backupPath), { recursive: true });
        fs.copyFileSync(targetFilePath, backupPath);
        obsoleteBackups.push({ targetPath: targetFilePath, backupPath });
        // Remove obsolete capability file
        fs.rmSync(targetFilePath, { force: true });
      }
    }

    // Apply new version via applyDeploymentPlan
    const applyResult = await applyDeploymentPlan(newPlan, {
      target: targetDir,
      actor,
      force: true
    });

    // Record upgrade event envelope
    const toVersion = newPlan.capabilities[0]?.version || 'unknown';
    const upgradeEvent = {
      type: 'event',
      domain: 'ssss.capability',
      action: 'upgraded',
      timestamp: new Date().toISOString(),
      actor,
      target: targetDir,
      payload: {
        capability_id: capabilityId,
        from_version: fromVersion,
        to_version: toVersion,
        plan_hash: newPlan.plan_hash
      }
    };

    fs.mkdirSync(eventDir, { recursive: true });
    fs.appendFileSync(
      path.join(eventDir, 'capability-events.jsonl'),
      JSON.stringify(upgradeEvent) + '\n',
      'utf8'
    );

    // Clean up backup directory
    fs.rmSync(backupDir, { recursive: true, force: true });
    newPlan.cleanup?.();

    return {
      success: true,
      capability_id: capabilityId,
      from_version: fromVersion,
      to_version: toVersion,
      plan_hash: newPlan.plan_hash,
      removed_files: obsoleteFiles.map((f) => f.path),
      applied_files: applyResult.applied_files
    };
  } catch (err) {
    // Rollback obsolete files that were removed
    for (const b of obsoleteBackups) {
      try {
        if (fs.existsSync(b.backupPath)) {
          fs.mkdirSync(path.dirname(b.targetPath), { recursive: true });
          fs.copyFileSync(b.backupPath, b.targetPath);
        }
      } catch {}
    }

    // Record truthful failure status
    try {
      if (fs.existsSync(capInstallDir)) {
        const failedRecord = {
          ...existingRecord,
          status: 'upgrade_failed',
          updated_at: new Date().toISOString(),
          error: err.message
        };
        const failedMd = formatSsssDocument(
          failedRecord,
          `# Upgrade Failed\n\nAttempt to upgrade to version from '${options.to}' failed: ${err.message}\n`
        );
        fs.writeFileSync(path.join(capInstallDir, `${capabilityId}.md`), failedMd, 'utf8');
      }

      const failEvent = {
        type: 'event',
        domain: 'ssss.capability',
        action: 'upgrade_failed',
        timestamp: new Date().toISOString(),
        actor,
        target: targetDir,
        payload: {
          capability_id: capabilityId,
          from_version: fromVersion,
          error: err.message
        }
      };
      fs.appendFileSync(
        path.join(eventDir, 'capability-events.jsonl'),
        JSON.stringify(failEvent) + '\n',
        'utf8'
      );
    } catch {}

    try {
      if (fs.existsSync(backupDir)) fs.rmSync(backupDir, { recursive: true, force: true });
      newPlan.cleanup?.();
    } catch {}

    throw new AppUpgradeError(`Capability upgrade failed: ${err.message}`, {
      capability_id: capabilityId,
      originalError: err
    });
  }
}
