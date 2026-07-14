/**
 * Extension Routes
 *
 * GET /api/extension/download  — Download the Chrome extension as a zip/tar
 * GET /api/extension/status    — Check whether the extension is available and connected
 */

import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { requireAuth, requireScope } from '../auth.mjs';
import { BRAIN_DIR, serverError } from './_shared.mjs';

const router = Router();

/**
 * GET /api/extension/download
 * Streams the Chrome extension directory as a .zip (or .tar.gz fallback).
 */
router.get('/api/extension/download', requireAuth, requireScope('config:read'), async (_req, res) => {
  try {
    // Extension lives at <package-root>/extension/
    const extDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../extension');
    if (!fs.existsSync(extDir) || !fs.existsSync(path.join(extDir, 'manifest.json'))) {
      return res.status(404).json({ error: 'Chrome extension not found in this installation.' });
    }

    // Never inject PATs into packaged extension source. Pair from the extension
    // options page so secrets stay in extension-local storage.

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="total-recall-extension.zip"');

    // Use zip if available, fall back to tar
    const zip = spawn('zip', ['-r', '-', '.'], { cwd: extDir, stdio: ['ignore', 'pipe', 'ignore'] });
    zip.stdout.pipe(res);
    zip.on('error', () => {
      // zip not available — try tar
      if (!res.headersSent) {
        res.setHeader('Content-Type', 'application/gzip');
        res.setHeader('Content-Disposition', 'attachment; filename="total-recall-extension.tar.gz"');
        const tar = spawn('tar', ['czf', '-', '-C', path.dirname(extDir), 'extension'], { stdio: ['ignore', 'pipe', 'ignore'] });
        tar.stdout.pipe(res);
        tar.on('error', err => { if (!res.headersSent) serverError(res, err); });
        tar.on('close', () => { if (!res.writableEnded) res.end(); });
      }
    });
    zip.on('close', code => {
      if (code !== 0 && !res.writableEnded) res.end();
    });
  } catch (err) {
    serverError(res, err);
  }
});

/**
 * GET /api/extension/status
 * Returns whether the extension is available (packaged) and connected (has sent captures).
 */
router.get('/api/extension/status', requireAuth, requireScope('config:read'), async (_req, res) => {
  try {
    const extDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../extension');
    const available = fs.existsSync(path.join(extDir, 'manifest.json'));
    let version = '0.0.0';
    if (available) {
      try {
        const manifest = JSON.parse(fs.readFileSync(path.join(extDir, 'manifest.json'), 'utf8'));
        version = manifest.version || '0.0.0';
      } catch {}
    }

    // Check if extension has ever connected by looking for the marker file
    const markerPath = path.join(BRAIN_DIR, 'config', '.extension-connected');
    const connected = fs.existsSync(markerPath);

    res.json({ available, connected, version });
  } catch (err) { serverError(res, err); }
});

export default router;
export { router as extensionRouter };
