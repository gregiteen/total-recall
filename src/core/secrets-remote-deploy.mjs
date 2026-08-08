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
import { resolveSecretsPath } from './secrets-store.mjs';

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
  if (!fs.existsSync(p)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/** @param {string} brainDir @param {RemoteTarget[]} targets */
export function saveRemoteTargets(brainDir, targets) {
  const p = resolveRemoteTargetsPath(brainDir);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, `${JSON.stringify(targets, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  try {
    fs.chmodSync(p, 0o600);
  } catch {
    /* windows / fs without chmod */
  }
  return p;
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
      `Unknown remote target "${targetName}". Configure one first: npx total-recall secret remote add ${targetName} --host <host> --path </remote/dir>`,
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
  const merged = mergeEnvManagedBlock(existing, projection.body);
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
