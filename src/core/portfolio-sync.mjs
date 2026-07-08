import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import http from 'http';
import https from 'https';
import { pipeline } from 'stream/promises';
import { portfolioSync } from './config.mjs';
import { logger } from './logger.mjs';

function fetchExport(url, token, outStream) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { headers: { 'Authorization': `Bearer ${token}` } }, (res) => {
      if (res.statusCode !== 200) {
        let errStr = '';
        res.on('data', c => errStr += String(c));
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
  const files = fs.readdirSync(assetsDir)
    .filter(f => f.endsWith('.tar.gz'))
    .map(f => ({ name: f, time: fs.statSync(path.join(assetsDir, f)).mtimeMs }))
    .sort((a, b) => b.time - a.time);
  
  for (let i = keepCount; i < files.length; i++) {
    try {
      fs.unlinkSync(path.join(assetsDir, files[i].name));
    } catch (e) {
      // ignore
    }
  }
}

export async function runSync() {
  if (!portfolioSync.enabled) return;

  const tenantDir = path.dirname(portfolioSync.vaultDir);
  const statusFile = path.join(tenantDir, 'sync-status.json');
  
  if (!fs.existsSync(tenantDir)) {
    fs.mkdirSync(tenantDir, { recursive: true });
  }

  const token = process.env[portfolioSync.tokenRef];
  if (!token) {
    const errStr = `Missing ${portfolioSync.tokenRef} environment variable`;
    logger.error({ subsystem: 'portfolio-sync', message: errStr });
    fs.writeFileSync(statusFile, JSON.stringify({ lastRunAt: new Date().toISOString(), ok: false, error: errStr }, null, 2));
    return;
  }

  try {
    // 1. Fetch export-bundle
    const bundleUrl = `${portfolioSync.baseUrl.replace(/\/+$/, '')}/api/admin/export-bundle`;
    const tmpBundle = path.join(tenantDir, 'tmp-bundle.json');
    const bundleStream = fs.createWriteStream(tmpBundle);
    await fetchExport(bundleUrl, token, bundleStream);

    // 2. Validate it
    const ssssCmd = path.join(process.cwd(), 'node_modules', '.bin', 'ssss');
    let validateCmd = 'ssss';
    if (fs.existsSync(ssssCmd)) {
      validateCmd = ssssCmd;
    }
    const valRes = spawnSync(validateCmd, ['validate', tmpBundle, '--registry', path.join(process.env.HOME || '/Users/greg', 'Github', 'portfolio-site', 'vault-registry')], { encoding: 'utf8' });
    if (valRes.status !== 0) {
      throw new Error(`Bundle validation failed: ${valRes.stderr}`);
    }
    
    // Parse bundle for nodeCounts (primitive_inventory)
    const bundleContent = JSON.parse(fs.readFileSync(tmpBundle, 'utf8'));
    const nodeCounts = bundleContent.primitive_inventory || {};

    // 3. Import
    if (!fs.existsSync(portfolioSync.vaultDir)) {
      fs.mkdirSync(portfolioSync.vaultDir, { recursive: true });
    }
    const impRes = spawnSync(validateCmd, ['import', tmpBundle, '--vault', portfolioSync.vaultDir, '--registry', path.join(process.env.HOME || '/Users/greg', 'Github', 'portfolio-site', 'vault-registry')], { encoding: 'utf8' });
    if (impRes.status !== 0) {
      throw new Error(`Bundle import failed: ${impRes.stderr}`);
    }

    // 4. Fetch export-assets
    const assetsUrl = `${portfolioSync.baseUrl.replace(/\/+$/, '')}/api/admin/export-assets`;
    if (!fs.existsSync(portfolioSync.assetsDir)) {
      fs.mkdirSync(portfolioSync.assetsDir, { recursive: true });
    }
    const assetFile = path.join(portfolioSync.assetsDir, `assets-${new Date().toISOString().replace(/[:.]/g, '-')}.tar.gz`);
    const assetStream = fs.createWriteStream(assetFile);
    await fetchExport(assetsUrl, token, assetStream);
    
    pruneAssets(portfolioSync.assetsDir, portfolioSync.keepAssets);

    // Clean up
    fs.unlinkSync(tmpBundle);

    // 5. Write sync-status.json
    fs.writeFileSync(statusFile, JSON.stringify({
      lastRunAt: new Date().toISOString(),
      ok: true,
      nodeCounts
    }, null, 2));

    logger.info({ subsystem: 'portfolio-sync', message: 'Portfolio sync completed successfully' });

  } catch (err) {
    logger.error({ subsystem: 'portfolio-sync', message: `Sync failed: ${err.message}` });
    fs.writeFileSync(statusFile, JSON.stringify({
      lastRunAt: new Date().toISOString(),
      ok: false,
      error: err.message
    }, null, 2));
  }
}
