/**
 * Finding a working mesh login with this machine's own keys.
 *
 * `mesh access sync` learns accounts other nodes already know. This covers the
 * case where nobody knows yet: it tries the plausible accounts with the keys
 * this machine holds and records the first one that logs in, verified.
 *
 * It stops early when the failure is not about credentials. An untrusted host
 * key or an unreachable host fails identically for every account and key, so
 * trying the rest would only add delay and noise to the far end's auth log.
 * Host keys are never auto-accepted; that case is reported with the command
 * that confirms the key.
 *
 * Portability (open source): candidates come from the node entity, the
 * operator's ssh config and the local account — nothing is hardcoded.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  DEFAULT_SSH_PORT,
  findSshConfigEntryForNode,
  localIdentityFile,
  parseSshConfig,
  readSshConfig,
} from './mesh-access.mjs';

/** Accounts worth trying for a node, most likely first, without duplicates. */
export function candidateUsers(node, { sshConfigText = '', localUser = safeLocalUser() } = {}) {
  const entry = findSshConfigEntryForNode(parseSshConfig(sshConfigText), node);
  return [...new Set([node?.access?.ssh_user, entry?.user, localUser].filter(Boolean))];
}

/**
 * Private keys this machine holds in `~/.ssh`: every file with a matching
 * `.pub` beside it. `null` comes last and means "ssh defaults and agent".
 */
export function localPrivateKeys(sshDir = path.join(os.homedir(), '.ssh')) {
  let names = [];
  try {
    names = fs.readdirSync(sshDir);
  } catch {
    return [null];
  }
  const keys = names
    .filter((name) => name.endsWith('.pub'))
    .map((name) => path.join(sshDir, name.slice(0, -4)))
    .filter((file) => {
      try {
        return fs.statSync(file).isFile();
      } catch {
        return false;
      }
    })
    .sort();
  return [...keys, null];
}

/** Why a login attempt failed, from ssh's stderr. */
export function classifyProbeFailure(stderr = '') {
  const text = String(stderr);
  if (/Host key verification failed|REMOTE HOST IDENTIFICATION HAS CHANGED/i.test(text)) {
    return 'host-key';
  }
  if (/Permission denied|Too many authentication failures/i.test(text)) return 'auth';
  if (/timed out|No route to host|Connection refused|Could not resolve/i.test(text)) {
    return 'unreachable';
  }
  return 'unknown';
}

/** One non-interactive login attempt. Resolves `{ ok, reason, stderr }`. */
export function probeLogin({ user, host, port = DEFAULT_SSH_PORT, identity = null }, options = {}) {
  const { timeoutMs = 12_000, spawnImpl = spawn } = options;
  const args = ['-o', 'BatchMode=yes', '-o', `ConnectTimeout=${Math.ceil(timeoutMs / 1000)}`];
  if (port && port !== DEFAULT_SSH_PORT) args.push('-p', String(port));
  if (identity) args.push('-i', identity, '-o', 'IdentitiesOnly=yes');
  args.push(`${user}@${host}`, 'true');

  return new Promise((resolve) => {
    let stderr = '';
    let settled = false;
    let timer = null;
    const done = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const proc = spawnImpl('ssh', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    timer = setTimeout(() => {
      proc.kill('SIGTERM');
      done({ ok: false, reason: 'unreachable', stderr: 'timed out' });
    }, timeoutMs + 2_000);
    proc.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    proc.on('error', (err) => done({ ok: false, reason: 'unknown', stderr: err.message }));
    proc.on('close', (code) =>
      done(
        code === 0
          ? { ok: true, reason: null, stderr: '' }
          : { ok: false, reason: classifyProbeFailure(stderr), stderr: stderr.trim() },
      ),
    );
  });
}

/**
 * Find a working login for one node and record it.
 *
 * @returns {Promise<{ hostname: string, found: boolean, access?: object,
 *   reason?: string, attempts: number, written?: boolean }>}
 */
export async function discoverNodeAccess(node, options = {}) {
  const {
    vaultRoot,
    sshConfigText = readSshConfig(),
    keys = localPrivateKeys(),
    probe = probeLogin,
    save = null,
    timeoutMs = 12_000,
  } = options;

  const host = node?.access?.ssh_host || node?.ip || node?.lan_ip || null;
  if (!host) return { hostname: node?.hostname, found: false, reason: 'no-address', attempts: 0 };

  const port = node?.access?.ssh_port || DEFAULT_SSH_PORT;
  const recordedKey = localIdentityFile(node?.access?.identity_file);
  const identities = [...new Set([recordedKey, ...keys].filter((k) => k !== undefined))];
  if (!identities.includes(null)) identities.push(null);
  const users = candidateUsers(node, { sshConfigText });

  let attempts = 0;
  let lastReason = users.length ? 'auth' : 'no-candidate-user';
  for (const user of users) {
    for (const identity of identities) {
      attempts += 1;
      const result = await probe({ user, host, port, identity }, { timeoutMs });
      if (result.ok) {
        const access = {
          ssh_user: user,
          ...(identity ? { identity_file: identity } : {}),
          source: 'discovered',
          verified_at: new Date().toISOString(),
        };
        const writer =
          save ||
          (async (hostname, patch) => {
            const { setMeshNodeAccess } = await import('./mesh.mjs');
            return setMeshNodeAccess(hostname, patch, { vaultRoot });
          });
        const written = await writer(node.hostname, access);
        return { hostname: node.hostname, found: true, access, attempts, written: !!written?.written };
      }
      lastReason = result.reason;
      if (result.reason === 'host-key' || result.reason === 'unreachable') {
        return { hostname: node.hostname, found: false, reason: result.reason, attempts };
      }
    }
  }
  return { hostname: node.hostname, found: false, reason: lastReason, attempts };
}

function safeLocalUser() {
  try {
    return os.userInfo().username || null;
  } catch {
    return process.env.USER || process.env.USERNAME || null;
  }
}
