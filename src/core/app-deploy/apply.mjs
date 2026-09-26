/**
 * Total Recall — Capability Deployment Applier
 *
 * Implements Phase 3 of CAPABILITY_DEPLOYMENT_PLUGINS:
 * - Preflight validation and hash verification
 * - Staged atomic file application with backup journaling
 * - Rollback on failure with preservation of tenant-private data
 * - Truthful installation status and repair records
 * - SSSS event envelopes and access-grant persistence
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { createDeploymentPlan } from './plan.mjs';
import { resolveCapabilitySource } from './source.mjs';
import {
  AppCapabilityInstallationSchema,
  AccessGrantSchema
} from '../schema.mjs';

export class AppApplyPreflightError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'AppApplyPreflightError';
    this.details = details;
  }
}

export class AppApplyError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'AppApplyError';
    this.details = details;
  }
}

/**
 * Resolves the app vault directory location.
 * Prefers standard SSSS app paths:
 * 1. `<appDir>/vault`
 * 2. `<appDir>/.agent/skills/total-recall/memory-vault`
 * 3. `<appDir>/memory-vault`
 * Defaults to `<appDir>/vault` if none exist yet.
 */
export function resolveAppVaultDir(appDir) {
  const candidates = [
    path.join(appDir, 'vault'),
    path.join(appDir, '.agent', 'skills', 'total-recall', 'memory-vault'),
    path.join(appDir, 'memory-vault')
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return path.join(appDir, 'vault');
}

/**
 * Serializes SSSS document frontmatter and markdown body into valid markdown.
 */
export function formatSsssDocument(frontmatter, body = '') {
  const lines = ['---'];
  for (const [key, value] of Object.entries(frontmatter)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value) || (typeof value === 'object' && !(value instanceof Date))) {
      lines.push(`${key}: ${JSON.stringify(value)}`);
    } else if (typeof value === 'string') {
      lines.push(`${key}: ${JSON.stringify(value)}`);
    } else {
      lines.push(`${key}: ${value}`);
    }
  }
  lines.push('---');
  lines.push('');
  if (body) {
    lines.push(body);
  }
  return lines.join('\n');
}

/**
 * Applies a deployment plan to an existing target application.
 *
 * @param {object|string} planOrSource - Precomputed plan object or source path/spec
 * @param {object} [options]
 * @param {string} [options.target] - Target application directory override
 * @param {string} [options.adapter] - Adapter override
 * @param {string} [options.actor] - SSSS actor identity (default: 'total-recall/app-deploy')
 * @param {boolean} [options.dryRun] - Preflight and stage only, do not mutate target app
 * @param {boolean} [options.force] - Bypass identical check
 * @returns {Promise<{
 *   success: boolean,
 *   plan_hash: string,
 *   capabilities: string[],
 *   applied_files: number,
 *   installed_at: string,
 *   dryRun?: boolean,
 *   already_applied?: boolean
 * }>}
 */
export async function applyDeploymentPlan(planOrSource, options = {}) {
  let plan = planOrSource;
  let shouldCleanupPlan = false;

  // 1. Resolve source to plan if string passed
  if (typeof planOrSource === 'string') {
    plan = await createDeploymentPlan(planOrSource, options);
    shouldCleanupPlan = true;
  }

  if (!plan || typeof plan !== 'object') {
    throw new AppApplyPreflightError('Invalid deployment plan provided');
  }

  // 2. Preflight validation
  if (!plan.valid || (plan.conflicts && plan.conflicts.length > 0)) {
    throw new AppApplyPreflightError(
      `Cannot apply invalid deployment plan: contains ${plan.conflicts?.length || 0} conflict(s)`
    );
  }

  const targetDir = options.target || plan.target_app?.dir || process.cwd();
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const actor = options.actor || 'total-recall/app-deploy';
  const vaultDir = resolveAppVaultDir(targetDir);
  const capInstallDir = path.join(vaultDir, 'system', 'capabilities');
  const grantDir = path.join(vaultDir, 'system', 'grants');
  const eventDir = path.join(vaultDir, 'system', 'events');

  // Check idempotency: if all file operations are 'identical' and install records exist
  const nonIdenticalOps = (plan.file_operations || []).filter((op) => op.action !== 'identical');
  let allRecordsMatch = true;
  for (const cap of plan.capabilities || []) {
    const recordFile = path.join(capInstallDir, `${cap.id}.md`);
    if (!fs.existsSync(recordFile)) {
      allRecordsMatch = false;
      break;
    }
  }

  if (nonIdenticalOps.length === 0 && allRecordsMatch && !options.force) {
    if (shouldCleanupPlan && plan.cleanup) plan.cleanup();
    return {
      success: true,
      already_applied: true,
      plan_hash: plan.plan_hash,
      capabilities: (plan.capabilities || []).map((c) => c.id),
      applied_files: 0,
      installed_at: new Date().toISOString()
    };
  }

  // 3. Prepare staged files
  const stageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-apply-stage-'));
  const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-apply-backup-'));
  const backups = [];
  const stagedSourceDirs = plan._stagedSources || {};

  try {
    for (const op of plan.file_operations || []) {
      if (op.action === 'identical') continue;

      let sourceFilePath = null;
      const pluginStagedDir = stagedSourceDirs[op.plugin_id];
      if (pluginStagedDir && fs.existsSync(path.join(pluginStagedDir, op.path))) {
        sourceFilePath = path.join(pluginStagedDir, op.path);
      } else {
        // Fallback: resolve capability source
        const resolved = await resolveCapabilitySource(op.plugin_id, { projectRoot: targetDir });
        sourceFilePath = path.join(resolved.stagedDir, op.path);
      }

      if (!sourceFilePath || !fs.existsSync(sourceFilePath)) {
        throw new AppApplyPreflightError(
          `Missing source file for operation '${op.path}' in plugin '${op.plugin_id}'`
        );
      }

      const fileData = fs.readFileSync(sourceFilePath);
      const computedSha = crypto.createHash('sha256').update(fileData).digest('hex');
      if (computedSha !== op.source_sha256) {
        throw new AppApplyPreflightError(
          `Integrity error: source file '${op.path}' sha256 mismatch (expected ${op.source_sha256}, got ${computedSha})`
        );
      }

      const stagedDest = path.join(stageDir, op.path);
      fs.mkdirSync(path.dirname(stagedDest), { recursive: true });
      fs.writeFileSync(stagedDest, fileData);
    }

    // Dry-run returns here safely before touching target app
    if (options.dryRun) {
      fs.rmSync(stageDir, { recursive: true, force: true });
      fs.rmSync(backupDir, { recursive: true, force: true });
      if (shouldCleanupPlan && plan.cleanup) plan.cleanup();
      return {
        success: true,
        dryRun: true,
        plan_hash: plan.plan_hash,
        capabilities: (plan.capabilities || []).map((c) => c.id),
        operations: plan.file_operations?.length || 0
      };
    }

    // 4. Atomic application with backup journaling
    for (const op of plan.file_operations || []) {
      if (op.action === 'identical') continue;

      const targetPath = path.join(targetDir, op.path);
      if (fs.existsSync(targetPath)) {
        const backupPath = path.join(backupDir, op.path);
        fs.mkdirSync(path.dirname(backupPath), { recursive: true });
        fs.copyFileSync(targetPath, backupPath);
        backups.push({ targetPath, backupPath, isNew: false });
      } else {
        backups.push({ targetPath, isNew: true });
      }

      const stagedFile = path.join(stageDir, op.path);
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.copyFileSync(stagedFile, targetPath);
    }

    // 5. App-owned SSSS Installation records
    fs.mkdirSync(capInstallDir, { recursive: true });
    fs.mkdirSync(grantDir, { recursive: true });
    fs.mkdirSync(eventDir, { recursive: true });

    const now = new Date().toISOString();

    for (const cap of plan.capabilities || []) {
      const capFiles = (plan.file_operations || [])
        .filter((o) => o.plugin_id === cap.id)
        .map((o) => ({
          path: o.path,
          sha256: o.source_sha256,
          size: o.size
        }));

      const recordFrontmatter = {
        type: 'app_capability_installation',
        title: `Installed Capability: ${cap.id}`,
        description: `Capability ${cap.id} v${cap.version} deployed into application`,
        timestamp: now,
        capability_id: cap.id,
        version: cap.version,
        source_sha256: cap.source_sha256,
        adapter: plan.adapter,
        status: 'installed',
        access_grants: plan.access_grants || [],
        resources: plan.resources || {},
        files: capFiles,
        plan_hash: plan.plan_hash,
        installed_at: now,
        updated_at: now
      };

      // Validate against SSSS schema
      AppCapabilityInstallationSchema.parse(recordFrontmatter);

      const recordMarkdown = formatSsssDocument(
        recordFrontmatter,
        `# Capability: ${cap.id}\n\nInstalled v${cap.version} with plan hash \`${plan.plan_hash}\`.\n`
      );

      const recordFile = path.join(capInstallDir, `${cap.id}.md`);
      fs.writeFileSync(recordFile, recordMarkdown, 'utf8');
    }

    // 6. Access grant records
    if (plan.access_grants && plan.access_grants.length > 0) {
      for (const cap of plan.capabilities || []) {
        const grantFrontmatter = {
          type: 'access_grant',
          title: `Access Grant: ${cap.id}`,
          description: `Access grants for capability ${cap.id}`,
          timestamp: now,
          grantee: cap.id,
          grantee_type: 'capability',
          scopes: plan.access_grants,
          resources: Object.keys(plan.resources || {}),
          status: 'active',
          granted_at: now,
          granted_by: actor
        };

        AccessGrantSchema.parse(grantFrontmatter);

        const grantMarkdown = formatSsssDocument(
          grantFrontmatter,
          `# Access Grant for ${cap.id}\n\nGranted by \`${actor}\` at ${now}.\n`
        );
        fs.writeFileSync(path.join(grantDir, `${cap.id}.md`), grantMarkdown, 'utf8');
      }
    }

    // 7. Append-only SSSS event log
    const eventLogFile = path.join(eventDir, 'capability-events.jsonl');
    const eventLines = (plan.ssss_envelopes || []).map((env) => JSON.stringify(env)).join('\n') + '\n';
    fs.appendFileSync(eventLogFile, eventLines, 'utf8');

    // Clean up temporary staging and backup directories
    fs.rmSync(stageDir, { recursive: true, force: true });
    fs.rmSync(backupDir, { recursive: true, force: true });
    if (shouldCleanupPlan && plan.cleanup) plan.cleanup();

    return {
      success: true,
      plan_hash: plan.plan_hash,
      capabilities: (plan.capabilities || []).map((c) => c.id),
      applied_files: nonIdenticalOps.length,
      installed_at: now
    };
  } catch (err) {
    // 8. Rollback: restore previous files, delete created files
    for (const b of [...backups].reverse()) {
      try {
        if (b.isNew) {
          if (fs.existsSync(b.targetPath)) {
            fs.rmSync(b.targetPath, { force: true });
          }
        } else if (b.backupPath && fs.existsSync(b.backupPath)) {
          fs.copyFileSync(b.backupPath, b.targetPath);
        }
      } catch {}
    }

    // Write repair status to vault so the failure is truthful
    try {
      fs.mkdirSync(capInstallDir, { recursive: true });
      fs.mkdirSync(eventDir, { recursive: true });
      for (const cap of plan.capabilities || []) {
        const failedRecord = {
          type: 'app_capability_installation',
          title: `Failed Capability: ${cap.id}`,
          description: `Capability ${cap.id} v${cap.version} installation failed`,
          timestamp: new Date().toISOString(),
          capability_id: cap.id,
          version: cap.version,
          source_sha256: cap.source_sha256,
          adapter: plan.adapter || 'unknown',
          status: 'failed',
          access_grants: plan.access_grants || [],
          resources: {},
          files: [],
          plan_hash: plan.plan_hash,
          installed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          error: err.message
        };
        const failedMd = formatSsssDocument(failedRecord, `# Installation Failed\n\nError: ${err.message}\n`);
        fs.writeFileSync(path.join(capInstallDir, `${cap.id}.md`), failedMd, 'utf8');
      }

      const failEvent = {
        type: 'event',
        domain: 'ssss.capability',
        action: 'install_failed',
        timestamp: new Date().toISOString(),
        actor,
        target: targetDir,
        payload: {
          error: err.message
        }
      };
      fs.appendFileSync(path.join(eventDir, 'capability-events.jsonl'), JSON.stringify(failEvent) + '\n', 'utf8');
    } catch {}

    // Cleanup temp dirs
    try {
      if (fs.existsSync(stageDir)) fs.rmSync(stageDir, { recursive: true, force: true });
      if (fs.existsSync(backupDir)) fs.rmSync(backupDir, { recursive: true, force: true });
      if (shouldCleanupPlan && plan.cleanup) plan.cleanup();
    } catch {}

    throw new AppApplyError(`Failed to apply capability deployment: ${err.message}`, {
      rollbackPerformed: true,
      originalError: err
    });
  }
}
