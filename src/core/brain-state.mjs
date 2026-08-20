/**
 * brain-state — the one answer to "is this file a template, or does it belong
 * to a single brain?"
 *
 * Every consumer of this question used to keep its own list: sync-scaffold had
 * an EXCLUDES array, sync-repo had STATE_DIRS/STATE_FILES, and the scaffold
 * itself had whatever had been copied into it. They drifted, and each drift
 * shipped or destroyed a file:
 *
 *   3.25.0  skills-registry/index.yaml went out in the tarball carrying 562
 *           lines of /Users/<name>/... and the names of 16 unrelated repos
 *   3.25.2  research-queue.jsonl went out carrying the developer's queued
 *           topics, and a template sync would have replaced one repo's 7 real
 *           entries and its 2,462-line skills catalog
 *
 * Adding a path here fixes it everywhere at once, which is the entire point.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const BRAIN_STATE_MANIFEST = path.join(HERE, 'brain-state.json');

function load() {
  const raw = JSON.parse(fs.readFileSync(BRAIN_STATE_MANIFEST, 'utf8'));
  return {
    dirs: new Set(raw.dirs || []),
    files: new Set(raw.files || []),
    extensions: new Set(raw.extensions || []),
  };
}

export const BRAIN_STATE = load();

/**
 * Is this path (relative to a brain root) state rather than a template?
 *
 * Matches a state directory at ANY depth — `skills-registry/index.yaml` and
 * `a/b/skills-registry/c.yaml` are both state. Checking only the first segment
 * is how nested state slipped through before.
 *
 * @param {string} relPath e.g. "references/api-reference.md"
 * @returns {boolean}
 */
export function isBrainState(relPath) {
  if (!relPath) return false;
  const parts = String(relPath).split(/[\\/]+/).filter(Boolean);
  if (parts.some((seg) => BRAIN_STATE.dirs.has(seg))) return true;
  const base = parts[parts.length - 1];
  if (!base) return false;
  if (BRAIN_STATE.files.has(base)) return true;
  return BRAIN_STATE.extensions.has(path.extname(base));
}

/** rsync-style patterns, for callers that shell out instead of walking. */
export function rsyncExcludes() {
  return [
    ...[...BRAIN_STATE.dirs].map((d) => `${d}/`),
    ...BRAIN_STATE.files,
    ...[...BRAIN_STATE.extensions].map((e) => `*${e}`),
  ];
}

/**
 * Every state path found under a brain/scaffold root. Used by the gate that
 * fails a release when the shipped scaffold carries one.
 *
 * @param {string} root
 * @returns {string[]} paths relative to root
 */
export function findBrainState(root) {
  const hits = [];
  if (!fs.existsSync(root)) return hits;
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name);
      const rel = path.relative(root, abs);
      if (isBrainState(rel)) { hits.push(rel); continue; }
      if (e.isDirectory()) walk(abs);
    }
  };
  walk(root);
  return hits.sort();
}
