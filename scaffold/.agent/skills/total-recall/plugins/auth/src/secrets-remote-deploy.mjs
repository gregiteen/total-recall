/**
 * Push the Total Recall secrets-store SSOT to a remote deploy target over SSH.
 *
 * Generic by design — Total Recall core never hardcodes a hostname, path, or
 * product name. Every target (host, remote path, restart command) is
 * declared by the user in this repo's own remote-targets.json, the same way
 * repos/scopes are declared for export-env. This module only knows how to:
 *   1. build the same dotenv projection export-env already builds,
 *   2. fetch + merge it into a REMOTE file over SSH (never local disk),
 *   3. optionally run a user-declared restart command over SSH.
 *
 * Secret values never touch argv, shell history, or process listings on
 * either end — they're piped over stdin to a remote `cat > file` and never
 * echoed back. Callers must not log the returned `dotenv`/`map` fields.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildEnvProjection, mergeEnvManagedBlock, projectSlugFromPath } from './secrets-env-export.mjs';
import { resolveSecretsPath, loadSecrets, setSecret, secretValueFingerprint } from './secrets-store.mjs';
import { authState } from './metadata-state.mjs';

/**
 * @param {string} brainDir
 */
export function resolveRemoteTargetsPath(brainDir) {
  return path.join(path.dirname(resolveSecretsPath(brainDir)), 'remote-targets.json');
}

/**
 * @typedef {{
 *   name: string,
 *   host: string,
 *   user?: string,
 *   port?: number,
 *   remotePath: string,
 *   filename?: string,
 *   restartCommand?: string,
 *   sshOpts?: string[],
 *   keys?: string[],
 *   includeGlobal?: boolean,
 * }} RemoteTarget
 */

/** @param {string} brainDir @returns {RemoteTarget[]} */
export function loadRemoteTargets(brainDir) {
  const p = resolveRemoteTargetsPath(brainDir);
  const data = authState(p).read([]);
  if (!Array.isArray(data)) throw new Error('Invalid auth deployment target registry');
  return data;
}

/** @param {string} brainDir @param {RemoteTarget[]} targets */
export function saveRemoteTargets(brainDir, targets) {
  const p = resolveRemoteTargetsPath(brainDir);
  if (!Array.isArray(targets)) throw new Error('Invalid auth deployment target registry');
  const store = authState(p); store.read([]); store.write(targets);
  return store.documentPath;
}

/** @param {string} brainDir @param {RemoteTarget} target */
export function addRemoteTarget(brainDir, target) {
  if (!target?.name) throw new Error('Remote target requires a name');
  if (!target?.host) throw new Error('Remote target requires a host');
  if (!target?.remotePath) throw new Error('Remote target requires remotePath (remote directory)');
  const targets = loadRemoteTargets(brainDir).filter((t) => t.name !== target.name);
  targets.push({
    name: target.name,
    host: target.host,
    user: target.user || 'root',
    port: target.port || 22,
    remotePath: target.remotePath,
    filename: target.filename || '.env',
    restartCommand: target.restartCommand || null,
    sshOpts: target.sshOpts || [],
    keys: target.keys || undefined,
    includeGlobal: target.includeGlobal !== false,
  });
  const p = saveRemoteTargets(brainDir, targets);
  return { path: p, targets };
}

/** @param {string} brainDir @param {string} name */
export function removeRemoteTarget(brainDir, name) {
  const targets = loadRemoteTargets(brainDir);
  const next = targets.filter((t) => t.name !== name);
  const removed = next.length !== targets.length;
  if (removed) saveRemoteTargets(brainDir, next);
  return { removed, targets: next };
}

function sshBaseArgs(target) {
  return [
    '-o', 'BatchMode=yes',
    '-o', 'ConnectTimeout=8',
    '-p', String(target.port || 22),
    ...(target.sshOpts || []),
  ];
}

function sshDestination(target) {
  return `${target.user || 'root'}@${target.host}`;
}

/**
 * Run a remote command over SSH, optionally piping stdin. Never uses a
 * shell-interpolated string built from secret values — the remote command
 * itself is a fixed, non-secret string; the secret body travels over stdin.
 */
function runSsh(target, remoteCommand, { input } = {}) {
  const args = [...sshBaseArgs(target), sshDestination(target), remoteCommand];
  const result = spawnSync('ssh', args, {
    input: input != null ? input : undefined,
    encoding: 'utf8',
    timeout: 20000,
    maxBuffer: 16 * 1024 * 1024,
  });
  return result;
}

function quoteRemotePath(p) {
  // POSIX single-quote escaping — safe for arbitrary remote paths.
  return `'${String(p).replace(/'/g, `'\\''`)}'`;
}

/**
 * Fetch the current remote file body (empty string if absent/unreachable-file).
 */
function fetchRemoteFile(target, remoteFile) {
  const r = runSsh(target, `cat ${quoteRemotePath(remoteFile)} 2>/dev/null || true`);
  if (r.error || r.status !== 0) throw new Error(`SSH read failed for target "${target.name}": ${r.error?.message || (r.stderr || '').slice(0, 300)}`);
  if (r.error) throw new Error(`SSH connect failed for target "${target.name}": ${r.error.message}`);
  return r.stdout || '';
}

/**
 * Write body to the remote file via stdin (never as an argv/shell string),
 * then chmod 600. Uses a temp file + atomic rename on the remote side so a
 * dropped connection mid-write can't leave a truncated secrets file live.
 */
function writeRemoteFile(target, remoteFile, body) {
  const tmp = `${remoteFile}.tr-tmp.$$`;
  const cmd =
    `set -e; TMP="${remoteFile}.tr-tmp.$$"; ` +
    `cat > "$TMP" && chmod 600 "$TMP" && mv "$TMP" ${quoteRemotePath(remoteFile)}`;
  const r = runSsh(target, cmd, { input: body });
  if (r.error) throw new Error(`SSH write failed for target "${target.name}": ${r.error.message}`);
  if (r.status !== 0) {
    throw new Error(
      `Remote write failed for target "${target.name}" (exit ${r.status}): ${(r.stderr || '').slice(0, 500)}`,
    );
  }
  return true;
}

/**
 * Deploy the SSOT projection to one configured remote target.
 *
 * @param {string} brainDir
 * @param {string} targetName
 * @param {{ dryRun?: boolean, keys?: string[], skipRestart?: boolean }} opts
 */
export async function deployEnvToRemote(brainDir, targetName, opts = {}) {
  const targets = loadRemoteTargets(brainDir);
  const target = targets.find((t) => t.name === targetName);
  if (!target) {
    throw new Error(
      `Unknown remote target "${targetName}". Configure one first: npx total-recall auth secret remote add ${targetName} --host <host> --path </remote/dir>`,
    );
  }

  // Match the same projection local `export-env --path .` builds: repo-bound
  // secrets (set with --repo <name>) only resolve when the caller's project
  // slug is passed through. Without this, deployEnvToRemote silently dropped
  // every repo-scoped key and pushed only unbound/global ones — the opposite
  // of what --repo scoping is for. cwd is the right default since this CLI
  // is always invoked from the repo root (same assumption --path . makes).
  const projectPath = opts.projectPath || process.cwd();
  const projection = await buildEnvProjection(brainDir, {
    includeGlobal: target.includeGlobal !== false,
    keys: opts.keys?.length ? opts.keys : target.keys,
    projectPath,
    projectSlug: opts.projectSlug || projectSlugFromPath(projectPath),
    rename: opts.rename,
  });

  const remoteFile = path.posix.join(target.remotePath, target.filename || '.env');

  if (opts.dryRun) {
    return {
      dryRun: true,
      target: target.name,
      host: target.host,
      remoteFile,
      keys: projection.keys,
      count: projection.count,
    };
  }

  if (!projection.count) {
    return {
      dryRun: false,
      target: target.name,
      host: target.host,
      remoteFile,
      keys: [],
      count: 0,
      skipped: 'no matching keys',
    };
  }

  const existing = fetchRemoteFile(target, remoteFile);
  const merged = mergeEnvManagedBlock(existing, projection.body, { partial: Boolean(opts.keys?.length) });
  writeRemoteFile(target, remoteFile, merged);

  let restarted = false;
  let restartOutput = null;
  if (target.restartCommand && !opts.skipRestart) {
    const r = runSsh(target, target.restartCommand);
    restarted = r.status === 0;
    restartOutput = (r.stdout || '') + (r.stderr || '');
  }

  return {
    dryRun: false,
    target: target.name,
    host: target.host,
    remoteFile,
    keys: projection.keys,
    count: projection.count,
    restarted,
    restartOutput: restartOutput ? restartOutput.slice(0, 2000) : null,
  };
}

/**
 * Parse dotenv text into key -> { value, count }. The last assignment wins, as
 * in dotenv; `count` exposes duplicates, which loaders resolve differently.
 */
export function parseDotenv(text) {
  const out = new Map();
  for (const raw of String(text || '').split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(raw);
    if (!m) continue;
    let value = m[2].trim();
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
      try { value = JSON.parse(value); } catch { value = value.slice(1, -1); }
    } else if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, '');
    }
    out.set(m[1], { value, count: (out.get(m[1])?.count || 0) + 1 });
  }
  return out;
}

function findTarget(brainDir, targetName) {
  const target = loadRemoteTargets(brainDir).find((t) => t.name === targetName);
  if (!target) throw new Error(`Unknown remote target "${targetName}". List them with: total-recall auth secret remote list`);
  return target;
}

/**
 * Compare a deployed remote file with what the store would project there, key
 * by key, by value fingerprint. Values never leave this process.
 *
 * @param {string} brainDir
 * @param {string} targetName
 * @param {{ keys?: string[], projectPath?: string }} opts
 */
export async function verifyRemote(brainDir, targetName, opts = {}) {
  const target = findTarget(brainDir, targetName);
  const projectPath = opts.projectPath || process.cwd();
  const projection = await buildEnvProjection(brainDir, {
    includeGlobal: target.includeGlobal !== false,
    keys: opts.keys?.length ? opts.keys : target.keys,
    projectPath,
    projectSlug: projectSlugFromPath(projectPath),
  });
  const remoteFile = path.posix.join(target.remotePath, target.filename || '.env');
  const remote = parseDotenv(fetchRemoteFile(target, remoteFile));
  const projected = new Set(projection.entries.map(([key]) => key));
  const rows = projection.entries.map(([key, value]) => {
    const found = remote.get(key);
    const status = !found ? 'missing'
      : secretValueFingerprint(found.value) === secretValueFingerprint(value) ? 'match' : 'differs';
    return { key, status, duplicates: found ? found.count - 1 : 0 };
  });
  return {
    target: target.name,
    host: target.host,
    remoteFile,
    rows,
    remoteOnly: [...remote.keys()].filter((key) => !projected.has(key)),
    ok: rows.every((row) => row.status === 'match' && !row.duplicates),
  };
}

/**
 * Move named keys out of a pm2 app's captured environment into the store, so
 * the app can run from the store's projection instead. pm2 keeps the
 * environment a process was first started with and lets it override the
 * app's env file, which hides stale and unneeded credentials from the store.
 * Only the keys asked for are read; nothing is printed.
 *
 * @param {string} brainDir
 * @param {string} targetName
 * @param {{ app: string, keys: string[], apply?: boolean, overwrite?: boolean, repos?: string[] }} opts
 */
export async function importFromPm2(brainDir, targetName, opts = {}) {
  if (!opts.app) throw new Error('import-pm2 requires --app <pm2 process name>');
  if (!opts.keys?.length) throw new Error('import-pm2 requires --keys: import only what the app needs');
  const target = findTarget(brainDir, targetName);
  const r = runSsh(target, 'pm2 jlist');
  if (r.error || r.status !== 0) throw new Error(`pm2 jlist failed on "${target.name}": ${r.error?.message || (r.stderr || '').slice(0, 300)}`);
  const raw = r.stdout || '';
  let list;
  // pm2 may print "[PM2] …" notices before the JSON array; start where the array does.
  const start = raw.search(/^\[\s*(?:\{|\])/m);
  try { list = JSON.parse(raw.slice(start)); } catch { throw new Error('pm2 jlist did not return JSON'); }
  if (start === -1 || !Array.isArray(list)) throw new Error('pm2 jlist did not return JSON');
  const proc = list.find((p) => p.name === opts.app);
  if (!proc) throw new Error(`pm2 process "${opts.app}" not found on "${target.name}"`);
  const env = proc.pm2_env?.env || {};
  const secrets = await loadSecrets(brainDir);
  const rows = [];
  for (const key of opts.keys) {
    const value = env[key] ?? proc.pm2_env?.[key];
    if (value == null || value === '') { rows.push({ key, status: 'absent', applied: false }); continue; }
    const stored = secrets[key];
    const status = stored == null || stored === '' ? 'new' : String(stored) === String(value) ? 'same' : 'conflict';
    let applied = false;
    if (opts.apply && (status === 'new' || (status === 'conflict' && opts.overwrite))) {
      await setSecret(brainDir, key, String(value), opts.repos?.length ? { repos: opts.repos } : {});
      applied = true;
    }
    rows.push({ key, status, applied });
  }
  return { target: target.name, app: opts.app, rows };
}

/**
 * Deploy to every remote target that has this key bound via `keys`, or to
 * every target when the key list is unset (target opts into "all keys").
 */
export async function deployKeyToRemotes(brainDir, key, opts = {}) {
  const targets = loadRemoteTargets(brainDir);
  const matching = targets.filter((t) => !t.keys?.length || t.keys.includes(key));
  const results = [];
  for (const t of matching) {
    try {
      results.push(await deployEnvToRemote(brainDir, t.name, opts));
    } catch (err) {
      results.push({ target: t.name, host: t.host, ok: false, error: err.message });
    }
  }
  return results;
}
