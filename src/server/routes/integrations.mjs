/**
 * Active integrations routes.
 *
 * GET  /api/integrations/active   - list active IDE/agent integrations
 * POST /api/integrations/connect  - connect a new client and issue a key
 *
 * Extracted from rest.mjs as part of the per-resource router refactor.
 */

import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { requireAuth } from '../auth.mjs';
import { issueKey } from '../keys.mjs';
import connect from '../../cli/connect.mjs';
import {
  BRAIN_DIR,
  badRequest,
  serverError,
} from './_shared.mjs';

const router = Router();

/**
 * GET /api/integrations/active
 * Returns list of detected or configured IDE/agent integrations.
 */
router.get('/api/integrations/active', requireAuth, (req, res) => {
  try {
    const HOME = os.homedir();
    const configDir = path.join(BRAIN_DIR, 'config');
    const configFile = path.join(configDir, 'wizard-config.json');

    let configuredIdes = [];
    if (fs.existsSync(configFile)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(configFile, 'utf8'));
        if (Array.isArray(parsed.configuredIdes)) {
          configuredIdes = parsed.configuredIdes;
        }
      } catch (e) {
        // ignore
      }
    }

    // Fallback detection (filesystem probing) if configuredIdes is empty.
    // Paths are OS-standard config locations + public extension IDs only —
    // never hostnames, mesh names, or user-specific device identifiers.
    if (configuredIdes.length === 0) {
      const editorDataRoots = [];
      if (process.platform === 'darwin') {
        const appSupport = path.join(HOME, 'Library', 'Application Support');
        editorDataRoots.push(
          path.join(appSupport, 'Code'),
          path.join(appSupport, 'Code - Insiders'),
          path.join(appSupport, 'VSCodium'),
        );
      } else if (process.platform === 'win32') {
        const appData = process.env.APPDATA || path.join(HOME, 'AppData', 'Roaming');
        editorDataRoots.push(
          path.join(appData, 'Code'),
          path.join(appData, 'Code - Insiders'),
          path.join(appData, 'VSCodium'),
        );
      } else {
        const xdg = process.env.XDG_CONFIG_HOME || path.join(HOME, '.config');
        editorDataRoots.push(
          path.join(xdg, 'Code'),
          path.join(xdg, 'Code - Insiders'),
          path.join(xdg, 'VSCodium'),
        );
      }

      // Public VS Code Marketplace extension id for Cline (not a device/user name).
      const CLINE_EXTENSION_ID = 'saoudrizwan.claude-dev';
      const clineStoragePaths = editorDataRoots.map((root) =>
        path.join(root, 'User', 'globalStorage', CLINE_EXTENSION_ID),
      );

      const checks = {
        'claude-code': [path.join(HOME, '.claude', 'projects'), path.join(HOME, '.claude', 'CLAUDE.md')],
        'codex':       [path.join(HOME, '.codex', 'sessions'), path.join(HOME, '.codex', 'AGENTS.md')],
        'cursor':      [path.join(HOME, '.cursor', 'projects'), path.join(HOME, '.cursor')],
        'cline':       [...clineStoragePaths, path.join(HOME, '.clinerules')],
        'antigravity': [path.join(HOME, '.gemini', 'antigravity')],
        'vscode':      [...editorDataRoots, path.join(HOME, '.vscode')],
        'gemini':      [path.join(HOME, '.gemini')],
        'pi':          [path.join(HOME, '.pi', 'agent')],
        'hermes':      [path.join(HOME, '.hermes')],
        'hermes-agent':[path.join(HOME, '.hermes')],
        'dsh':         [path.join(HOME, '.dsh')],
        'deepseek-harness': [path.join(HOME, '.dsh')],
        'openclaw':    [path.join(HOME, '.openclaw')],
      };

      for (const [ide, paths] of Object.entries(checks)) {
        if (paths.some(p => { try { return fs.existsSync(p); } catch { return false; } })) {
          configuredIdes.push(ide);
        }
      }
    }

    res.json({ success: true, active: configuredIdes });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/integrations/connect
 * Body: { client: string, baseUrl?: string }
 * Generates a fresh key for the client and runs the connection logic.
 */
router.post('/api/integrations/connect', requireAuth, (req, res) => {
  try {
    const client = req.body?.client || req.query?.client;
    const baseUrl = req.body?.baseUrl || req.query?.baseUrl;
    if (!client) return badRequest(res, 'client is required');

    const validClients = [
      'vscode', 'pi', 'hermes', 'hermes-agent', 'dsh', 'deepseek-harness',
      'openclaw', 'cursor', 'cline', 'claude-code',
      'codex', 'gemini', 'aider', 'http-api', 'obsidian',
      'generic', 'antigravity'
    ];

    if (!validClients.includes(client)) {
      return badRequest(res, `Unknown client: ${client}`);
    }

    // Generate a fresh key for this client
    const scopes = ['ssss:read', 'memory:read'];
    const keyName = `${client.charAt(0).toUpperCase() + client.slice(1)} Link`;
    const newKey = issueKey(keyName, { scopes });

    // Call the connect function from cli/connect.mjs
    const args = [client, '--token', newKey.token];
    if (baseUrl) {
      args.push('--brain', baseUrl);
    }

    connect(args)
      .then(() => {
        res.json({
          success: true,
          message: `Successfully connected ${client}`,
          token_preview: newKey.token_prefix,
          key_id: newKey.id
        });
      })
      .catch(err => {
        serverError(res, err);
      });
  } catch (err) {
    serverError(res, err);
  }
});

export default router;
