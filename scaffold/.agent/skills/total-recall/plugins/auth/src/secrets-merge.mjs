/**
 * Merge a stray secrets store into the host's single store.
 *
 * Per-repo stores grew when the CLI resolved its store from the cwd. This
 * folds one of them back in without losing or silently replacing anything:
 * a key the target lacks is imported with its metadata; a key with the same
 * value only gains the source's repo binding and tags; a key whose value
 * differs is a conflict and is never overwritten unless the operator names it,
 * either taking the source value (`take`) or importing it under a new,
 * app-specific name (`rename`). Values are never returned or logged.
 */
import crypto from 'node:crypto';
import { loadSecrets, saveSecrets, ensureMeta, appendAudit, META_KEY } from './secrets-gateway.mjs';
import { mergeSecretMeta, normalizeReposBinding, normalizeTags } from './secrets-store.mjs';

const KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9_.-]*$/;

/** Values can be strings or JSON (account lists); compare by content, not reference. */
const sameValue = (a, b) => (typeof a === 'string' || typeof b === 'string' ? a === b : JSON.stringify(a) === JSON.stringify(b));

function fingerprint(value) {
  return crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex').slice(0, 12);
}

/** The metadata worth showing an operator to decide a conflict. */
function summary(meta = {}, value) {
  return {
    fingerprint: value ? fingerprint(value) : null,
    provider: meta.provider || null,
    repos: Array.isArray(meta.repos) ? meta.repos : [],
    tags: Array.isArray(meta.tags) ? meta.tags : [],
    created_at: meta.created_at || null,
    updated_at: meta.updated_at || null,
    rotated_at: meta.rotated_at || null,
    tracking_status: meta.tracking_status || null,
    tracking_synced_at: meta.tracking_synced_at || null,
    key_valid: meta.key_valid ?? null,
  };
}

/**
 * @param {string} targetDir  brain dir of the single store
 * @param {string} sourceDir  brain dir of the stray store
 * @param {{ apply?: boolean, bindSame?: boolean, datesFromSource?: boolean, repo?: string, tags?: string[]|string, rename?: Record<string,string>,
 *   take?: string[], actor?: string }} [opts]
 * @returns {Promise<{ applied: boolean, imported: object[], same: object[], conflicts: object[], renamed: object[], taken: object[] }>}
 */
export async function mergeStore(targetDir, sourceDir, opts = {}) {
  if (!targetDir || !sourceDir) throw new Error('merge-store needs a target and a source store');
  if (targetDir === sourceDir) throw new Error('The source store is the target store');
  const rename = opts.rename || {};
  const take = new Set(opts.take || []);
  for (const [from, to] of Object.entries(rename)) {
    if (!KEY_PATTERN.test(from) || !KEY_PATTERN.test(to)) throw new Error(`Invalid rename ${from}=${to}`);
    if (take.has(from)) throw new Error(`${from} cannot be both renamed and taken`);
  }
  const bindRepo = opts.repo ? normalizeReposBinding(opts.repo) : [];
  const extraTags = opts.tags ? normalizeTags(opts.tags) : [];

  const source = ensureMeta(await loadSecrets(sourceDir));
  const target = ensureMeta(await loadSecrets(targetDir));
  const sourceKeys = Object.keys(source).filter((k) => k !== META_KEY);
  for (const k of [...Object.keys(rename), ...take]) {
    if (!sourceKeys.includes(k)) throw new Error(`${k} is not in the source store`);
  }

  const report = { applied: false, imported: [], same: [], conflicts: [], renamed: [], taken: [] };
  const now = new Date().toISOString();
  const withBinding = (meta) => ({
    repos: [...new Set([...(meta.repos || []), ...bindRepo])],
    tags: [...new Set([...(meta.tags || []), ...extraTags])],
  });

  for (const key of sourceKeys) {
    const value = source[key];
    if (value === undefined || value === null || value === '') continue;
    const sMeta = source[META_KEY].keys[key] || {};
    const name = rename[key] || key;
    const exists = name in target && target[name] !== '' && target[name] != null;
    const tMeta = target[META_KEY].keys[name] || {};

    if (rename[key]) {
      if (exists && !sameValue(target[name], value)) throw new Error(`Rename target ${name} already holds a different value`);
      target[name] = value;
      target[META_KEY].keys[name] = mergeSecretMeta({ ...sMeta, ...tMeta }, { ...withBinding(sMeta), scope: 'global', created_at: sMeta.created_at || now, updated_at: now, notes: sMeta.notes || `merged from ${key}`, provides: key });
      report.renamed.push({ from: key, to: name, ...summary(sMeta, value) });
      continue;
    }
    if (!exists) {
      target[name] = value;
      target[META_KEY].keys[name] = mergeSecretMeta(sMeta, { ...withBinding(sMeta), scope: 'global', created_at: sMeta.created_at || now, updated_at: sMeta.updated_at || now });
      report.imported.push({ key: name, ...summary(sMeta, value) });
      continue;
    }
    if (sameValue(target[name], value)) {
      // A store that was a copy of the global one says nothing about which keys
      // the repo uses, so equal keys gain its binding only when asked.
      if (opts.bindSame) target[META_KEY].keys[name] = mergeSecretMeta(tMeta, {
        repos: [...new Set([...(tMeta.repos || []), ...(sMeta.repos || []), ...bindRepo])],
        tags: [...new Set([...(tMeta.tags || []), ...(sMeta.tags || []), ...extraTags])],
      });
      // The value dates belong to the value: when it is identical, an older
      // source date is the true one (repairs a date a label edit bumped).
      if (opts.datesFromSource) {
        const cur = target[META_KEY].keys[name] || {};
        const fix = {};
        for (const f of ['updated_at', 'rotated_at']) if (sMeta[f] && (!cur[f] || sMeta[f] < cur[f])) fix[f] = sMeta[f];
        if (Object.keys(fix).length) { target[META_KEY].keys[name] = { ...cur, ...fix }; report.redated = (report.redated || 0) + 1; }
      }
      report.same.push({ key: name });
      continue;
    }
    if (take.has(key)) {
      const replaced = summary(tMeta, target[name]);
      target[name] = value;
      target[META_KEY].keys[name] = mergeSecretMeta(tMeta, { ...withBinding(tMeta), updated_at: now, notes: tMeta.notes || 'value taken from a merged store' });
      report.taken.push({ key: name, replaced, with: summary(sMeta, value) });
      continue;
    }
    report.conflicts.push({ key: name, target: summary(tMeta, target[name]), source: summary(sMeta, value) });
  }

  if (opts.apply) {
    await saveSecrets(targetDir, target);
    for (const row of [...report.imported, ...report.renamed, ...report.taken]) {
      appendAudit(targetDir, { action: 'merge', key: row.key || row.to, from_key: row.from || null, actor: opts.actor || 'cli' });
    }
    report.applied = true;
  }
  return report;
}
