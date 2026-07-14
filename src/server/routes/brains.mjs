/**
 * Brain Layer Management routes.
 *
 * GET /api/brains            - list all known brains (global + registered projects + tenants)
 * GET /api/brains/:id/nodes  - list memory nodes for a specific brain
 *
 * Extracted from rest.mjs as part of the per-resource router refactor.
 */

import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { requireAuth, requireScope } from '../auth.mjs';
import { getNodes } from '../../core/vault-cache.mjs';
import { logger } from '../../core/logger.mjs';
import {
  BRAIN_DIR,
  VAULT_DIR,
  DERIVED_DIR,
  serverError,
} from './_shared.mjs';

const router = Router();

/** Return ISO mtime string for a file, or null if it doesn't exist. */
function getLastModified(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return fs.statSync(filePath).mtime.toISOString();
    }
  } catch {}
  return null;
}

/** Recursively count .md files under a directory. */
function countMd(dir) {
  if (!fs.existsSync(dir)) return 0;
  let count = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) count += countMd(path.join(dir, entry.name));
    else if (entry.name.endsWith('.md')) count++;
  }
  return count;
}

/**
 * GET /api/brains
 * List all known brains (global + registered projects + optional tenant) with state metadata.
 */
router.get('/api/brains', requireAuth, requireScope('ssss:read'), async (req, res) => {
  try {
    const globalBrainDir = path.join(os.homedir(), '.agent', 'skills', 'total-recall');
    const brains = [];

    // Global brain
    const globalVaultDir = path.join(globalBrainDir, 'memory-vault');
    let globalNodeCount = 0;
    if (fs.existsSync(globalVaultDir)) {
      try {
        globalNodeCount = getNodes(globalVaultDir).length;
      } catch {
        globalNodeCount = countMd(globalVaultDir);
      }
    }

    brains.push({
      id: 'global',
      name: 'Global Brain',
      layer: 'global',
      path: globalBrainDir,
      exists: fs.existsSync(globalBrainDir),
      node_count: globalNodeCount,
      last_compiled: getLastModified(path.join(globalBrainDir, 'memory-derived', 'graph-index.jsonl')),
    });

    // Project brains from registry
    const registryPath = path.join(globalBrainDir, 'config', 'project-registry.json');
    if (fs.existsSync(registryPath)) {
      try {
        const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
        for (const project of registry) {
          const projectVaultDir = path.join(project.brainDir, 'memory-vault');
          let nodeCount = 0;
          const exists = fs.existsSync(project.brainDir);

          if (exists && fs.existsSync(projectVaultDir)) {
            nodeCount = countMd(projectVaultDir);
          }

          brains.push({
            id: `project:${project.name}`,
            name: project.name,
            layer: 'project',
            path: project.brainDir,
            project_root: project.path,
            exists,
            node_count: nodeCount,
            registered_at: project.registered_at,
            last_compiled: project.last_compiled || getLastModified(path.join(project.brainDir, 'memory-derived', 'graph-index.jsonl')),
          });
        }
      } catch (err) {
        logger.error('server', 'Failed to read project registry', { error: err.message });
      }
    }

    // Optional remote/tenant vault from config
    try {
      const config = await import('../../core/config.mjs');
      if (config.remoteVaultSync?.enabled && config.remoteVaultSync.vaultDir) {
        const tenantVaultDir = config.remoteVaultSync.vaultDir;
        const tenantId =
          process.env.TR_TENANT_ID ||
          path.basename(path.dirname(tenantVaultDir)) ||
          'remote';
        const exists = fs.existsSync(tenantVaultDir);
        let nodeCount = 0;
        if (exists) {
          nodeCount = countMd(tenantVaultDir);
        }
        brains.push({
          id: `tenant:${tenantId}`,
          name: process.env.TR_TENANT_NAME || `Tenant (${tenantId})`,
          layer: 'tenant',
          path: tenantVaultDir,
          project_root: path.dirname(tenantVaultDir),
          exists,
          node_count: nodeCount,
          last_compiled: null,
        });
      }
    } catch {
      // ignore
    }

    res.json({ brains });

  } catch (err) { serverError(res, err); }
});

/**
 * GET /api/brains/:id/nodes
 * List all memory nodes for a specific brain.
 */
router.get('/api/brains/:id/nodes', requireAuth, requireScope('ssss:read', 'memory:read'), async (req, res) => {
  try {
    const brainId = req.params.id;
    let vaultDir;

    if (brainId === 'global') {
      const brainDir = path.join(os.homedir(), '.agent', 'skills', 'total-recall');
      vaultDir = path.join(brainDir, 'memory-vault');
    } else if (brainId.startsWith('project:')) {
      const projectName = brainId.slice('project:'.length);
      const globalBrainDir = path.join(os.homedir(), '.agent', 'skills', 'total-recall');
      const registryPath = path.join(globalBrainDir, 'config', 'project-registry.json');
      if (!fs.existsSync(registryPath)) {
        return res.status(404).json({ error: 'Project registry not found' });
      }
      const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
      const project = registry.find(p => p.name === projectName);
      if (!project) {
        return res.status(404).json({ error: `Project "${projectName}" not found in registry` });
      }
      vaultDir = path.join(project.brainDir, 'memory-vault');
    } else if (brainId.startsWith('tenant:')) {
      const tenantName = brainId.slice('tenant:'.length).replace(/[^a-zA-Z0-9._-]/g, '');
      const config = await import('../../core/config.mjs');
      const configuredId =
        process.env.TR_TENANT_ID ||
        (config.remoteVaultSync?.vaultDir
          ? path.basename(path.dirname(config.remoteVaultSync.vaultDir))
          : null);
      if (
        config.remoteVaultSync?.enabled &&
        config.remoteVaultSync.vaultDir &&
        (tenantName === configuredId || tenantName === 'remote' || tenantName === 'default')
      ) {
        vaultDir = config.remoteVaultSync.vaultDir;
      } else {
        vaultDir = path.join(os.homedir(), '.agent', 'tenants', tenantName, 'vault');
        if (!fs.existsSync(vaultDir)) {
          return res.status(404).json({ error: `Tenant "${tenantName}" not found` });
        }
      }
    } else {
      return res.status(400).json({ error: 'Invalid brain ID. Use "global", "project:<name>", or "tenant:<name>"' });
    }

    if (!fs.existsSync(vaultDir)) {
      return res.json({ nodes: [], brain_id: brainId });
    }

    let nodes = getNodes(vaultDir);
    const { q, category, status, tag } = req.query;
    if (q) {
      const query = String(q).toLowerCase();
      nodes = nodes.filter(n =>
        [n.slug, n.title, n.category, (n.tags || []).join(' '), n.body]
          .join(' ').toLowerCase().includes(query)
      );
    }
    if (category) nodes = nodes.filter(n => n.category === category);
    if (status) nodes = nodes.filter(n => n.status === status);
    if (tag) nodes = nodes.filter(n => (n.tags || []).includes(tag));

    res.json({ nodes, brain_id: brainId, count: nodes.length });
  } catch (err) { serverError(res, err); }
});

export default router;
