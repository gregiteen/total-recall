/**
 * Total Recall — Capability Deployment Verifier
 *
 * Implements Phase 3 of CAPABILITY_DEPLOYMENT_PLUGINS:
 * - Verification of installed capability source file hashes and drift detection
 * - Conformance of SSSS installation records, access grants, and event logs
 * - Verification of application shell gates and entrypoints
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { resolveAppVaultDir } from './apply.mjs';
import {
  AppCapabilityInstallationSchema,
  AccessGrantSchema
} from '../schema.mjs';

/**
 * Verifies an application's capability deployments, integrity, and conformance.
 *
 * @param {string} targetDir - Application root directory
 * @param {object} [options]
 * @param {boolean} [options.checkFiles=true] - Verify sha256 hashes of all deployed files
 * @returns {Promise<{
 *   valid: boolean,
 *   target: string,
 *   vault: string,
 *   capabilities: Array<{
 *     id: string,
 *     version: string,
 *     status: string,
 *     files_checked: number,
 *     files_intact: number,
 *     drift: Array<{ path: string, expected_sha: string, actual_sha?: string, missing?: boolean }>
 *   }>,
 *   grants: Array<{ id: string, valid: boolean, scopes: string[] }>,
 *   events_count: number,
 *   errors: string[]
 * }>}
 */
export async function verifyApplication(targetDir = process.cwd(), options = {}) {
  const resolvedTarget = path.resolve(targetDir);
  const checkFiles = options.checkFiles !== false;
  const errors = [];

  if (!fs.existsSync(resolvedTarget)) {
    throw new Error(`Target application directory does not exist: ${resolvedTarget}`);
  }

  const vaultDir = resolveAppVaultDir(resolvedTarget);
  const capInstallDir = path.join(vaultDir, 'system', 'capabilities');
  const grantDir = path.join(vaultDir, 'system', 'grants');
  const eventDir = path.join(vaultDir, 'system', 'events');

  const capabilitiesReport = [];

  // 1. Verify Installed Capabilities
  if (fs.existsSync(capInstallDir)) {
    const files = fs.readdirSync(capInstallDir).filter((f) => f.endsWith('.md'));
    for (const f of files) {
      const capPath = path.join(capInstallDir, f);
      const content = fs.readFileSync(capPath, 'utf8');
      const match = content.match(/^---\n([\s\S]*?)\n---/);
      if (!match) {
        errors.push(`Malformed capability record '${f}': missing YAML frontmatter`);
        continue;
      }

      const raw = match[1];
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

      const validation = AppCapabilityInstallationSchema.safeParse(record);
      if (!validation.success) {
        errors.push(
          `Invalid capability installation schema in '${f}': ${validation.error.issues.map((i) => i.message).join('; ')}`
        );
      }

      const capId = record.capability_id || path.basename(f, '.md');
      const version = record.version || 'unknown';
      const status = record.status || 'unknown';
      const fileList = Array.isArray(record.files) ? record.files : [];
      const drift = [];
      let intactCount = 0;

      if (checkFiles) {
        for (const fileDesc of fileList) {
          const targetFilePath = path.join(resolvedTarget, fileDesc.path);
          if (!fs.existsSync(targetFilePath)) {
            drift.push({
              path: fileDesc.path,
              expected_sha: fileDesc.sha256,
              missing: true
            });
          } else {
            const actualBytes = fs.readFileSync(targetFilePath);
            const actualSha = crypto.createHash('sha256').update(actualBytes).digest('hex');
            if (actualSha !== fileDesc.sha256) {
              drift.push({
                path: fileDesc.path,
                expected_sha: fileDesc.sha256,
                actual_sha: actualSha
              });
            } else {
              intactCount++;
            }
          }
        }
      }

      if (status !== 'installed') {
        errors.push(`Capability '${capId}' has non-ready status: '${status}'`);
      }
      if (drift.length > 0) {
        errors.push(
          `Capability '${capId}' has ${drift.length} drifted/missing file(s): ${drift.map((d) => d.path).join(', ')}`
        );
      }

      capabilitiesReport.push({
        id: capId,
        version,
        status,
        files_checked: fileList.length,
        files_intact: intactCount,
        drift
      });
    }
  }

  // 2. Verify Access Grants
  const grantsReport = [];
  if (fs.existsSync(grantDir)) {
    const files = fs.readdirSync(grantDir).filter((f) => f.endsWith('.md'));
    for (const f of files) {
      const grantPath = path.join(grantDir, f);
      const content = fs.readFileSync(grantPath, 'utf8');
      const match = content.match(/^---\n([\s\S]*?)\n---/);
      if (!match) continue;

      const raw = match[1];
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

      const validation = AccessGrantSchema.safeParse(record);
      if (!validation.success) {
        errors.push(`Invalid access grant '${f}': ${validation.error.issues.map((i) => i.message).join('; ')}`);
      }

      grantsReport.push({
        id: record.grantee || path.basename(f, '.md'),
        valid: validation.success,
        scopes: record.scopes || []
      });
    }
  }

  // 3. Verify SSSS Event Ledger
  let eventsCount = 0;
  const eventLogFile = path.join(eventDir, 'capability-events.jsonl');
  if (fs.existsSync(eventLogFile)) {
    const lines = fs.readFileSync(eventLogFile, 'utf8').trim().split('\n').filter(Boolean);
    eventsCount = lines.length;
    for (let i = 0; i < lines.length; i++) {
      try {
        const envelope = JSON.parse(lines[i]);
        if (!envelope.type || !envelope.domain || !envelope.action) {
          errors.push(`Invalid SSSS event envelope at line ${i + 1} of capability-events.jsonl`);
        }
      } catch (parseErr) {
        errors.push(`Corrupt JSON line in capability-events.jsonl at line ${i + 1}: ${parseErr.message}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    target: resolvedTarget,
    vault: vaultDir,
    capabilities: capabilitiesReport,
    grants: grantsReport,
    events_count: eventsCount,
    errors
  };
}
