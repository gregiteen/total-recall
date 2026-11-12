import { readFileSync, existsSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { emit, jsonResult, stateStore, tr } from '../lib/runtime.mjs';

export const HELPER = '!total-recall git credential-helper';
const DEFAULT_MAP = { 'github.com': 'github_token' };

function hostName(value) {
  if (typeof value !== 'string' || !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::[0-9]+)?$/i.test(value)) {
    throw new Error('Supply a host name with an optional port');
  }
  return value.toLowerCase();
}

async function mappings(ctx) {
  if (!ctx.env.TR_PLUGIN_STATE_DIR) return { ...DEFAULT_MAP };
  const store = await stateStore(ctx, 'auth.json');
  const saved = store.read({ hosts: {} });
  return { ...DEFAULT_MAP, ...saved.hosts };
}

/** Append config to the caller's environment. No credential enters argv or env. */
export async function authGitEnv(ctx) {
  const env = { ...ctx.env };
  let index = Number(env.GIT_CONFIG_COUNT || 0);
  if (!Number.isSafeInteger(index) || index < 0 || index > 10000) throw new Error('Invalid GIT_CONFIG_COUNT');
  for (const host of Object.keys(await mappings(ctx))) {
    hostName(host);
    for (const value of ['', HELPER]) {
      env[`GIT_CONFIG_KEY_${index}`] = `credential.https://${host}.helper`;
      env[`GIT_CONFIG_VALUE_${index}`] = value;
      index += 1;
    }
  }
  env.GIT_CONFIG_COUNT = String(index);
  return env;
}

// The current dispatcher creates a fresh ctx for after(). Restore only our config keys.
const pending = new WeakMap();
export const guards = [{
  name: 'auth-store',
  async before(_args, ctx) {
    try {
      const next = await authGitEnv(ctx);
      const previous = new Map();
      for (const [key, value] of Object.entries(next)) {
        if (key === 'GIT_CONFIG_COUNT' || /^GIT_CONFIG_(KEY|VALUE)_\d+$/.test(key)) {
          previous.set(key, ctx.env[key]);
          ctx.env[key] = value;
        }
      }
      const stack = pending.get(ctx.env) || [];
      stack.push(previous);
      pending.set(ctx.env, stack);
    } catch { return { refuse: 'Credential helper configuration is unavailable' }; }
  },
  after(_args, ctx) {
    for (const [key, value] of pending.get(ctx.env)?.pop() || []) {
      if (value === undefined) delete ctx.env[key]; else ctx.env[key] = value;
    }
  },
}];

async function credential(args, ctx) {
  // Unsupported actions are silent, as the Git protocol requires.
  if (args.length !== 1 || args[0] !== 'get') return 0;
  try {
    const input = readFileSync(0, 'utf8');
    if (input.length > 65536) throw new Error('Invalid credential request');
    const attributes = {};
    for (const line of input.split(/\r?\n/)) {
      if (!line) break;
      const at = line.indexOf('=');
      if (at > 0) attributes[line.slice(0, at)] = line.slice(at + 1);
    }
    if (attributes.protocol !== 'https' || !attributes.host) return 0;
    const hosts = await mappings(ctx);
    const host = hostName(attributes.host);
    if (!Object.hasOwn(hosts, host)) return 0;
    const key = hosts[host];
    const result = jsonResult(tr(['auth', 'secret', 'get', key, '--json'], ctx), 'Auth store is unavailable');
    if (!result.found || typeof result.value !== 'string' || !result.value || /[\r\n\0]/.test(result.value)) {
      throw new Error('Auth key is unavailable');
    }
    if (ctx.env.GIT_PLUGIN_AUTH_PROBE_ID) {
      const probes = await stateStore(ctx, 'auth-probes.jsonl');
      probes.append({ probe: ctx.env.GIT_PLUGIN_AUTH_PROBE_ID, host, key, timestamp: new Date().toISOString() });
    }
    // This is the only credential output. Git reads this pipe.
    process.stdout.write(`username=x-access-token\npassword=${result.value}\nquit=true\n\n`);
    return 0;
  } catch {
    process.stdout.write('quit=true\n\n');
    console.error('Git credential is unavailable from the auth store');
    return 1;
  }
}

async function remoteCheck(ctx) {
  const remote = ctx.env.GIT_PLUGIN_AUTH_REMOTE || ctx.git(['remote', 'get-url', 'origin']).stdout?.trim();
  let url;
  try { url = new URL(remote); } catch { throw new Error('Set an HTTPS origin for the private repository to verify'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('The verification remote must be HTTPS without credentials');
  }
  const hosts = await mappings(ctx);
  const key = Object.hasOwn(hosts, url.host.toLowerCase()) ? hosts[url.host.toLowerCase()] : null;
  if (!key) throw new Error('No auth key is mapped to the verification host');
  const listed = jsonResult(tr(['auth', 'secret', 'list', '--json'], ctx), 'Cannot read auth key metadata');
  if (!Array.isArray(listed.keys) || !listed.keys.some(row => row.key === key || row.name === key)) {
    throw new Error('The mapped auth key is not present');
  }
  const probe = randomUUID();
  const env = { ...await authGitEnv(ctx), GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never', GIT_PLUGIN_AUTH_PROBE_ID: probe };
  const live = ctx.git(['ls-remote', '--', url.href], { env, timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] });
  const probes = await stateStore(ctx, 'auth-probes.jsonl');
  const credentialUsed = probes.readTail(1000).some(row => row.probe === probe && row.host === url.host && row.key === key);
  const remoteRead = live.status === 0 && !live.error && !live.signal;
  return { host: url.host, key, key_present: true, remote_read: remoteRead, credential_used: credentialUsed, verified: remoteRead && credentialUsed };
}

async function setup(ctx) {
  const config = 'credential.https://github.com.helper';
  const previous = ctx.git(['config', '--global', '--get-all', config]);
  if (![0, 1].includes(previous.status)) throw new Error('Cannot read global credential helpers');
  const old = previous.status === 0 ? previous.stdout.trimEnd().split('\n') : [];
  const set = args => {
    if (ctx.git(['config', '--global', ...args]).status !== 0) throw new Error('Cannot write global credential helpers');
  };
  try {
    set(['--replace-all', config, '']);
    set(['--add', config, HELPER]);
    const result = await remoteCheck(ctx);
    if (!result.verified) throw new Error('Auth-store sign-in was not verified; plaintext credentials were kept. Use a private HTTPS origin');
    if (result.host !== 'github.com') throw new Error('Setup must verify an HTTPS github.com private repository');
    // Remove only gh helper values. Keep unrelated host and global helpers.
    const helpers = ctx.git(['config', '--global', '--get-regexp', String.raw`^credential\..*helper$`]);
    if (![0, 1].includes(helpers.status)) throw new Error('Cannot read legacy helper entries');
    for (const line of (helpers.stdout || '').split('\n')) {
      const match = line.match(/^(\S+)\s+(.+)$/);
      if (match && /(?:^|[\s/!])gh\s+auth\s+git-credential(?:\s|$)/.test(match[2])) {
        set(['--fixed-value', '--unset-all', match[1], match[2]]);
      }
    }
    const file = path.join(ctx.env.HOME || os.homedir(), '.git-credentials');
    if (existsSync(file)) {
      console.error(`Removing verified plaintext credential file: ${file}`);
      unlinkSync(file);
    }
    return { ...result, helper_wired: true, setup: true };
  } catch (error) {
    const cleared = ctx.git(['config', '--global', '--unset-all', config]);
    let restored = [0, 5].includes(cleared.status);
    for (const value of old) restored = ctx.git(['config', '--global', '--add', config, value]).status === 0 && restored;
    if (!restored) throw new Error('Setup failed; global credential helper restoration failed');
    throw error;
  }
}

export const operations = {
  'credential-helper': {
    summary: 'Read a Git credential from the auth store',
    usage: 'credential-helper get|store|erase',
    run: credential,
  },
  auth: {
    summary: 'Verify sign-in or configure the auth-store helper',
    usage: 'auth status | auth map <host> <KEY> | auth setup',
    async run(args, ctx) {
      try {
        const [action = 'status', host, key] = args;
        if (action === 'map' && args.length === 3) {
          const normalized = hostName(host);
          if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(key)) throw new Error('Supply an auth key name');
          const store = await stateStore(ctx, 'auth.json');
          const saved = store.read({ hosts: {} });
          store.write({ ...saved, hosts: { ...saved.hosts, [normalized]: key } });
          emit(ctx, { host: normalized, key }, `Mapped ${normalized} to ${key}`);
          return 0;
        }
        if (args.length > 1 || !['status', 'setup'].includes(action)) throw new Error('Use auth status, auth map <host> <KEY>, or auth setup');
        const result = action === 'setup' ? await setup(ctx) : await remoteCheck(ctx);
        if (action === 'status') {
          const row = ctx.git(['config', '--get-all', `credential.https://${result.host}.helper`]);
          const helpers = row.status === 0 ? row.stdout.trimEnd().split('\n') : [];
          result.helper_wired = helpers.at(-1) === HELPER && helpers.includes('');
        }
        emit(ctx, result, `${result.host}: auth key ${result.key} is present; live remote read ${result.remote_read ? 'passed' : 'failed'}; auth-store sign-in ${result.verified ? 'verified' : 'not verified (use a private HTTPS origin)'}`);
        return result.verified ? 0 : 1;
      } catch (error) {
        // All errors here are fixed messages. Never forward subprocess output.
        const reason = error.message.startsWith('Plugin state') || error.message.startsWith('SSSS') ? 'Plugin state is unavailable' : error.message;
        emit(ctx, { ok: false, error: reason }, `Auth failed: ${reason}`);
        return 1;
      }
    },
  },
};
