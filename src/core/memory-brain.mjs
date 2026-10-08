/** Portable brain identity and registration, shared with legacy project setup. */
import fs from 'node:fs';
import path from 'node:path';
import { writeFileSecure } from './secure-file.mjs';

function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }

export const VAULT_CATEGORIES = Object.freeze([
  'invariants',
  'patterns',
  'anti-patterns',
  'preferences',
  'decisions',
  'concepts',
  'facts',
  'corrections',
  'lore',
]);

export function writeBrainIdentity(brainDir, { name, role = 'project', tags = [] } = {}) {
  const configDir = path.join(brainDir, 'config');
  ensureDir(configDir);
  const brainJsonPath = path.join(configDir, 'brain.json');
  let current = {};
  if (fs.existsSync(brainJsonPath)) {
    current = JSON.parse(fs.readFileSync(brainJsonPath, 'utf8'));
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      throw new Error('Existing brain identity must be an object');
    }
  }
  const next = {
    ...current,
    name: name || current.name || path.basename(path.resolve(brainDir, '../../..')),
    role,
    layer: role,
    full_brain: true,
    tags: [...new Set([...(current.tags || []), ...tags, `${role}-brain`])],
    updated_at: new Date().toISOString(),
    created_at: current.created_at || new Date().toISOString(),
  };
  writeFileSecure(brainJsonPath, JSON.stringify(next, null, 2), { encoding: 'utf8', mode: 0o600 });
  return next;
}

export function registerProjectBrain(globalBrainDir, entry) {
  const registryPath = path.join(globalBrainDir, 'config', 'project-registry.json');
  ensureDir(path.dirname(registryPath));
  let list = [];
  if (fs.existsSync(registryPath)) {
    list = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  }
  if (!Array.isArray(list)) throw new Error('Existing project registry must be an array');

  const abs = path.resolve(entry.path);
  const idx = list.findIndex((p) => path.resolve(p.path || '') === abs);
  const now = new Date().toISOString();
  const row = {
    name: entry.name,
    path: abs,
    brainDir: entry.brainDir,
    full_brain: true,
    layer: 'project',
    tags: entry.tags || ['project-brain'],
    registered_at: idx >= 0 ? list[idx].registered_at || now : now,
    last_compiled: entry.last_compiled || list[idx]?.last_compiled || null,
    updated_at: now,
  };
  if (idx >= 0) list[idx] = { ...list[idx], ...row };
  else list.push(row);
  fs.writeFileSync(registryPath, JSON.stringify(list, null, 2));
  return row;
}
