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
import { detectProjectBrain } from './brain-locate.mjs';

export const SKILLS = ['.agent/skills/total-recall/SKILL.md', '.agent/skills/ssss/SKILL.md'];
export const DEFAULT_MAX_AGE_MS = 30 * 60 * 1000;
export const ACK_COMMAND = 'total-recall tr-preflight --ack --task "<task>" --action read,edit,test';
/**
 * The longest `ack` trusts that a session still has a capsule it received. A harness can compact
 * a session without telling anyone, so this is the bound for every harness, including one whose
 * hook reports compaction.
 */
export const CAPSULE_REFRESH_MS = 2 * 60 * 60 * 1000;
/** How long the gate's note about who is running a command stays usable. A later command gets no identity and prints its capsule. */
const CALLER_WINDOW_MS = 15 * 1000;

const BIN = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'bin', 'total-recall.mjs');

/**
 * The nearest agent or Git worktree root, with symlinks resolved. A checkout
 * without its own skills still keeps its own receipt.
 */
export function findRoot(cwd = process.cwd()) {
  const resolve = (p) => { try { return fs.realpathSync(p); } catch { return path.resolve(p); } };
  const start = resolve(cwd);
  const home = resolve(os.homedir());
  const skills = resolve(path.join(home, '.agent', 'skills'));
  if (start === skills || start.startsWith(skills + path.sep)) return home;
  let dir = start;
  for (let i = 0; i < 40; i += 1) {
    if (fs.existsSync(path.join(dir, '.agent')) || fs.existsSync(path.join(dir, '.git'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}

const rootKey = (root) => crypto.createHash('sha256').update(root).digest('hex').slice(0, 16);
const stateDir = (home) => path.join(home, '.agent', 'tr-preflight');

/**
 * Stamps and the decision log are bookkeeping: they never decide anything, so a write that
 * fails must never reach the gate, which denies on any error. A hook can run inside a
 * harness's sandbox that refuses writes to the home folder, so they fall back to the temp
 * folder, and readers look in both.
 */
const fallbackFile = (file) => {
  const owner = crypto.createHash('sha256').update(path.dirname(file)).digest('hex').slice(0, 12);
  return path.join(os.tmpdir(), `tr-preflight-${owner}`, path.basename(file));
};

/** @returns {string|null} where it was written, or null when nowhere would take it */
function writeBookkeeping(file, write) {
  for (const target of [file, fallbackFile(file)]) {
    try {
      fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
      write(target);
      return target;
    } catch { /* try the next place */ }
  }
  return null;
}

const writeStamp = (file, now) => writeBookkeeping(file, (target) => fs.writeFileSync(target, String(now), { mode: 0o600 }));

function readStamp(file) {
  let latest = 0;
  for (const target of [file, fallbackFile(file)]) {
    try { latest = Math.max(latest, Number(fs.readFileSync(target, 'utf8')) || 0); } catch { /* not written here */ }
  }
  return latest;
}

/** The later of a record and its temp-folder copy, or null when neither was written. */
function newestRecord(file) {
  let newest = null;
  for (const target of [file, fallbackFile(file)]) {
    try {
      const record = JSON.parse(fs.readFileSync(target, 'utf8'));
      if (!newest || record.at > newest.at) newest = record;
    } catch { /* not written here */ }
  }
  return newest;
}

const stateDirs = (home) => [stateDir(home), path.dirname(fallbackFile(path.join(stateDir(home), 'x')))];
export const receiptPath = (root, home = os.homedir()) => path.join(stateDir(home), `${rootKey(root)}.json`);
export const consultPath = (root, home = os.homedir()) => path.join(stateDir(home), `consult-${rootKey(root)}.stamp`);

const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

/** A capsule belongs to a brain, so a subfolder or nested checkout shares its parent's. */
const brainRootOf = (root) => detectProjectBrain(root)?.projectRoot || root;

/**
 * Hashes of the mandatory skills, or the list of ones that are missing. A repository with no copy
 * of its own uses its brain's, then the machine's shared copy, so an agent can acknowledge anywhere.
 */
export function skillHashes(root, home = os.homedir()) {
  const hashes = {};
  const missing = [];
  const files = [];
  for (const rel of SKILLS) {
    const own = path.join(root, rel);
    const full = fs.existsSync(own) ? own : [brainRootOf(root), home].map((dir) => path.join(dir, rel)).find((candidate) => fs.existsSync(candidate));
    if (full) { hashes[rel] = sha256(full); files.push(full); } else missing.push(rel);
  }
  return { hashes, missing, files };
}

export function readReceipt(root, home = os.homedir()) {
  const file = receiptPath(root, home);
  let newest = null;
  for (const target of [file, fallbackFile(file)]) {
    try {
      const receipt = JSON.parse(fs.readFileSync(target, 'utf8'));
      if (!newest || Date.parse(receipt.at || 0) > Date.parse(newest.at || 0)) newest = receipt;
    } catch { /* not written here */ }
  }
  return newest;
}

/**
 * @returns {{ ok: boolean, problems: string[], receipt: object|null, ageMs: number|null }}
 * `problems` read the same as the original command so existing guidance still fits.
 */
export function checkReceipt(root, { now = Date.now(), maxAgeMs, home = os.homedir() } = {}) {
  const { hashes, missing } = skillHashes(root, home);
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
  return { ok: problems.length === 0, problems, receipt, ageMs: Number.isFinite(ageMs) ? ageMs : null, limitMs: limit };
}

/**
 * The receipt that lets this agent work here. An agent is not bound to one repository: what it
 * acknowledged goes with it, so the receipt from where it last acknowledged counts wherever it is
 * now. With no session there is no agent to follow, so this directory's receipt decides.
 */
export function checkAgentReceipt(root, session, { home = os.homedir(), ...options } = {}) {
  const here = checkReceipt(root, { home, ...options });
  if (here.ok || !session) return here;
  const acknowledgedIn = lastSessionAck(session, { home })?.root;
  return acknowledgedIn && acknowledgedIn !== root ? checkReceipt(acknowledgedIn, { home, ...options }) : here;
}

/**
 * For a caller nobody can name that another agent is answerable for: a subagent, or a process
 * started on an agent's behalf. A fresh receipt anywhere on this machine counts.
 */
export function checkAnyReceipt(root, { home = os.homedir(), ...options } = {}) {
  const here = checkReceipt(root, { home, ...options });
  if (here.ok) return here;
  const repos = new Set();
  for (const dir of stateDirs(home)) {
    let names = [];
    try { names = fs.readdirSync(dir); } catch { continue; }
    for (const name of names) {
      if (!/^[0-9a-f]{16}\.json$/.test(name)) continue;
      try { repos.add(JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')).repo); } catch { /* not a receipt */ }
    }
  }
  for (const repo of repos) {
    if (!repo || repo === root) continue;
    const there = checkReceipt(repo, { home, ...options });
    if (there.ok) return there;
  }
  return here;
}

/** Run this package's own CLI, so `ack` uses exactly the semantics every caller gets. */
function runSelf(args, cwd) {
  const r = spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: 'utf8', timeout: 60000 });
  return { ok: r.status === 0, out: r.stdout || '', err: r.stderr || '', code: r.status };
}

/**
 * Record a receipt after proving the capsule is ready and the rules verify, and hand back the
 * capsule, so acknowledging means receiving it. `capsule` is null only when this session already
 * received one with the same rules and skills within CAPSULE_REFRESH_MS. A caller that cannot name
 * its session gets the capsule. Task text is not compared: most re-acknowledgements reword it, and
 * the rules do not depend on it.
 * `run` is injectable so the specs need no child process.
 */
export function acknowledge({ root, task = '', actions = 'read,edit,test', maxAgeMs, run = runSelf, now = Date.now(), home = os.homedir(), session = null }) {
  const { hashes, missing, files } = skillHashes(root, home);
  if (missing.length) return { ok: false, problems: missing.map((rel) => `missing mandatory skill: ${rel}`) };
  const context = run(['context', task || '(no task given)', '--action', actions], root);
  if (!/ready:true/.test(context.out)) {
    return { ok: false, problems: ['total-recall context did not return ready:true',
      context.code === 2 ? 'exit 2: capsule overflow; the budget cannot hold every rule even compacted, so retry with the required_budget it reports' : `context exit=${context.code ?? '?'}`] };
  }
  const version = (context.out.match(/version:([0-9a-f]+)/) || [])[1] || null;
  const rules = run(['rules', 'verify'], root);
  const ruleProblems = String(rules.out || '').split('\n').filter((line) => line.startsWith('✖ '));
  // A rule edited after curation already reverts to its full text, so nothing is lost. One
  // agent editing a rule must not stop every other agent from acknowledging.
  const onlyStale = ruleProblems.length > 0 && ruleProblems.every((line) => line.startsWith('✖ stale curation:'));
  if (!rules.ok && !onlyStale) return { ok: false, problems: ['total-recall rules verify failed', (rules.out || rules.err).trim().split('\n').slice(0, 5).join(' | ')] };
  const rulesHash = (context.out.match(/\brules_hash:([0-9a-f]+)/) || [])[1] || null;
  const last = session && rulesHash ? lastCapsuleDelivery(root, session, { home }) : null;
  const unchanged = Boolean(last && last.rules_hash === rulesHash && JSON.stringify(last.skills) === JSON.stringify(hashes) && now - last.at < CAPSULE_REFRESH_MS);
  const receipt = { at: new Date(now).toISOString(), repo: root, task, actions, ready: true, capsule_version: version, rules_hash: rulesHash, capsule: unchanged ? 'unchanged' : 'printed', skills: hashes, rules_verify: 'ok',
    ...(Number.isFinite(maxAgeMs) && maxAgeMs > 0 ? { max_age_ms: maxAgeMs } : {}) };
  // A sandboxed tool may not be able to write to the home folder, and that must not lock it out.
  const file = writeBookkeeping(receiptPath(root, home), (target) => fs.writeFileSync(target, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 }));
  if (!file) return { ok: false, problems: [`could not write the receipt to ${receiptPath(root, home)} or the temp folder`] };
  pruneSessionStamps(home, now);
  if (session && !unchanged) recordCapsuleDelivery(root, session, { rulesHash, skills: hashes, task }, { home, now });
  return { ok: true, problems: [], receipt, file, skillFiles: files,
    // The notice tells a reader of `context` to go and run this command, which has just happened.
    capsule: unchanged ? null : context.out.replace(/^PREFLIGHT: .*\n/m, '').trimEnd(),
    unchanged: unchanged ? { ageMs: now - last.at } : null,
    ...(onlyStale ? { notes: ruleProblems.map((line) => line.slice(2)) } : {}) };
}

const callerPath = (root, verb, home) => path.join(stateDir(home), scoped(`caller-${verb}`, root));

/**
 * A hook is told the session and the command it starts is not, so the gate leaves a note for a
 * bare `ack` or `context` to take. Harness-neutral: any harness whose hook sends a session id works.
 */
export function noteCaller(root, session, verb, command, { home = os.homedir(), now = Date.now() } = {}) {
  writeBookkeeping(callerPath(root, verb, home), (target) => fs.writeFileSync(target, JSON.stringify({ session, command, at: now }), { mode: 0o600 }));
}

/**
 * The session that was about to run this command, once only. A note that is old or for another
 * command is left alone and answers null, and null means the capsule gets printed, so every doubt
 * costs tokens and never a skipped capsule.
 */
export function takeCaller(root, verb, { task = '', home = os.homedir(), now = Date.now() } = {}) {
  const file = callerPath(root, verb, home);
  for (const target of [file, fallbackFile(file)]) {
    let note;
    try { note = JSON.parse(fs.readFileSync(target, 'utf8')); } catch { continue; }
    if (now - note.at > CALLER_WINDOW_MS || !String(note.command).includes(task)) continue;
    try { fs.rmSync(target); } catch { /* it expires by itself */ }
    return note.session;
  }
  return null;
}

const capsulePath = (root, session, home) => path.join(stateDir(home), scoped('capsule', brainRootOf(root), session));

/** This session has just been handed a capsule with these rules and skills. */
export function recordCapsuleDelivery(root, session, { rulesHash, skills, task = '' }, { home = os.homedir(), now = Date.now() } = {}) {
  writeBookkeeping(capsulePath(root, session, home), (target) => fs.writeFileSync(target, JSON.stringify({ at: now, rules_hash: rulesHash, skills, task }), { mode: 0o600 }));
}

export function lastCapsuleDelivery(root, session, { home = os.homedir() } = {}) {
  return newestRecord(capsulePath(root, session, home));
}

/**
 * The session no longer has any capsule it was handed, in any repository, because the harness
 * compacted or cleared it. It is told again about a repository's brain too.
 */
export function forgetCapsuleDeliveries(session, { home = os.homedir() } = {}) {
  const suffix = `-${sessionKey(session)}.stamp`;
  for (const dir of stateDirs(home)) {
    let names = [];
    try { names = fs.readdirSync(dir); } catch { continue; }
    for (const name of names) {
      if (!/^(capsule|arrival)-/.test(name) || !name.endsWith(suffix)) continue;
      try { fs.rmSync(path.join(dir, name)); } catch { /* the capsule's own time limit still applies */ }
    }
  }
}

const arrivalPath = (root, session, home) => path.join(stateDir(home), scoped('arrival', root, session));

/** This session has been told about this brain, so it hears that once. */
export function markArrival(root, session, { home = os.homedir(), now = Date.now() } = {}) {
  writeStamp(arrivalPath(root, session, home), now);
}

export function lastArrivalMs(root, session, { home = os.homedir() } = {}) {
  return readStamp(arrivalPath(root, session, home));
}

/** Marks that Total Recall was consulted just now; read by the repository-sweep policy. */
export function touchConsult(root, { now = Date.now(), home = os.homedir() } = {}) {
  writeStamp(consultPath(root, home), now);
}

export function lastConsultMs(root, { home = os.homedir() } = {}) {
  return readStamp(consultPath(root, home));
}

/** A session id is whatever the harness sends, so it is hashed before it names a file. */
export const sessionKey = (session) => crypto.createHash('sha256').update(String(session)).digest('hex').slice(0, 16);
const scoped = (stem, root, session) => `${stem}-${rootKey(root)}${session ? `-${sessionKey(session)}` : ''}.stamp`;
/** What belongs to the agent goes with it between repositories. With no session, the directory is all there is to go on. */
const agentScoped = (stem, root, session) => `${stem}-${session ? sessionKey(session) : rootKey(root)}.stamp`;

export const routePath = (root, home = os.homedir(), session = null) => path.join(stateDir(home), agentScoped('route', root, session));

/** Marks that this agent's current task was routed just now, or this directory's when it has no session. */
export function markRouted(root, { home = os.homedir(), now = Date.now(), session = null } = {}) {
  writeStamp(routePath(root, home, session), now);
}

export function lastRoutedMs(root, { home = os.homedir(), session = null } = {}) {
  return readStamp(routePath(root, home, session));
}

const routeWarnedPath = (root, home, session) => path.join(stateDir(home), agentScoped('route-warned', root, session));

/** Marks that this session has been told about routing, so one acknowledgement warns only once. */
export function markRouteWarned(root, { home = os.homedir(), now = Date.now(), session = null } = {}) {
  writeStamp(routeWarnedPath(root, home, session), now);
}

export function lastRouteWarnedMs(root, { home = os.homedir(), session = null } = {}) {
  return readStamp(routeWarnedPath(root, home, session));
}

const sessionAckPath = (session, home) => path.join(stateDir(home), `session-ack-${sessionKey(session)}.stamp`);
const delegatedPath = (root, home) => path.join(stateDir(home), scoped('delegated', root));

/** The gate saw this session run the acknowledgement in this repository. */
export function markSessionAck(root, session, { home = os.homedir(), now = Date.now() } = {}) {
  writeBookkeeping(sessionAckPath(session, home), (target) => fs.writeFileSync(target, JSON.stringify({ at: now, root }), { mode: 0o600 }));
}

/** When and where this session last acknowledged, or null. */
export function lastSessionAck(session, { home = os.homedir() } = {}) {
  return newestRecord(sessionAckPath(session, home));
}

/** An acknowledged session started a subagent here. */
export function markDelegated(root, { home = os.homedir(), now = Date.now() } = {}) {
  writeStamp(delegatedPath(root, home), now);
}

export function lastDelegatedMs(root, { home = os.homedir() } = {}) {
  return readStamp(delegatedPath(root, home));
}

/**
 * False when no stamp can be kept anywhere, so a session's acknowledgement could never be
 * recorded. It creates a new file, because rewriting an existing one can succeed where
 * creating one would not.
 */
export function canKeepStamps({ home = os.homedir(), now = Date.now() } = {}) {
  const probe = path.join(stateDir(home), `stamp-probe-${process.pid}-${now}`);
  const written = writeBookkeeping(probe, (target) => fs.writeFileSync(target, '', { mode: 0o600, flag: 'wx' }));
  if (written) { try { fs.rmSync(written); } catch { /* left behind, harmless */ } }
  return written !== null;
}

/**
 * Whether this session may pass on the repository's receipt.
 * - A harness that sends no session id keeps the repository rule.
 * - A session passes once it has acknowledged, in any repository, for the receipt's window. The
 *   receipt need not be its own: a sandbox can stop it writing one, and it has still read the capsule.
 * - Some harnesses give a subagent its own session with no link to its parent. A session that has
 *   never acknowledged counts as delegated while an acknowledged session's subagent window is open.
 *   An unrelated agent starting here in that window also passes; keeping subagents unblocked wins.
 * - If no stamp can be kept, the acknowledgement could never be recorded, so it is not required.
 */
export function sessionHasStanding(root, session, { limitMs = DEFAULT_MAX_AGE_MS, home = os.homedir(), now = Date.now() } = {}) {
  if (!session) return true;
  const own = lastSessionAck(session, { home })?.at;
  if (own) { if (now - own < limitMs) return true; } else if (now - lastDelegatedMs(root, { home }) < limitMs) return true;
  return !canKeepStamps({ home, now });
}

/** Session stamps are one small file per session, so old ones go when anyone acknowledges. */
function pruneSessionStamps(home, now, keepMs = 7 * 24 * 60 * 60 * 1000) {
  const pattern = /^((session-ack|route|route-warned)-[0-9a-f]{16}|(session-ack|route|route-warned|capsule|arrival)-[0-9a-f]+-[0-9a-f]{16}|caller-(ack|context|check)-[0-9a-f]+)\.stamp$/;
  for (const dir of stateDirs(home)) {
    let names = [];
    try { names = fs.readdirSync(dir); } catch { continue; }
    for (const name of names) {
      if (!pattern.test(name)) continue;
      const file = path.join(dir, name);
      try { if (now - fs.statSync(file).mtimeMs > keepMs) fs.rmSync(file); } catch { /* not worth stopping for */ }
    }
  }
}

export const decisionsLogPath = (home = os.homedir()) => path.join(stateDir(home), 'decisions.jsonl');

/** Append a real gate decision to the persistent decisions log (ENFORCE-R5). */
export function recordDecision(entry, { home = os.homedir(), now = Date.now() } = {}) {
  const record = { at: new Date(now).toISOString(), ...entry };
  const line = `${JSON.stringify(record)}\n`;
  return writeBookkeeping(decisionsLogPath(home), (target) => fs.appendFileSync(target, line, { mode: 0o600 })) ? record : null;
}

/** Read recent gate decisions for compliance reporting. */
export function readDecisions({ home = os.homedir(), limit = 1000 } = {}) {
  const file = decisionsLogPath(home);
  const records = [];
  for (const target of [file, fallbackFile(file)]) {
    let text;
    try { text = fs.readFileSync(target, 'utf8'); } catch { continue; }
    for (const line of text.split('\n')) {
      if (!line) continue;
      try { records.push(JSON.parse(line)); } catch { /* a partial line */ }
    }
  }
  records.sort((a, b) => String(a.at).localeCompare(String(b.at)));
  return records.slice(-limit);
}
