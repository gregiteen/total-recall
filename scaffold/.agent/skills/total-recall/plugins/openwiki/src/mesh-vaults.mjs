/**
 * Multi-Vault and Mesh Discovery Engine for OpenWiki.
 *
 * Uses the Total Recall Mesh plugin dynamically (zero hardcoded hosts/IPs/devices).
 * Discovers local vaults, registered project vaults, and live online mesh peers.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { readProjects } from './refresh.mjs';

/**
 * Returns the path to the global vault directory.
 */
export function getGlobalVaultPath(home = os.homedir()) {
  return path.join(home, '.agent', 'skills', 'total-recall', 'memory-vault');
}

/**
 * Discovers all active vault roots on the current machine dynamically:
 * - Global memory vault
 * - Every registered project repository's memory vault
 * - Every registered project repository's openwiki projection directory
 */
export function discoverLocalVaults({ home = os.homedir() } = {}) {
  const vaults = [];

  // 1. Global Vault
  const globalVault = getGlobalVaultPath(home);
  if (fs.existsSync(globalVault)) {
    vaults.push({
      type: 'global',
      name: 'global-vault',
      root: globalVault,
      isVault: true,
      hasOpenWikiDir: fs.existsSync(path.join(globalVault, 'openwiki-articles')) ||
                      fs.existsSync(path.join(globalVault, 'openwiki-hubs')),
    });
  }

  // 2. Project Vaults & Repositories from project-registry
  let projects = [];
  try {
    projects = readProjects();
  } catch {
    projects = [];
  }

  for (const proj of projects) {
    const projectVault = path.join(proj.root, '.agent', 'skills', 'total-recall', 'memory-vault');
    const projectOpenWiki = path.join(proj.root, 'openwiki');
    vaults.push({
      type: 'project',
      name: proj.name,
      root: proj.root,
      vaultPath: fs.existsSync(projectVault) ? projectVault : null,
      openwikiPath: fs.existsSync(projectOpenWiki) ? projectOpenWiki : null,
      hasOpenWikiDir: fs.existsSync(projectOpenWiki),
      isVault: fs.existsSync(projectVault),
    });
  }

  return vaults;
}

/**
 * Dynamically queries the mesh plugin for live mesh peers.
 * Zero hardcoded hostnames, IPs, or personal user configurations.
 */
export function getMeshNodes() {
  try {
    const stdout = execFileSync('total-recall', ['mesh', 'status'], {
      encoding: 'utf8',
      timeout: 6000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });

    const lines = stdout.split('\n');
    const jsonLine = lines.find((l) => l.trim().startsWith('{') && l.includes('"nodes"'));
    if (!jsonLine) return [];

    const parsed = JSON.parse(jsonLine);
    if (!Array.isArray(parsed.nodes)) return [];

    return parsed.nodes
      .filter((n) => n && n.ip && typeof n.ip === 'string')
      .map((n) => ({
        hostname: n.os_hostname || n.hostname || n.title || n.ip,
        ip: n.ip,
        ips: Array.isArray(n.ips) ? n.ips : [n.ip],
        self: Boolean(n.self),
        online: Boolean(n.online),
        os: n.os || 'unknown',
      }));
  } catch {
    return [];
  }
}

/**
 * Execute a command on a remote mesh node via Total Recall mesh plugin.
 * Guarded against self-execution (never ssh a machine into itself).
 */
export function execOnMeshNode(nodeTarget, args, { timeoutMs = 25000 } = {}) {
  if (!nodeTarget || typeof nodeTarget !== 'string') {
    throw new Error('A valid mesh node identifier or IP is required');
  }

  // Verify against dynamic mesh self status
  const nodes = getMeshNodes();
  const matched = nodes.find(
    (n) => n.ip === nodeTarget || n.hostname.toLowerCase() === nodeTarget.toLowerCase()
  );

  if (matched?.self) {
    throw new Error(`Target node '${nodeTarget}' is the local host. Do not mesh exec into self.`);
  }

  if (!Array.isArray(args) || args.some(arg => typeof arg !== 'string')) {
    throw new Error('Mesh operation requires OpenWiki CLI arguments');
  }
  const quote = arg => "'" + arg.replaceAll("'", "'\\''") + "'";
  const command = ['total-recall', 'openwiki', ...args].map(quote).join(' ');
  const result = spawnSync('total-recall', ['mesh', 'exec', nodeTarget, command], {
    encoding: 'utf8',
    timeout: timeoutMs,
  });

  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error ? result.error.message : null,
  };
}

/**
 * Scans a directory for OpenWiki markdown hub files.
 */
export function scanDirectoryHubs(targetDir, { label = '', repoName = '', nested = false } = {}) {
  const hubs = [];
  if (!fs.existsSync(targetDir)) return hubs;
  if (nested && fs.lstatSync(targetDir).isSymbolicLink()) return hubs;

  const pending = [{ directory: targetDir, depth: 0 }];
  let bytes = 0, scannedDirectories = 0;
  while (pending.length && (!nested || (hubs.length < 256 && scannedDirectories < 256))) {
    const { directory, depth } = pending.shift();
    scannedDirectories++;
    let entries;
    try { entries = fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)); }
    catch { continue; }
    for (const ent of entries) {
      if (nested && hubs.length >= 256) break;
      const fullPath = path.join(directory, ent.name);
      if (nested && depth < 8 && ent.isDirectory() && !ent.name.startsWith('.')) {
        pending.push({ directory: fullPath, depth: depth + 1 });
      }
      if (ent.isFile() && ent.name.endsWith('.md')) {
        try {
          if (nested) {
            const size = fs.statSync(fullPath).size;
            if (size > 512 * 1024 || bytes + size > 4 * 1024 * 1024) continue;
            bytes += size;
          }
          const content = fs.readFileSync(fullPath, 'utf8');
          const titleMatch = content.match(/^#\s+(.+)$/m);
          const title = titleMatch ? titleMatch[1].trim() : ent.name.replace(/\.md$/, '');
          const lines = content.split('\n').length;
          hubs.push({
            title,
            fileName: path.relative(targetDir, fullPath),
            path: fullPath,
            repoName: repoName || path.basename(path.dirname(targetDir)),
            sourceType: label || 'openwiki',
            lines,
            size_bytes: Buffer.byteLength(content, 'utf8'),
          });
        } catch {
          // ignore unreadable files
        }
      }
    }
  }

  return hubs;
}

/**
 * Universal Hubs Discovery across:
 * - Current cwd `./openwiki`
 * - All registered project vaults (`--all-vaults`)
 * - Global memory vault (`openwiki-*` categories)
 * - Remote mesh node (`--node <target>`)
 */
export async function discoverAllHubs({
  allVaults = false,
  node = null,
  cwd = process.cwd(),
  nested = false,
} = {}) {
  // If target is a remote mesh node, delegate through mesh
  if (node && node !== 'local' && node !== 'self') {
    const nodes = getMeshNodes();
    const selfNode = nodes.find((n) => n.self);
    const isSelf = selfNode && (selfNode.ip === node || selfNode.hostname.toLowerCase() === node.toLowerCase());

    if (!isSelf) {
      const meshRes = execOnMeshNode(node, ['hubs', ...(allVaults ? ['--all-vaults'] : []), '--json']);
      if (meshRes.ok) {
        try {
          const parsed = JSON.parse(meshRes.stdout);
          return {
            node,
            isRemote: true,
            hubs: parsed.hubs || [],
            count: parsed.count || (parsed.hubs ? parsed.hubs.length : 0),
          };
        } catch {
          throw new Error(`Invalid JSON response from mesh node ${node}: ${meshRes.stdout}`);
        }
      } else {
        throw new Error(`Mesh exec failed on node ${node}: ${meshRes.stderr || meshRes.error}`);
      }
    }
  }

  const allHubs = [];

  // 1. Current working directory openwiki
  const localOpenWiki = path.resolve(cwd, 'openwiki');
  const localHubs = scanDirectoryHubs(localOpenWiki, {
    label: 'current-workspace',
    repoName: path.basename(cwd),
    nested,
  });
  allHubs.push(...localHubs);

  // If not all vaults requested, return local hubs
  if (!allVaults) {
    return {
      node: 'local',
      isRemote: false,
      hubs: allHubs,
      count: allHubs.length,
      scope: 'workspace',
    };
  }

  // 2. Scan all project vaults across the machine
  const localVaults = discoverLocalVaults();
  for (const vault of localVaults) {
    if (vault.type === 'project' && vault.openwikiPath) {
      if (path.resolve(vault.openwikiPath) === path.resolve(localOpenWiki)) continue;
      const projHubs = scanDirectoryHubs(vault.openwikiPath, {
        label: 'project-openwiki',
        repoName: vault.name,
      });
      allHubs.push(...projHubs);
    } else if (vault.type === 'global') {
      const gHubsDir = path.join(vault.root, 'openwiki-hubs');
      const gArticlesDir = path.join(vault.root, 'openwiki-articles');
      if (fs.existsSync(gHubsDir)) {
        allHubs.push(...scanDirectoryHubs(gHubsDir, { label: 'global-vault-hubs', repoName: 'global-vault' }));
      }
      if (fs.existsSync(gArticlesDir)) {
        allHubs.push(...scanDirectoryHubs(gArticlesDir, { label: 'global-vault-articles', repoName: 'global-vault' }));
      }
    }
  }

  return {
    node: 'local',
    isRemote: false,
    hubs: allHubs,
    count: allHubs.length,
    scope: 'all-vaults',
    vaultsScanned: localVaults.length,
  };
}
