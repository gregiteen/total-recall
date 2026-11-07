import fs from 'node:fs';
import crypto from 'node:crypto';
import { getLeaderInfo, isLeader } from './leader-election.mjs';
import { logger } from './logger.mjs';
import { brainDir } from './config.mjs';
import { resolveSecretsPath, loadSecrets, saveSecrets, ensureMeta, appendAuditAsync, rotateSecret, META_KEY } from './secrets-store.mjs';
import {
  compareScopes,
  defaultRun,
  inspectGithubLogin,
  probeGithubToken,
  projectGithubLogin,
  readGhToken,
  revokeGithubToken,
  signInGh,
  tokenFingerprint,
} from './login-projections.mjs';

const REQUEST_TIMEOUT_MS = 10_000;
const FETCH_CONCURRENCY = 8;

function serverPort() {
  const value = Number(process.env.TR_SERVER_PORT || process.env.PORT || 3000);
  return Number.isInteger(value) && value > 0 && value <= 65535 ? value : 3000;
}

function meshUrl(ip, route, port = serverPort()) {
  const octets = String(ip || '').split('.').map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255) || octets[0] !== 100 || octets[1] < 64 || octets[1] > 127) {
    throw new Error('Leader IP is outside the Tailscale CGNAT range');
  }
  return `http://${ip}:${port}${route}`;
}

export function getSecretsChecksum() {
  const filePath = resolveSecretsPath(brainDir);
  if (!fs.existsSync(filePath)) return null;
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

export function secretsSyncMode(env = process.env) {
  if (env.TR_SECRETS_SYNC_MODE && env.TR_SECRETS_SYNC_MODE !== 'mesh-identity') throw new Error('Only explicit mesh identity grants are supported');
  return 'mesh-identity';
}

/** The keys the leader says this machine may read. */
async function listGrantedKeys(base, fetchImpl) {
  let listResponse;
  try {
    listResponse = await fetchImpl(base, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (err) {
    // "fetch failed" alone named neither the address nor the reason.
    throw new Error(`No Total Recall server answered at ${base}: ${err.cause?.code || err.message}`);
  }
  if (!listResponse.ok) throw new Error(`Leader returned ${listResponse.status}`);
  const { keys } = await listResponse.json();
  if (!Array.isArray(keys)) throw new Error('Invalid grant list');
  return keys;
}

/**
 * Grant-based sync: ask the leader which keys this machine may read, fetch
 * only those, and merge them into this node's own encrypted store. Keys that
 * were granted before and are no longer listed are removed (revocation); that
 * only happens after a successful list, so an unreachable leader never wipes
 * anything. The node's store is never replaced wholesale and the node keeps
 * its own master password.
 */
export async function syncGrantedSecrets(leaderIp, { dir = brainDir, fetchImpl = fetch, port } = {}) {
  // The leader's port, never this node's: the droplet serves on 3900 while devices
  // default to 3000, and assuming our own port made every sync fail.
  const base = meshUrl(leaderIp, '/api/secrets/mesh', port || serverPort());
  const keys = await listGrantedKeys(base, fetchImpl);

  // Each key costs the leader a store decryption plus a mesh round trip (2-3 s from a laptop),
  // so a few at a time keeps a full sync under a minute instead of several.
  const fetched = {};
  let next = 0;
  const worker = async () => {
    while (next < keys.length) {
      const key = keys[next++];
      const response = await fetchImpl(`${base}/${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (!response.ok) throw new Error(`Leader returned ${response.status} for ${key}`);
      fetched[key] = (await response.json()).value;
    }
  };
  await Promise.all(Array.from({ length: Math.min(FETCH_CONCURRENCY, keys.length) }, worker));

  const secrets = ensureMeta(await loadSecrets(dir));
  // Only keys this sync created may be removed when their grant is revoked. A key the node
  // already held before it was ever granted is the node's own: revoking the grant must not
  // delete it (on the node that owns the full store, that would wipe its secrets).
  const previouslySynced = Array.isArray(secrets[META_KEY].mesh_synced) ? secrets[META_KEY].mesh_synced : [];
  const created = Object.keys(fetched).filter((key) => !(key in secrets));
  const removed = previouslySynced.filter((key) => !(key in fetched) && key in secrets);
  for (const key of removed) {
    delete secrets[key];
    delete secrets[META_KEY].keys?.[key];
  }
  let updated = 0;
  for (const [key, value] of Object.entries(fetched)) {
    if (secrets[key] !== value) updated += 1;
    secrets[key] = value;
  }
  secrets[META_KEY].mesh_granted = Object.keys(fetched);
  secrets[META_KEY].mesh_synced = [...new Set([...previouslySynced.filter((key) => key in fetched), ...created])];
  await saveSecrets(dir, secrets);
  await appendAuditAsync(dir, { action: 'mesh_grant_sync', key: `(${keys.length} granted, ${removed.length} revoked)`, actor: 'mesh-sync' });
  return { granted: keys.length, updated, removed: removed.length };
}

const githubKeyName = (secrets) => (secrets.GITHUB_TOKEN && !secrets.github_token ? 'GITHUB_TOKEN' : 'github_token');

/** Reloads first: the checks take seconds, and a key saved meanwhile must survive. */
async function saveGithubRecord(dir, record) {
  const secrets = ensureMeta(await loadSecrets(dir));
  secrets[META_KEY].login_projections = { ...secrets[META_KEY].login_projections, gh: { ...record, at: new Date().toISOString() } };
  await saveSecrets(dir, secrets);
}

/** One line on what a kept `gh` login holds that the store does not. */
function describeDifference({ reason, login, store_login: storeLogin, added = [], removed = [] }) {
  if (reason === 'store-token-rejected') return 'GitHub rejects the stored token';
  if (reason === 'different-account') return `gh is signed in as ${login}, the stored token belongs to ${storeLogin}`;
  if (reason === 'new-token') return 'a new token with the same scopes';
  return [added.length ? `adds ${added.join(', ')}` : '', removed.length ? `drops ${removed.join(', ')}` : ''].filter(Boolean).join('; ');
}

/** A desktop notice, once per token. Best effort: the audit log is the record. */
async function alertOperator(run, eventId, title, message) {
  await run('total-recall', ['alerts', 'send', '--title', title, '--message', message, '--channels', 'os', '--severity', 'info', '--source', 'auth', '--event-id', eventId]);
}

async function reportGithubLogin(dir, github, run) {
  if (github.status === 'failed') logger.error('secrets-sync', 'gh login from github_token failed', { error: github.error });
  if (github.status === 'logged-in') {
    await appendAuditAsync(dir, { action: 'login_projection', key: `github_token -> gh (${github.reason})`, actor: 'mesh-sync' });
    if (github.replaced) {
      const message = `A rotated github_token replaced this machine's own gh login (${describeDifference(github.replaced)}).`;
      logger.warn('secrets-sync', message);
      await alertOperator(run, `gh-login-replaced-${github.record.store.slice(0, 12)}`, 'gh login replaced by rotation', message);
    }
  }
  if (github.status === 'diverged' && github.first) {
    const difference = describeDifference(github);
    await appendAuditAsync(dir, { action: 'login_projection_kept', key: `gh differs from github_token (${difference})`, actor: 'mesh-sync' });
    const message = `gh on this machine differs from github_token (${difference}), so the sync left it alone. See: total-recall auth secret gh-login status`;
    logger.warn('secrets-sync', message);
    await alertOperator(run, `gh-login-kept-${github.record.gh.slice(0, 12)}`, 'gh login kept', message);
  }
}

/** Sign in the tools that use synced secrets (today: gh from github_token). */
export async function projectLogins({ dir = brainDir, run = defaultRun } = {}) {
  const secrets = ensureMeta(await loadSecrets(dir));
  const record = secrets[META_KEY].login_projections?.gh;
  const github = await projectGithubLogin({ token: secrets.github_token || secrets.GITHUB_TOKEN, record, run });
  if (github.record && (github.record.store !== record?.store || github.record.gh !== record?.gh)) await saveGithubRecord(dir, github.record);
  await reportGithubLogin(dir, github, run);
  return { github };
}

/** How `gh` on this machine compares with the store. Changes nothing. */
export async function githubLoginStatus({ dir = brainDir, run = defaultRun } = {}) {
  const secrets = await loadSecrets(dir);
  return inspectGithubLogin({ token: secrets.github_token || secrets.GITHUB_TOKEN, run });
}

/** Give up this machine's own `gh` login and sign in from the store. Plans unless `yes`. */
export async function useStoreGithubLogin({ dir = brainDir, yes = false, run = defaultRun } = {}) {
  const secrets = await loadSecrets(dir);
  const token = secrets.github_token || secrets.GITHUB_TOKEN;
  if (!token) throw new Error('The store holds no github_token');
  const status = await inspectGithubLogin({ token, run });
  if (status.state === 'same') return { ok: true, changed: false, ...status };
  if (!yes) return { ok: true, planned: true, ...status };
  const result = await signInGh(token, run);
  if (result.status !== 'logged-in') return { ok: false, changed: false, error: result.error };
  const fingerprint = tokenFingerprint(token);
  await saveGithubRecord(dir, { store: fingerprint, gh: fingerprint });
  await appendAuditAsync(dir, { action: 'login_projection', key: 'github_token -> gh (operator)', actor: 'cli' });
  return { ok: true, changed: true, ...status };
}

/**
 * Save this machine's `gh` token as the mesh's `github_token`. This is what widens a credential
 * across the mesh, so it plans unless `yes`. Only the leader's store reaches other nodes, and the
 * next sync would overwrite a follower's own copy, so a follower writes to the leader over the mesh.
 */
export async function adoptGithubLogin({ dir = brainDir, yes = false, revokeOld = false, run = defaultRun, exec, fetchImpl = fetch, sleep } = {}) {
  const secrets = await loadSecrets(dir);
  const key = githubKeyName(secrets);
  const previous = secrets[key];
  const held = await readGhToken(run);
  if (held.state !== 'token') throw new Error(held.error || 'gh holds no token to adopt. Sign in with gh first; nothing changed.');
  if (!previous) throw new Error(`The store holds no ${key}; nothing changed. Save it with: total-recall auth secret set ${key} --stdin`);
  const fingerprint = tokenFingerprint(held.token);
  if (held.token === previous) return { ok: true, adopted: false, state: 'same', key, fingerprint: fingerprint.slice(0, 12) };

  const [gh, store] = await Promise.all([probeGithubToken(held.token, run), probeGithubToken(previous, run)]);
  if (gh.state === 'rejected') throw new Error("GitHub rejects gh's token; nothing changed. Sign in with gh again first.");
  if (gh.state !== 'ok' || store.state === 'unknown') throw new Error('Could not check both tokens with GitHub; nothing changed.');
  if (store.state === 'ok' && store.login !== gh.login) throw new Error(`gh is signed in as ${gh.login}, but ${key} belongs to ${store.login}; nothing changed.`);

  const leader = await isLeader();
  const leaderInfo = leader ? null : await getLeaderInfo();
  if (!leader && !leaderInfo?.ip) throw new Error('No leader found to write to; nothing changed.');
  const plan = {
    key,
    login: gh.login,
    target: leader ? 'this machine' : leaderInfo.ip,
    gh: { fingerprint: fingerprint.slice(0, 12), scopes: gh.scopes },
    store: { fingerprint: tokenFingerprint(previous).slice(0, 12), state: store.state, scopes: store.scopes },
    // A rejected token reports no scopes, which is not the same as holding none.
    ...(store.state === 'ok' ? compareScopes(gh, store) : { added: [], removed: [] }),
    revoke_old: revokeOld,
  };
  if (!yes) return { ok: true, planned: true, ...plan };

  if (leader) {
    await rotateSecret(dir, key, held.token, { actor: 'gh-login-adopt' });
  } else {
    // Checked first: without a grant the leader would change and this machine would never catch up.
    const granted = await listGrantedKeys(meshUrl(leaderInfo.ip, '/api/secrets/mesh', leaderInfo.port || serverPort()), fetch);
    if (!granted.includes(key)) throw new Error(`This machine holds no grant for ${key}, so it would not receive the token back; nothing changed.`);
    const runOnLeader = exec || (await import('./mesh.mjs')).execMeshCommand;
    const rotated = await runOnLeader(leaderInfo.ip, `total-recall auth secret rotate ${key} --stdin`, { input: held.token, timeoutMs: 60_000 });
    if (!rotated.success) throw new Error(`The leader did not take the token, so nothing changed: ${String(rotated.stderr || 'no detail').split('\n')[0].replaceAll(held.token, '***')}`);
    // Prove it came back through the sync every other node uses.
    await syncGrantedSecrets(leaderInfo.ip, { dir, port: leaderInfo.port });
    if ((await loadSecrets(dir))[key] !== held.token) throw new Error(`The leader took the token, but this machine did not get it back. Check that its grant includes ${key}. The old token was left working.`);
    // The leader runs no sync of its own, so its gh would keep the old token.
    const leaderLogin = await runOnLeader(leaderInfo.ip, 'gh auth login --hostname github.com --git-protocol https --with-token && gh auth setup-git --hostname github.com', { input: held.token, timeoutMs: 60_000 });
    plan.leader_gh = leaderLogin.success ? 'signed-in' : 'failed';
  }
  await saveGithubRecord(dir, { store: fingerprint, gh: fingerprint });
  await appendAuditAsync(dir, { action: 'login_adopted', key: `gh -> ${key}${plan.added.length ? ` (adds ${plan.added.join(', ')})` : ''}`, actor: 'cli' });

  if (!revokeOld || store.state !== 'ok') return { ok: plan.leader_gh !== 'failed', adopted: true, ...plan };
  // Never end the old token while a machine still signs in with it.
  if (plan.leader_gh === 'failed') return { ok: false, adopted: true, ...plan, revocation: { revoked: false, skipped: "the leader's gh still uses the old token" } };
  const revocation = await revokeGithubToken(previous, { run, fetchImpl, ...(sleep ? { sleep } : {}) });
  await appendAuditAsync(dir, { action: revocation.revoked ? 'revoke' : 'revoke_failed', key: `${key} (previous value)`, actor: 'cli' });
  // GitHub does not say whether this ends only the one token, so check the new one still works.
  revocation.new_token_works = (await probeGithubToken(held.token, run)).state === 'ok';
  return { ok: revocation.revoked && revocation.new_token_works, adopted: true, ...plan, revocation };
}

export async function syncLoop() {
  secretsSyncMode();
  if (!(await isLeader())) {
    const leaderInfo = await getLeaderInfo();
    if (leaderInfo?.ip) {
      try { await syncGrantedSecrets(leaderInfo.ip, { port: leaderInfo.port }); }
      catch (err) { logger.error('secrets-sync', 'Failed to sync granted secrets', { error: err.message }); }
    }
  }
  // Even when the leader is unreachable, the last synced token should still be signed in.
  try { await projectLogins(); }
  catch (err) { logger.error('secrets-sync', 'Login projection failed', { error: err.message }); }
}
