/**
 * Auth-owned custody for the deploy wizard's remote credential hand-off.
 *
 * Core's deploy command never opens, copies or writes a secrets store. It asks
 * this owner to provision named keys onto a freshly reachable host:
 *   - only the keys the caller names are projected, never the whole store, and
 *     only keys that are unbound or bound to the explicit project path;
 *   - the complete projection is built and validated before any SSH, so a
 *     refusal never follows a partial remote write;
 *   - the projection travels over SSH stdin and merges into the remote .env
 *     managed block with one atomic rename, leaving the remote's existing .env
 *     content and its own encrypted store untouched;
 *   - targets and SSH options outside a small allow-list are denied;
 *   - outcomes carry fixed messages and key names only: no store, SSH or
 *     remote stderr text, and never a value.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { resolveSecretsPath, loadSecrets, listSecretsMeta } from './secrets-store.mjs';
import { buildEnvProjection, projectSlugFromPath, secretMatchesTarget } from './secrets-env-export.mjs';
import { pushProjection, sshBaseArgs, sshDestination } from './secrets-remote-deploy.mjs';

const KEY_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const HOST = /^(?!-)[A-Za-z0-9.-]{1,253}$|^[0-9A-Fa-f:]{2,45}$/;
const USER = /^[a-z_][a-z0-9_-]{0,31}$/;
const REMOTE_DIR = /^(?!-)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._\/-]{1,200}$/;
const FILENAME = /^(?!-)(?!\.\.?$)[A-Za-z0-9._-]{1,100}$/;
const SAFE_LOCAL_PATH = /^\/[^\0\r\n]{0,500}$/;
const STRICT_HOST_KEY = new Set(['accept-new', 'yes']);

function fail(code, message, action, extra = {}) {
  return { ok: false, code, message, action, ...extra };
}

/** Allow only `-i <absolute key path>` and `-o StrictHostKeyChecking=accept-new|yes`. Returns an error string or null. */
function checkSshOpts(opts = []) {
  if (!Array.isArray(opts)) return 'SSH options must be a list';
  for (let i = 0; i < opts.length; i += 2) {
    const flag = opts[i];
    const value = opts[i + 1];
    if (flag === '-i' && typeof value === 'string' && SAFE_LOCAL_PATH.test(value)) continue;
    if (flag === '-o' && /^StrictHostKeyChecking=(.+)$/.test(String(value)) && STRICT_HOST_KEY.has(String(value).split('=')[1])) continue;
    return 'SSH option is not allowed';
  }
  return null;
}

/** @returns {string | null} reason the target is unsafe */
function unsafeTarget(target) {
  if (!target || typeof target !== 'object') return 'target is required';
  if (typeof target.host !== 'string' || !HOST.test(target.host)) return 'host is not allowed';
  if (target.user != null && !USER.test(String(target.user))) return 'user is not allowed';
  if (target.port != null && !(Number.isInteger(target.port) && target.port > 0 && target.port < 65536)) return 'port is not allowed';
  if (typeof target.remoteDir !== 'string' || !REMOTE_DIR.test(target.remoteDir)) return 'remote directory is not allowed';
  if (target.filename != null && !FILENAME.test(String(target.filename))) return 'filename is not allowed';
  return checkSshOpts(target.sshOpts);
}

/**
 * Provision explicitly named keys onto one remote host.
 *
 * @param {string} brainDir local brain that owns the encrypted store
 * @param {{ host: string, user?: string, port?: number, sshOpts?: string[], remoteDir: string, filename?: string }} target
 * @param {{ keys?: string[], projectPath?: string }} opts projectPath is explicit; the process cwd is never used
 */
export async function provisionDeployTarget(brainDir, target, opts = {}) {
  const unsafe = unsafeTarget(target);
  if (unsafe) return fail('invalid-target', `Deploy target refused: ${unsafe}.`, 'Use a plain host, user, remote directory and the supported SSH options.');
  if (opts == null || typeof opts !== 'object' || (opts.keys != null && !Array.isArray(opts.keys))) {
    return fail('invalid-keys', 'The key list must be an array of key names.', 'Pass the credential key names as a list.');
  }
  if (typeof brainDir !== 'string' || !brainDir) return fail('invalid-brain', 'A brain directory is required.', 'Pass the brain that owns the Auth store.');
  if ((opts.keys || []).some((k) => typeof k !== 'string')) {
    return fail('invalid-key-name', 'A credential key name is not a valid environment variable name.', 'Use environment-variable style names.');
  }
  const keys = [...new Set(opts.keys || [])];
  if (!keys.length) {
    return { ok: true, provisioned: false, keys: [], count: 0, code: 'no-keys-selected',
      message: 'No credential keys were named for this host, so none were provisioned.',
      action: 'Name the keys to provision, then redeploy or run: total-recall auth secret remote deploy.' };
  }
  const invalid = keys.filter((k) => !KEY_NAME.test(k));
  if (invalid.length) {
    return fail('invalid-key-name', 'A credential key name is not a valid environment variable name.', 'Use environment-variable style names.');
  }
  if (opts.projectPath != null && (typeof opts.projectPath !== 'string' || !path.isAbsolute(opts.projectPath))) {
    return fail('invalid-project-path', 'The project path must be an absolute path.', 'Pass the repository path the keys belong to.');
  }
  const projectPath = opts.projectPath ? path.resolve(opts.projectPath) : undefined;
  if (!fs.existsSync(resolveSecretsPath(brainDir))) {
    return fail('store-missing', 'No local encrypted Auth store was found, so nothing can be provisioned securely.',
      `Store the credential(s) first: total-recall auth secret set ${keys[0]} (then rerun the deploy).`, { keys });
  }

  // Everything below completes before any SSH call.
  let stored; let meta;
  try { stored = await loadSecrets(brainDir); meta = await listSecretsMeta(brainDir); } catch {
    return fail('store-unreadable', 'The local Auth store could not be opened.',
      'Unlock or repair the Auth store (total-recall auth --help), then rerun the deploy.', { keys });
  }
  const missing = keys.filter((k) => stored[k] == null || stored[k] === '');
  if (missing.length) {
    return fail('keys-missing', `Credential(s) not in the Auth store: ${missing.join(', ')}.`,
      'Store each with: total-recall auth secret set <KEY>, then rerun the deploy.', { keys, missing });
  }
  const byKey = new Map(meta.map((m) => [m.key, m]));
  const slug = projectPath ? projectSlugFromPath(projectPath) : undefined;
  // A key without a well-formed metadata row has no provable binding, so it is refused, not treated as global.
  const badMeta = keys.filter((k) => {
    const row = byKey.get(k);
    return !row || typeof row !== 'object' || row.key !== k || !Array.isArray(row.repos)
      || (row.project_path != null && typeof row.project_path !== 'string') || Boolean(row.binding_error) || Boolean(row.multi_repo_error);
  });
  if (badMeta.length) {
    return fail('keys-metadata-invalid', `Credential(s) with missing or invalid repository binding metadata: ${badMeta.join(', ')}.`,
      'Repair the binding with auth secret (set --repo), then rerun the deploy.', { keys, invalid: badMeta });
  }
  const foreign = keys.filter((k) => !secretMatchesTarget(byKey.get(k), { projectPath, projectSlug: slug, includeGlobal: true }));
  if (foreign.length) {
    return fail('keys-not-bound', `Credential(s) bound to another repository: ${foreign.join(', ')}.`,
      'Pass the matching project path, or bind the key to this repository with auth secret, then rerun.', { keys, foreign });
  }
  let projection;
  try { projection = await buildEnvProjection(brainDir, { keys, projectPath, projectSlug: slug, includeGlobal: true }); } catch {
    return fail('projection-failed', 'The credential projection could not be built.', 'Check the Auth store, then rerun the deploy.', { keys });
  }
  if (projection.count !== keys.length || keys.some((k) => !projection.keys.includes(k))) {
    return fail('projection-incomplete', 'The projection did not cover every named key, so nothing was sent.',
      'Check each key is stored and bound to this repository, then rerun.', { keys });
  }

  const remoteFile = path.posix.join(target.remoteDir, target.filename || '.env');
  const full = {
    name: 'deploy-wizard',
    host: target.host,
    user: target.user || 'root',
    port: target.port || 22,
    sshOpts: target.sshOpts || [],
  };
  try {
    pushProjection(full, remoteFile, projection, { partial: true });
  } catch (err) {
    if (err?.phase === 'read') {
      return fail('remote-read-failed', 'The remote credential file could not be read, and nothing was written.',
        'Confirm SSH access to the host, then rerun the deploy.', { keys });
    }
    // A transport failure can land after the remote rename, so whether the file changed is unknown.
    return fail('remote-commit-unknown', 'Remote provisioning did not confirm; the remote credential file may or may not have been replaced.',
      'Verify the remote file first (total-recall auth secret remote verify), then rerun the deploy.', { keys });
  }
  return { ok: true, provisioned: true, keys: projection.keys, count: projection.count, remoteFile };
}

/**
 * Run a fixed remote command with a secret on stdin. The command string must
 * not contain the secret; it is never placed in argv. Remote output goes to
 * the caller's terminal.
 *
 * @param {{ host: string, user?: string, port?: number, sshOpts?: string[] }} target
 * @param {string} remoteCommand
 * @param {{ stdin?: string }} opts
 */
export function runRemoteWithStdin(target, remoteCommand, opts = {}) {
  const unsafe = target && typeof target === 'object' && !target.remoteDir ? unsafeTarget({ ...target, remoteDir: 'x' }) : unsafeTarget(target);
  if (unsafe) return fail('invalid-target', `Deploy target refused: ${unsafe}.`, 'Use a plain host, user and the supported SSH options.');
  const args = [...sshBaseArgs({ ...target, user: target.user || 'root' }), sshDestination(target), remoteCommand];
  const r = spawnSync('ssh', args, { input: opts.stdin ?? '', stdio: ['pipe', 'inherit', 'inherit'] });
  if (r.error) return fail('remote-run-failed', 'SSH could not run the remote command.', 'Confirm SSH access to the host.');
  if (r.status !== 0) return fail('remote-run-failed', `Remote command exited with ${r.status}.`, 'Read the remote output above and rerun.', { status: r.status });
  return { ok: true, status: 0 };
}
