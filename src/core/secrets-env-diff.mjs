/**
 * Compare repo .env files against the secrets store.
 *
 * The store is meant to be the SSOT and .env files its projections, but nothing
 * ever checked that they agreed. Drift is silent and consequential: the same
 * key can hold a rotated credential in one place and a retired one in the
 * other, and whichever the process happens to read decides whether a service
 * works. Length-equal drift is the dangerous kind — same provider, same format,
 * different key — because it looks like a match in every summary that counts
 * keys rather than comparing values.
 *
 * Reports only shapes and lengths. Secret values never leave this module.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadSecrets, listSecretsMeta } from './secrets-store.mjs';
import { parseEnvText, isCandidateKey } from './env-import.mjs';

/** Values that are obviously templates rather than credentials. */
const PLACEHOLDER = /^(your[_-]?|xxx+|changeme|<|placeholder|todo|sk-your|example)/i;

export function isPlaceholderValue(value) {
  const v = String(value || '').trim();
  if (!v) return true;
  if (PLACEHOLDER.test(v)) return true;
  // `..._HERE`, `PUT_KEY_HERE` and friends
  return /(_|-)?here$/i.test(v);
}

/**
 * Classify one key across the two sources.
 * @returns {'match'|'drift'|'only_env'|'only_store'|'placeholder'}
 */
export function classify(envValue, storeValue, keyInStore) {
  if (envValue !== undefined && isPlaceholderValue(envValue)) return 'placeholder';
  if (envValue === undefined) return 'only_store';
  if (!keyInStore) return 'only_env';
  return String(storeValue) === String(envValue) ? 'match' : 'drift';
}

/**
 * Locate the .env files worth comparing, from the project registry plus any
 * explicit paths. Never hardcodes a repo: registry entries and caller input only.
 */
export function resolveEnvFiles(roots = [], filenames = ['.env']) {
  const files = [];
  for (const root of roots) {
    for (const name of filenames) {
      const candidate = path.join(root, name);
      if (fs.existsSync(candidate)) files.push(candidate);
      // Sub-app env files (e.g. a server/ workspace) drift independently.
      const nested = path.join(root, 'server', name);
      if (fs.existsSync(nested)) files.push(nested);
    }
  }
  return files;
}

/**
 * Diff every candidate secret in the given .env files against the store.
 */
/**
 * Which repo a .env belongs to, for comparison against a secret's binding.
 * Walks up to the directory holding the file, ignoring a nested app dir.
 */
export function repoOfEnvFile(file) {
  const parts = path.resolve(file).split(path.sep);
  const idx = parts.lastIndexOf('Github');
  if (idx !== -1 && parts[idx + 1]) return parts[idx + 1];
  return path.basename(path.dirname(path.resolve(file)));
}

export async function diffEnvAgainstStore(brainDir, envFiles) {
  const store = await loadSecrets(brainDir);
  const meta = await listSecretsMeta(brainDir).catch(() => []);
  const bindingOf = new Map(meta.map((m) => [m.key, m.repos || m.repo || null]));
  const rows = [];
  const totals = { match: 0, drift: 0, only_env: 0, placeholder: 0, collision: 0 };

  for (const file of envFiles) {
    let parsed;
    try {
      parsed = parseEnvText(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      rows.push({ key: '(unreadable)', file, status: 'error', detail: err.message });
      continue;
    }

    for (const [key, value] of Object.entries(parsed)) {
      if (!isCandidateKey(key)) continue;
      let status = classify(value, store[key], key in store);
      if (status === 'only_store') continue;

      // A store entry is bound to exactly one repo. When the .env belongs to a
      // different repo, the two values are not the same credential wearing one
      // name — they are two products' credentials colliding on a shared
      // variable name (STRIPE_SECRET_KEY, MAILCOW_API_KEY). Reporting that as
      // drift invites "fixing" it by overwriting a live key with another
      // product's.
      const binding = bindingOf.get(key) || null;
      const envRepo = repoOfEnvFile(file);
      const crossProduct = Boolean(
        status === 'drift' && binding && !String(binding).split(',').includes(envRepo),
      );
      if (crossProduct) status = 'collision';

      totals[status] += 1;
      if (status === 'match') continue;
      rows.push({
        key,
        file,
        status,
        binding,
        envRepo,
        envLength: String(value ?? '').length,
        storeLength: key in store ? String(store[key]).length : null,
        // Equal lengths mean the same credential format — a rotation that
        // landed on one side only, rather than two unrelated values.
        sameShape: key in store && String(store[key]).length === String(value ?? '').length,
      });
    }
  }

  rows.sort((a, b) => (a.status === b.status ? a.key.localeCompare(b.key) : a.status.localeCompare(b.status)));
  return { totals, rows, storeKeyCount: Object.keys(store).filter((k) => !k.startsWith('__')).length };
}

export function defaultBrainDir() {
  return path.join(os.homedir(), '.agent', 'skills', 'total-recall');
}
