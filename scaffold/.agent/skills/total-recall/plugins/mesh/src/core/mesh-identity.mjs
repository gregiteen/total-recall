/**
 * Mesh caller identity and per-node secret grants.
 *
 * The control server (Headscale) assigns every enrolled machine a mesh address
 * and the local Tailscale daemon can say which machine owns an address
 * (`tailscale whois`). Verified against Headscale with the official 1.104.1
 * client. That makes the mesh itself the credential: a machine that is
 * enrolled and holds a grant can read a secret, with no shared bearer token to
 * leak. Traffic on the mesh is already encrypted, so no certificate is needed
 * (the reason tsidp cannot run on Headscale).
 *
 * Default is deny: a node with no matching grant reads nothing.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { isMeshOrLoopbackAddress, normalizeRemoteAddress } from './mesh-auth.mjs';
import { resolveTailscaleBinary } from './tailscale-cli.mjs';

export const WHOIS_TIMEOUT_MS = 5_000;
export const WHOIS_CACHE_MS = 30_000;
export const POLICY_FILE = 'mesh-secrets-policy.json';

const cache = new Map();

export function resetIdentityCache() {
  cache.clear();
}

function runWhois(address) {
  return new Promise((resolve, reject) => {
    execFile(
      resolveTailscaleBinary(),
      ['whois', '--json', address],
      { timeout: WHOIS_TIMEOUT_MS, maxBuffer: 1_000_000 },
      (error, stdout) => (error ? reject(error) : resolve(String(stdout))),
    );
  });
}

/** Strip the trailing dot and tailnet suffix: `mini.tailnet.example.` -> `mini`. */
export function shortNodeName(name) {
  return String(name || '').replace(/\.$/, '').split('.')[0].toLowerCase();
}

/**
 * Parse `tailscale whois --json` output into the fields grants match on.
 * Returns null when the output does not identify a machine.
 */
export function parseWhois(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  const node = data?.Node;
  const node_name = shortNodeName(node?.ComputedName || node?.Name);
  if (!node_name) return null;
  return {
    node: node_name,
    user: String(data?.UserProfile?.LoginName || '').toLowerCase() || null,
    tags: Array.isArray(node?.Tags) ? node.Tags.map(String) : [],
  };
}

/**
 * Identify the machine behind a mesh address. Loopback is the local machine and
 * is reported as `self`. Anything outside the mesh range, and any address the
 * daemon cannot place, is refused rather than guessed.
 */
export async function identifyCaller(remoteAddress, { whois = runWhois, now = Date.now } = {}) {
  const address = normalizeRemoteAddress(remoteAddress);
  if (address === '127.0.0.1' || address === '::1') return { node: 'self', user: null, tags: [], local: true };
  if (!isMeshOrLoopbackAddress(address)) return null;

  const hit = cache.get(address);
  if (hit && now() - hit.at < WHOIS_CACHE_MS) return hit.identity;

  let identity = null;
  try {
    identity = parseWhois(await whois(address));
  } catch {
    identity = null;
  }
  // Failures are not cached: a daemon that was busy once should be retried.
  if (identity) cache.set(address, { at: now(), identity });
  return identity;
}

export function policyPath(brainDir) {
  return path.join(brainDir, 'config', POLICY_FILE);
}

/** Missing or malformed policy is an empty policy, which grants nothing. */
export function loadPolicy(brainDir) {
  try {
    const parsed = JSON.parse(fs.readFileSync(policyPath(brainDir), 'utf8'));
    return Array.isArray(parsed?.grants) ? parsed : { grants: [] };
  } catch {
    return { grants: [] };
  }
}

function globMatch(pattern, value) {
  const text = String(pattern);
  if (text === '*') return true;
  if (text.endsWith('*')) return String(value).startsWith(text.slice(0, -1));
  return text === String(value);
}

function grantMatchesIdentity(grant, identity) {
  const selectors = [];
  if (grant.node) selectors.push(shortNodeName(grant.node) === identity.node);
  if (grant.tag) selectors.push(identity.tags.includes(grant.tag));
  if (grant.user) selectors.push(String(grant.user).toLowerCase() === identity.user);
  // A grant with no selector matches nobody; it must never mean "everyone".
  return selectors.length > 0 && selectors.every(Boolean);
}

/** May this caller read this key? `self` (loopback) is always allowed. */
export function isKeyAllowed(identity, key, policy) {
  if (!identity) return false;
  if (identity.local) return true;
  return (policy?.grants || []).some(
    (grant) =>
      grantMatchesIdentity(grant, identity) &&
      (Array.isArray(grant.keys) ? grant.keys : []).some((pattern) => globMatch(pattern, key)),
  );
}

/** Keys of `allKeys` this caller may read. */
export function allowedKeys(identity, allKeys, policy) {
  return allKeys.filter((key) => isKeyAllowed(identity, key, policy));
}

/* ---------- grant management ---------- */

/** Write the policy atomically with owner-only permissions. */
export function savePolicy(brainDir, policy) {
  const file = policyPath(brainDir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(policy, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temp, file);
}

function selectorOf({ node, tag, user }) {
  const selector = {};
  if (node) selector.node = shortNodeName(node);
  if (tag) selector.tag = String(tag);
  if (user) selector.user = String(user).toLowerCase();
  if (Object.keys(selector).length === 0) throw new Error('A grant needs --node, --tag or --user; it cannot apply to everyone');
  return selector;
}

function sameSelector(grant, selector) {
  return ['node', 'tag', 'user'].every((field) => (grant[field] || null) === (selector[field] || null));
}

/** Add keys to the grant for this selector, creating it if needed. */
export function grantKeys(policy, selectorInput, keys) {
  const selector = selectorOf(selectorInput);
  const wanted = [...new Set(keys.map(String).filter(Boolean))];
  if (wanted.length === 0) throw new Error('Name at least one key or pattern');
  const grants = [...(policy.grants || [])];
  const index = grants.findIndex((grant) => sameSelector(grant, selector));
  if (index >= 0) {
    grants[index] = { ...grants[index], keys: [...new Set([...(grants[index].keys || []), ...wanted])] };
  } else {
    grants.push({ ...selector, keys: wanted });
  }
  return { grants };
}

/** Remove keys from a selector's grant; with no keys, remove the whole grant. */
export function revokeKeys(policy, selectorInput, keys = []) {
  const selector = selectorOf(selectorInput);
  const grants = [];
  for (const grant of policy.grants || []) {
    if (!sameSelector(grant, selector)) {
      grants.push(grant);
      continue;
    }
    if (keys.length === 0) continue;
    const remaining = (grant.keys || []).filter((key) => !keys.includes(key));
    if (remaining.length > 0) grants.push({ ...grant, keys: remaining });
  }
  return { grants };
}
