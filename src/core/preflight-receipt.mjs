/**
 * Preflight receipt: the attestation that an agent read the mandatory skills and
 * received a ready capsule for one repository. It is an ephemeral per-machine
 * file (mode 0600), not application state: every hook reads it on every tool
 * call, so it stays a plain file. Gate decisions are what go to the event log.
 *
 * The file location and fields are unchanged from the original `tr-preflight`
 * command, so receipts written before this module remain valid.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const SKILLS = ['.agent/skills/total-recall/SKILL.md', '.agent/skills/ssss/SKILL.md'];
export const DEFAULT_MAX_AGE_MS = 30 * 60 * 1000;
export const ACK_COMMAND = 'total-recall tr-preflight --ack --task "<task>" --action read,edit,test';

const BIN = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'bin', 'total-recall.mjs');

/**
 * The nearest ancestor holding `.agent`, else the directory itself, with symlinks
 * resolved. A harness may report a symlinked path (`/var` for `/private/var`)
 * where the shell reports the real one; both must find the same receipt.
 */
export function findRoot(cwd = process.cwd()) {
  const resolve = (p) => { try { return fs.realpathSync(p); } catch { return path.resolve(p); } };
  const start = resolve(cwd);
  let dir = start;
  for (let i = 0; i < 40; i += 1) {
    if (fs.existsSync(path.join(dir, '.agent'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}

const rootKey = (root) => crypto.createHash('sha256').update(root).digest('hex').slice(0, 16);
const stateDir = (home) => path.join(home, '.agent', 'tr-preflight');
export const receiptPath = (root, home = os.homedir()) => path.join(stateDir(home), `${rootKey(root)}.json`);
export const consultPath = (root, home = os.homedir()) => path.join(stateDir(home), `consult-${rootKey(root)}.stamp`);

const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

/** Hashes of the mandatory skills, or the list of ones that are missing. */
export function skillHashes(root) {
  const hashes = {};
  const missing = [];
  for (const rel of SKILLS) {
    const full = path.join(root, rel);
    if (fs.existsSync(full)) hashes[rel] = sha256(full);
    else missing.push(rel);
  }
  return { hashes, missing };
}

export function readReceipt(root, home = os.homedir()) {
  try { return JSON.parse(fs.readFileSync(receiptPath(root, home), 'utf8')); } catch { return null; }
}

/**
 * @returns {{ ok: boolean, problems: string[], receipt: object|null, ageMs: number|null }}
 * `problems` read the same as the original command so existing guidance still fits.
 */
export function checkReceipt(root, { now = Date.now(), maxAgeMs, home = os.homedir() } = {}) {
  const { hashes, missing } = skillHashes(root);
  if (missing.length) return { ok: false, problems: missing.map((rel) => `missing mandatory skill: ${rel}`), receipt: null, ageMs: null };
  const receipt = readReceipt(root, home);
  if (!receipt) return { ok: false, problems: ['no preflight receipt for this repository'], receipt: null, ageMs: null };
  const problems = [];
  const ageMs = now - Date.parse(receipt.at || 0);
  // The window is decided when the receipt is written, so the hot path never loads configuration.
  const limit = maxAgeMs ?? (Number.isFinite(receipt.max_age_ms) && receipt.max_age_ms > 0 ? receipt.max_age_ms : DEFAULT_MAX_AGE_MS);
  if (!Number.isFinite(ageMs) || ageMs > limit) problems.push('preflight receipt is stale; re-run --ack');
  for (const [rel, hash] of Object.entries(hashes)) {
    if (!receipt.skills || receipt.skills[rel] !== hash) problems.push(`${rel} changed since the receipt; re-read and re-run --ack`);
  }
  if (receipt.ready !== true) problems.push('receipt does not record ready:true');
  return { ok: problems.length === 0, problems, receipt, ageMs: Number.isFinite(ageMs) ? ageMs : null };
}

/** Run this package's own CLI, so `ack` uses exactly the semantics every caller gets. */
function runSelf(args, cwd) {
  const r = spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: 'utf8', timeout: 60000 });
  return { ok: r.status === 0, out: r.stdout || '', err: r.stderr || '', code: r.status };
}

/**
 * Record a receipt after proving the capsule is ready and the rules verify.
 * `run` is injectable so the specs need no child process.
 */
export function acknowledge({ root, task = '', actions = 'read,edit,test', maxAgeMs, run = runSelf, now = Date.now(), home = os.homedir() }) {
  const { hashes, missing } = skillHashes(root);
  if (missing.length) return { ok: false, problems: missing.map((rel) => `missing mandatory skill: ${rel}`) };
  const context = run(['context', task || '(no task given)', '--action', actions], root);
  if (!/ready:true/.test(context.out)) {
    return { ok: false, problems: ['total-recall context did not return ready:true',
      context.code === 2 ? 'exit 2: capsule overflow; raise --budget or curate applicability, then retry' : `context exit=${context.code ?? '?'}`] };
  }
  const version = (context.out.match(/version:([0-9a-f]+)/) || [])[1] || null;
  const rules = run(['rules', 'verify'], root);
  if (!rules.ok) return { ok: false, problems: ['total-recall rules verify failed', (rules.out || rules.err).trim().split('\n').slice(-3).join(' | ')] };
  const receipt = { at: new Date(now).toISOString(), repo: root, task, actions, ready: true, capsule_version: version, skills: hashes, rules_verify: 'ok',
    ...(Number.isFinite(maxAgeMs) && maxAgeMs > 0 ? { max_age_ms: maxAgeMs } : {}) };
  const file = receiptPath(root, home);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  return { ok: true, problems: [], receipt, file };
}

/** Marks that Total Recall was consulted just now; read by the repository-sweep policy. */
export function touchConsult(root, { now = Date.now(), home = os.homedir() } = {}) {
  const file = consultPath(root, home);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, String(now), { mode: 0o600 });
}

export function lastConsultMs(root, { home = os.homedir() } = {}) {
  try { return Number(fs.readFileSync(consultPath(root, home), 'utf8')) || 0; } catch { return 0; }
}
