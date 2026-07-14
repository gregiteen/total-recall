/**
 * Optional remote vault content sync (generic).
 * All endpoints/paths come from config / env — no product or host-app assumptions.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import http from 'node:http';
import https from 'node:https';
import { createHash } from 'node:crypto';
import { createEngine } from '@ssss/cli/engine';
import { remoteVaultSync } from './config.mjs';
import { logger } from './logger.mjs';

function fetchExport(url, token, outStream) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { headers: { Authorization: `Bearer ${token}` } }, (res) => {
      if (res.statusCode !== 200) {
        let errStr = '';
        res.on('data', (c) => (errStr += String(c)));
        res.on('end', () => reject(new Error(`HTTP ${res.statusCode}: ${errStr}`)));
        return;
      }
      res.pipe(outStream);
      outStream.on('finish', () => resolve(true));
      outStream.on('error', reject);
    });
    req.on('error', reject);
  });
}

function pruneAssets(assetsDir, keepCount) {
  if (!fs.existsSync(assetsDir)) return;
  const files = fs
    .readdirSync(assetsDir)
    .filter((f) => f.endsWith('.tar.gz'))
    .map((f) => ({ name: f, time: fs.statSync(path.join(assetsDir, f)).mtimeMs }))
    .sort((a, b) => b.time - a.time);

  for (let i = keepCount; i < files.length; i++) {
    try {
      fs.unlinkSync(path.join(assetsDir, files[i].name));
    } catch {
      // ignore
    }
  }
}

function remoteRegistryDir() {
  if (process.env.TR_REMOTE_REGISTRY_DIR) return process.env.TR_REMOTE_REGISTRY_DIR;
  if (remoteVaultSync.registryDir) return remoteVaultSync.registryDir;
  throw new Error(
    'TR_REMOTE_REGISTRY_DIR is required for remote vault content sync (SSSS registry path for imports).',
  );
}

/**
 * Replay bundle documents through the SSSS engine with an explicit registry.
 */
export function importRemoteBundle(bundle, vaultDir, registryDir) {
  const files = Array.isArray(bundle?.files) ? bundle.files : [];
  if (files.length === 0) {
    return { imported: 0 };
  }
  if (!registryDir) {
    throw new Error('TR_REMOTE_REGISTRY_DIR is required when the bundle contains files to import.');
  }
  const engine = createEngine({ registryDir });
  const failures = [];
  for (const file of files) {
    const result = engine.processOperation(
      {
        type: 'operation',
        idempotency_key: createHash('sha256')
          .update(file.path)
          .update('\n')
          .update(file.content)
          .digest('hex'),
        workspace_id: process.env.TR_REMOTE_WORKSPACE_ID || 'remote',
        path: file.path,
        content: file.content,
        actor: { role: 'system' },
      },
      vaultDir,
    );
    if (!result.success) {
      failures.push(
        `${file.path}: ${(result.validation?.errors || ['unknown operation failure']).join('; ')}`,
      );
    }
  }
  if (failures.length) throw new Error(`Bundle import failed: ${failures.join(' | ')}`);
  return { imported: files.length };
}

/** @deprecated alias */
export const importPortfolioBundle = importRemoteBundle;

export async function runSync() {
  if (!remoteVaultSync.enabled && process.env.TR_REMOTE_VAULT_SYNC !== '1') return;

  if (!remoteVaultSync.baseUrl) {
    logger.error({
      subsystem: 'remote-vault-sync',
      message: 'TR_REMOTE_VAULT_URL / remoteVaultSync.baseUrl is not configured — skipping',
    });
    return;
  }

  const tenantDir = path.dirname(remoteVaultSync.vaultDir);
  const statusFile = path.join(tenantDir, 'sync-status.json');

  if (!fs.existsSync(tenantDir)) {
    fs.mkdirSync(tenantDir, { recursive: true });
  }

  const token = process.env[remoteVaultSync.tokenRef];
  if (!token) {
    const errStr = `Missing ${remoteVaultSync.tokenRef} environment variable`;
    logger.error({ subsystem: 'remote-vault-sync', message: errStr });
    fs.writeFileSync(
      statusFile,
      JSON.stringify({ lastRunAt: new Date().toISOString(), ok: false, error: errStr }, null, 2),
    );
    return;
  }

  try {
    const bundleUrl = `${remoteVaultSync.baseUrl.replace(/\/+$/, '')}/api/admin/export-bundle`;
    const tmpBundle = path.join(tenantDir, `tmp-bundle-${process.pid}-${Date.now()}.json`);
    const bundleStream = fs.createWriteStream(tmpBundle);
    await fetchExport(bundleUrl, token, bundleStream);

    const registryDir = remoteRegistryDir();
    const ssssCmd = path.join(process.cwd(), 'node_modules', '.bin', 'ssss');
    let validateCmd = 'ssss';
    if (fs.existsSync(ssssCmd)) {
      validateCmd = ssssCmd;
    }
    const valRes = spawnSync(validateCmd, ['validate', tmpBundle, '--registry', registryDir], {
      encoding: 'utf8',
    });
    if (valRes.status !== 0) {
      throw new Error(`Bundle validation failed: ${valRes.stderr}`);
    }

    const bundleContent = JSON.parse(fs.readFileSync(tmpBundle, 'utf8'));
    const nodeCounts =
      bundleContent.manifest?.primitive_inventory || bundleContent.primitive_inventory || {};

    if (!fs.existsSync(remoteVaultSync.vaultDir)) {
      fs.mkdirSync(remoteVaultSync.vaultDir, { recursive: true });
    }
    importRemoteBundle(bundleContent, remoteVaultSync.vaultDir, registryDir);

    const assetsUrl = `${remoteVaultSync.baseUrl.replace(/\/+$/, '')}/api/admin/export-assets`;
    if (!fs.existsSync(remoteVaultSync.assetsDir)) {
      fs.mkdirSync(remoteVaultSync.assetsDir, { recursive: true });
    }
    const assetFile = path.join(
      remoteVaultSync.assetsDir,
      `assets-${new Date().toISOString().replace(/[:.]/g, '-')}.tar.gz`,
    );
    const assetStream = fs.createWriteStream(assetFile);
    await fetchExport(assetsUrl, token, assetStream);

    pruneAssets(remoteVaultSync.assetsDir, remoteVaultSync.keepAssets);

    fs.unlinkSync(tmpBundle);

    fs.writeFileSync(
      statusFile,
      JSON.stringify({
        lastRunAt: new Date().toISOString(),
        ok: true,
        nodeCounts,
      }, null, 2),
    );

    logger.info({ subsystem: 'remote-vault-sync', message: 'Remote vault sync completed successfully' });
  } catch (err) {
    logger.error({ subsystem: 'remote-vault-sync', message: `Sync failed: ${err.message}` });
    try {
      fs.writeFileSync(
        statusFile,
        JSON.stringify({ lastRunAt: new Date().toISOString(), ok: false, error: err.message }, null, 2),
      );
    } catch {
      // ignore
    }
  }
}
