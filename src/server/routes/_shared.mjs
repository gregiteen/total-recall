/**
 * Shared constants and response helpers used by every route module.
 *
 * Extracted from rest.mjs as part of the per-resource router refactor.
 * Keep this file free of route definitions — it should be safe to import
 * from any handler without circular concerns.
 */

import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { agentDir, brainDir } from '../../core/config.mjs';
import { logger } from '../../core/logger.mjs';

export const AGENT_DIR    = process.env.AGENT_DIR || agentDir;
export const BRAIN_DIR    = process.env.TR_BRAIN || path.join(AGENT_DIR, 'skills', 'total-recall');
export const VAULT_DIR    = path.join(BRAIN_DIR, 'memory-vault');
export const SKILLS_DIR   = path.join(AGENT_DIR, 'skills');
export const DERIVED_DIR  = path.join(BRAIN_DIR, 'memory-derived');
export const SESSIONS_DIR = path.join(BRAIN_DIR, 'sessions');
export const INSTRUCTIONS = path.join(AGENT_DIR, 'INSTRUCTIONS.md');
export const FILES_DIR    = path.join(BRAIN_DIR, 'files');
export const TASKS_DIR    = path.join(BRAIN_DIR, 'scheduler', 'queue');
export const CONFIG_DIR   = path.join(BRAIN_DIR, 'config');

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const MODEL_CATALOG_DIR = path.join(ROOT, 'models', 'catalog', 'total-recall');

/**
 * Resolve a brain-specific vault directory from the request.
 *
 * Reads `req.query.brain` (query param) or `req.body?.brainId` (body field).
 * - If the value is `'global'` or missing, returns the default VAULT_DIR.
 * - If it starts with `'project:'`, looks up the project brain in the
 *   project-registry.json (same resolution logic as GET /api/brains/:id/nodes).
 * - Falls back to VAULT_DIR if the resolved path doesn't exist.
 *
 * @param {import('express').Request} req
 * @returns {string} Absolute path to the memory-vault directory
 */
export function resolveVaultFromQuery(req) {
  const rawBrainId = req.query?.brain || req.body?.brainId || req.headers?.['x-total-recall-brain'];
  let brainId = rawBrainId;

  if (rawBrainId && rawBrainId.includes(',')) {
    const parts = rawBrainId.split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length > 0) {
      brainId = parts[parts.length - 1];
    }
  }

  // No brain specified or explicitly global → default vault
  if (!brainId || brainId === 'global') {
    return VAULT_DIR;
  }

  if (brainId.startsWith('project:')) {
    const projectName = brainId.slice('project:'.length);
    const globalBrainDir = path.join(os.homedir(), '.agent', 'skills', 'total-recall');
    const registryPath = path.join(globalBrainDir, 'config', 'project-registry.json');

    if (!fs.existsSync(registryPath)) {
      return VAULT_DIR;
    }

    try {
      const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
      const project = registry.find(p => p.name === projectName);
      if (project) {
        const projectVaultDir = path.join(project.brainDir, 'memory-vault');
        if (fs.existsSync(projectVaultDir)) {
          return projectVaultDir;
        }
      }
    } catch {
      // Registry parse error — fall through to default
    }
  }

  // tenant:<name> → ~/.agent/tenants/<name>/vault (any tenant the user configures)
  if (brainId.startsWith('tenant:')) {
    const tenantName = brainId.slice('tenant:'.length).replace(/[^a-zA-Z0-9._-]/g, '');
    if (tenantName) {
      const tenantVaultDir = path.join(os.homedir(), '.agent', 'tenants', tenantName, 'vault');
      if (fs.existsSync(tenantVaultDir)) {
        return tenantVaultDir;
      }
    }
  }

  // Unknown brain ID format or resolution failed → default vault
  return VAULT_DIR;
}

export function resolveAllVaultsFromQuery(req) {
  const rawBrainId = req.query?.brain || req.body?.brainId || req.headers?.['x-total-recall-brain'];
  if (!rawBrainId) return [VAULT_DIR];

  const ids = rawBrainId.split(',').map(s => s.trim()).filter(Boolean);
  const vaults = [];

  for (const id of ids) {
    // We can reuse resolveVaultFromQuery by mocking the req object
    const vault = resolveVaultFromQuery({ query: { brain: id } });
    if (vault) {
      vaults.push(vault);
    }
  }

  // Deduplicate vaults
  const uniqueVaults = [...new Set(vaults)];
  return uniqueVaults.length > 0 ? uniqueVaults : [VAULT_DIR];
}

export function notFound(res, msg) {
  return res.status(404).json({ error: msg || 'Not found' });
}

export function badRequest(res, msg) {
  return res.status(400).json({ error: msg });
}

export function serverError(res, err) {
  logger.error('rest', 'Internal server error', { error: err.message, stack: err.stack });
  return res.status(500).json({ error: 'Internal server error' });
}

/** Strip the internal `body` field from a vault node into `content`. */
export function sanitizeNode({ body, ...rest }) {
  return { ...rest, content: body };
}
