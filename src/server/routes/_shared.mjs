/**
 * Shared constants and response helpers used by every route module.
 *
 * Extracted from rest.mjs as part of the per-resource router refactor.
 * Keep this file free of route definitions — it should be safe to import
 * from any handler without circular concerns.
 */

import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { agentDir } from '../../core/config.mjs';
import { logger } from '../../core/logger.mjs';

export const AGENT_DIR    = agentDir;
export const VAULT_DIR    = path.join(AGENT_DIR, 'memory-vault');
export const SKILLS_DIR   = path.join(AGENT_DIR, 'skills');
export const DERIVED_DIR  = path.join(AGENT_DIR, 'memory-derived');
export const SESSIONS_DIR = path.join(AGENT_DIR, 'sessions');
export const INSTRUCTIONS = path.join(AGENT_DIR, 'INSTRUCTIONS.md');
export const FILES_DIR    = path.join(AGENT_DIR, 'files');
export const TASKS_DIR    = path.join(AGENT_DIR, 'scheduler', 'queue');
export const CONFIG_DIR   = path.join(AGENT_DIR, 'config');

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const MODEL_CATALOG_DIR = path.join(ROOT, 'models', 'catalog', 'total-recall');

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
