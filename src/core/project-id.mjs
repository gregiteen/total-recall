/**
 * Stable per-project identity: a random UUID kept in the project brain's
 * config/brain.json (`project_id`) and mirrored into the project registry.
 * Never derived from names or paths.
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

function brainJsonPath(brainDir) {
  return path.join(brainDir, 'config', 'brain.json');
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tmp, file);
}

/** The project id stored for a project brain, or null. */
export function readProjectId(brainDir) {
  return readJson(brainJsonPath(brainDir), {}).project_id || null;
}

/**
 * Return the project's id, creating a random UUID on first use.
 * @returns {{ project_id: string, created: boolean }}
 */
export function ensureProjectId(brainDir) {
  const file = brainJsonPath(brainDir);
  const cfg = readJson(file, {});
  if (cfg.project_id) return { project_id: cfg.project_id, created: false };
  cfg.project_id = randomUUID();
  writeJsonAtomic(file, cfg);
  return { project_id: cfg.project_id, created: true };
}

/**
 * Give every registered project an id and make the registry agree with each
 * project's brain.json (the brain.json id wins).
 * @returns {{ total: number, created: number, synced: number, missing_brain: number }}
 */
export function repairProjectIds(globalBrainDir) {
  const registryPath = path.join(globalBrainDir, 'config', 'project-registry.json');
  const list = readJson(registryPath, []);
  const out = { total: 0, created: 0, synced: 0, missing_brain: 0 };
  if (!Array.isArray(list)) return out;
  for (const row of list) {
    out.total++;
    if (!row?.brainDir || !fs.existsSync(row.brainDir)) {
      out.missing_brain++;
      continue;
    }
    const { project_id, created } = ensureProjectId(row.brainDir);
    if (created) out.created++;
    if (row.project_id !== project_id) {
      row.project_id = project_id;
      out.synced++;
    }
  }
  if (out.synced) writeJsonAtomic(registryPath, list);
  return out;
}
