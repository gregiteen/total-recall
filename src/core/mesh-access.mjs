/**
 * Mesh node access — the operational half of a node entity.
 *
 * The control server answers "does this node exist and is it up". It cannot
 * answer "how do I log in to it", because the login account is a property of
 * the host, not of the tailnet. That one missing fact is enough to make a
 * perfectly reachable machine look unreachable: connect as the wrong user and
 * the far end refuses you exactly like a machine with no access at all.
 *
 * Historically that knowledge lived in each operator's `~/.ssh/config`, which
 * no other machine, and no agent, can read. This module lifts it into the mesh
 * node entity so access becomes shared vault state — discoverable the same way
 * every other node fact is.
 *
 * Portability (open source): nothing here hardcodes a hostname, user, or
 * control server. Everything is parsed from the operator's own config or read
 * from live discovery.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Which Tailscale build a node runs — decides if keyless mesh SSH is possible. */
export const TAILSCALE_VARIANTS = Object.freeze({
  DAEMON: 'daemon',
  SANDBOXED: 'sandboxed',
  MISSING: 'missing',
  UNKNOWN: 'unknown',
});

export const DEFAULT_SSH_PORT = 22;

/**
 * Parse an OpenSSH client config into ordered blocks.
 *
 * Deliberately a small subset: the directives that determine *how to connect*.
 * Keywords are case-insensitive and accept `=` as a separator, matching ssh(1).
 */
export function parseSshConfig(text = '') {
  const entries = [];
  let current = null;

  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const match = line.match(/^(\S+)(?:\s*=\s*|\s+)(.*)$/);
    if (!match) continue;

    const keyword = match[1].toLowerCase();
    const value = match[2].trim();
    if (!value) continue;

    if (keyword === 'host') {
      current = {
        patterns: value.split(/\s+/).filter(Boolean),
        hostname: null,
        user: null,
        port: null,
        identityFile: null,
      };
      entries.push(current);
      continue;
    }

    if (!current) continue;
    if (keyword === 'hostname') current.hostname = value;
    else if (keyword === 'user') current.user = value;
    else if (keyword === 'port') current.port = Number.parseInt(value, 10) || null;
    else if (keyword === 'identityfile') current.identityFile = value;
  }

  return entries;
}

/** Read the operator's ssh config, tolerating its absence. */
export function readSshConfig(configPath = path.join(os.homedir(), '.ssh', 'config')) {
  try {
    return fs.readFileSync(configPath, 'utf8');
  } catch {
    return '';
  }
}

/** Loose host comparison: `mac-mini`, `Mac_Mini` and `macmini` name one machine. */
function hostKey(value) {
  if (value == null) return '';
  return String(value).toLowerCase().replace(/\.$/, '').replace(/[^a-z0-9]/g, '');
}

/**
 * How well does an ssh config block describe this node?
 *
 * An address match is worth more than a name match: addresses are assigned by
 * the network and cannot coincide, whereas two unrelated blocks can easily
 * share a nickname. 0 means no match.
 */
export function sshConfigMatchScore(entry, node) {
  if (!entry || !node) return 0;

  const addresses = [node.ip, node.lan_ip].filter(Boolean).map(String);
  if (entry.hostname && addresses.includes(String(entry.hostname))) return 3;

  // Mesh hostnames arrive as FQDNs (`box.tail-net.example`), while an ssh
  // config block is almost always keyed on the short name an operator types.
  // Comparing only the full string means the two never meet.
  const shortName = String(node.hostname || '').split('.')[0];
  const names = [...new Set(
    [node.hostname, shortName, node.title].map(hostKey).filter(Boolean),
  )];
  if (!names.length) return 0;

  // Wildcard blocks (`Host *`) supply defaults for everything and so identify
  // nothing; treating one as a match would attach a stranger's user to a node.
  const literalPatterns = entry.patterns.filter((p) => !/[*?!]/.test(p));
  if (literalPatterns.some((p) => names.includes(hostKey(p)))) return 2;
  if (entry.hostname && names.includes(hostKey(entry.hostname))) return 1;

  return 0;
}

/** Best-matching ssh config block for a node, or null. */
export function findSshConfigEntryForNode(entries, node) {
  let best = null;
  let bestScore = 0;
  for (const entry of entries || []) {
    const score = sshConfigMatchScore(entry, node);
    if (score > bestScore) {
      best = entry;
      bestScore = score;
    }
  }
  return best;
}

/** Convert an ssh config block into an access record for the node entity. */
export function accessFromSshConfigEntry(entry) {
  if (!entry) return null;
  // Deliberately no ssh_host. An ssh config's HostName is typically a LAN
  // address or a local nickname — correct only from the machine that wrote it.
  // The mesh already knows an address that works from anywhere, so importing
  // the local one would override the portable answer with a fragile one and
  // break the same lookup from every other node.
  return {
    ssh_user: entry.user || null,
    ssh_port: entry.port || null,
    identity_file: entry.identityFile || null,
    source: 'ssh_config',
  };
}

/**
 * Classify a Tailscale install from what is present on the host.
 *
 * Only the open-source build ships a `tailscaled`; the macOS App Store and
 * standalone GUI builds are sandboxed and never start the SSH server, which is
 * why the daemon binary — not the platform — is the honest signal.
 */
export function classifyTailscaleVariant({ platform, hasClient = false, hasDaemon = false } = {}) {
  if (hasDaemon) return TAILSCALE_VARIANTS.DAEMON;
  if (!hasClient) return TAILSCALE_VARIANTS.MISSING;
  // Linux packages install the client and daemon together, so a client without
  // a daemon at the probed paths still means the daemon is there, elsewhere.
  if (platform === 'linux') return TAILSCALE_VARIANTS.DAEMON;
  if (platform === 'darwin') return TAILSCALE_VARIANTS.SANDBOXED;
  return TAILSCALE_VARIANTS.UNKNOWN;
}

/** Can this node accept control-plane-authorised SSH? */
export function meshSshFromVariant(variant) {
  if (variant === TAILSCALE_VARIANTS.DAEMON) return 'available';
  if (variant === TAILSCALE_VARIANTS.SANDBOXED || variant === TAILSCALE_VARIANTS.MISSING) {
    return 'unsupported';
  }
  return 'unknown';
}

/**
 * Resolve everything needed to open a session to a node.
 *
 * Prefers the mesh address over the LAN address: the mesh one works from
 * anywhere, while a LAN address is only correct when both ends happen to sit on
 * the same network.
 */
export function resolveNodeAccess(node, { fallbackUser = null } = {}) {
  const access = node?.access || {};
  const host = access.ssh_host || node?.ip || node?.lan_ip || node?.hostname || null;
  const user = access.ssh_user || fallbackUser || null;

  return {
    user,
    host,
    port: access.ssh_port || DEFAULT_SSH_PORT,
    identity_file: access.identity_file || null,
    mesh_ssh: access.mesh_ssh || 'unknown',
    tailscale_variant: access.tailscale_variant || TAILSCALE_VARIANTS.UNKNOWN,
    source: access.source || 'unknown',
    verified_at: access.verified_at || null,
    // A host with no user is the exact failure this module exists to prevent,
    // so callers get a single flag rather than having to re-derive it.
    complete: Boolean(user && host),
    target: user && host ? `${user}@${host}` : null,
  };
}

/** Human-readable `user@host[:port]`, or a clear marker of what is missing. */
export function formatAccessTarget(resolved) {
  if (!resolved?.host) return '(no address)';
  if (!resolved.user) return `(unknown user)@${resolved.host}`;
  const suffix = resolved.port && resolved.port !== DEFAULT_SSH_PORT ? `:${resolved.port}` : '';
  return `${resolved.user}@${resolved.host}${suffix}`;
}

/**
 * Build ssh(1) arguments for a node.
 *
 * `identity_file` is passed with IdentitiesOnly so a crowded or wedged agent
 * cannot silently offer a different key first and get the connection refused
 * before the right key is ever tried.
 */
export function buildSshArgs(resolved, { command = null, extraOptions = [] } = {}) {
  if (!resolved?.complete) return null;

  const args = [];
  if (resolved.port && resolved.port !== DEFAULT_SSH_PORT) args.push('-p', String(resolved.port));
  if (resolved.identity_file) {
    args.push('-i', resolved.identity_file, '-o', 'IdentitiesOnly=yes');
  }
  for (const option of extraOptions) args.push('-o', option);
  args.push(resolved.target);
  if (command) args.push(command);
  return args;
}

/**
 * Propose access records for nodes that have none, from the operator's config.
 *
 * Returns proposals rather than writing: importing someone's ssh config is a
 * judgement call, and a wrong user silently baked into the vault is worse than
 * no user at all.
 */
export function proposeAccessFromSshConfig(nodes, sshConfigText) {
  const entries = parseSshConfig(sshConfigText);
  const proposals = [];

  for (const node of nodes || []) {
    if (node?.access?.ssh_user) continue;
    const entry = findSshConfigEntryForNode(entries, node);
    if (!entry?.user) continue;

    proposals.push({
      hostname: node.hostname,
      ip: node.ip || null,
      matched_host: entry.patterns.join(' '),
      access: accessFromSshConfigEntry(entry),
    });
  }

  return proposals;
}
