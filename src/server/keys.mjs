/**
 * API Key Lifecycle Manager
 *
 * Manages Personal Access Tokens (PATs) in `.agent/config/keys.jsonl`.
 * Each line is a JSON object representing a single API key with metadata.
 *
 * Schema:
 *   { id, name, token, created_at, last_used_at, hit_count, revoked }
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

const AGENT_DIR = process.env.AGENT_DIR || path.join(os.homedir(), '.agent');
const KEYS_FILE = path.join(AGENT_DIR, 'config', 'keys.jsonl');

function ensureKeysFile() {
  const dir = path.dirname(KEYS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(KEYS_FILE)) fs.writeFileSync(KEYS_FILE, '', 'utf8');
}

export function loadKeys() {
  ensureKeysFile();
  const raw = fs.readFileSync(KEYS_FILE, 'utf8').trim();
  if (!raw) return [];
  return raw.split('\n').map(line => JSON.parse(line));
}

function saveKeys(keys) {
  ensureKeysFile();
  fs.writeFileSync(KEYS_FILE, keys.map(k => JSON.stringify(k)).join('\n') + (keys.length ? '\n' : ''), 'utf8');
}

export function issueKey(name) {
  const keys = loadKeys();
  const token = `tr-${crypto.randomBytes(24).toString('hex')}`;
  const key = {
    id: crypto.randomUUID(),
    name: name || 'Unnamed Key',
    token,
    created_at: new Date().toISOString(),
    last_used_at: null,
    hit_count: 0,
    revoked: false,
  };
  keys.push(key);
  saveKeys(keys);
  return key;
}

export function revokeKey(id) {
  const keys = loadKeys();
  const key = keys.find(k => k.id === id);
  if (!key) return null;
  key.revoked = true;
  saveKeys(keys);
  return key;
}

export function recordKeyUsage(token) {
  const keys = loadKeys();
  const key = keys.find(k => k.token === token && !k.revoked);
  if (!key) return false;
  key.hit_count = (key.hit_count || 0) + 1;
  key.last_used_at = new Date().toISOString();
  saveKeys(keys);
  return true;
}

export function isValidToken(token) {
  // Always accept the legacy 'local' sentinel for backward compatibility
  if (token === 'local') return true;
  const keys = loadKeys();
  return keys.some(k => k.token === token && !k.revoked);
}
