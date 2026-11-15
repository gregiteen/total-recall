/** Refresh only a shipped platform skill's routed distribution layer.
 * Never stage, rename, enumerate or copy a destination brain tree. Existing
 * authored files and canonical writers retain their directories and inodes.
 * Immutable content-addressed layers also keep earlier relative links valid.
 * Filesystem contract: https://nodejs.org/api/fs.html (verified 2026-11-15).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import matter from './frontmatter.mjs';
import { readSkillPackage, skillPackageExcludedPath } from './skills-registry.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const RECEIPT = '.platform-distribution.json';
const START = '<!-- total-recall:platform-distribution:v1 -->';
const END = '<!-- /total-recall:platform-distribution:v1 -->';
const digest = data => crypto.createHash('sha256').update(data).digest('hex');
const stat = file => fs.lstatSync(file, { throwIfNoEntry: false });

function safeRelative(relative) {
  if (typeof relative !== 'string' || !/^[\w.-]+(?:\/[\w.-]+)*$/.test(relative) ||
      relative.split('/').some(part => part === '.' || part === '..') || skillPackageExcludedPath(relative)) {
    throw new Error(`Unsafe platform skill file: ${relative}`);
  }
}

// Check all ancestors too: O_NOFOLLOW alone protects only the final component.
function regularPath(root, relative = '', { directory = false } = {}) {
  const target = path.resolve(root, relative);
  let cursor = target;
  for (;;) {
    const entry = stat(cursor);
    if (entry && (cursor !== target || directory ? !entry.isDirectory() : !entry.isFile())) {
      throw new Error(`Unsafe platform skill path: ${cursor}`);
    }
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  return target;
}

function readRegular(root, relative) {
  const file = regularPath(root, relative);
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try { return fs.readFileSync(fd); } finally { fs.closeSync(fd); }
}

function sourceSnapshot(skillId, distributionRoot) {
  if (!/^[a-z][a-z0-9-]{1,63}$/.test(skillId || '')) throw new Error('Invalid platform skill id');
  const root = fs.realpathSync(distributionRoot);
  const pkg = JSON.parse(readRegular(root, 'package.json'));
  const owner = JSON.parse(readRegular(fs.realpathSync(ROOT), 'package.json')).name;
  if (pkg.name !== owner || typeof pkg.version !== 'string') throw new Error('Invalid platform distribution owner');
  const source = regularPath(root, `scaffold/.agent/skills/${skillId}`, { directory: true });
  const entries = readSkillPackage(source, { strictLinks: true });
  const entrypoint = entries.find(entry => entry.path === 'SKILL.md');
  if (!entrypoint) throw new Error('Missing platform skill entrypoint');
  const wrapper = matter(entrypoint.data.toString());
  if (wrapper.data.name !== skillId || wrapper.data.repo_scoped || wrapper.data.metadata?.source !== pkg.name) {
    throw new Error('Platform skill must declare its distribution owner and portable scope');
  }
  for (const entry of entries) safeRelative(entry.path);
  const files = Object.fromEntries(entries.map(entry => [entry.path, digest(entry.data)]));
  const provenance = { package: pkg.name, package_version: pkg.version,
    skill: skillId, skill_version: String(wrapper.data.metadata?.version || wrapper.data.version || '0.0.0'),
    source_path: source, files };
  // The physical path is evidence, not content identity: relocation is harmless.
  const { source_path, ...identity } = provenance;
  return { entries, provenance, hash: digest(JSON.stringify(identity)) };
}

function routeFor(hash) {
  return `${START}\nRead the [maintained platform core](core/distributions/${hash}/SKILL.md) for current protocol contracts. Preserve authored instructions outside this block.\n${END}`;
}

function inspectReceipt(target, skillId, wrapper) {
  if (!stat(regularPath(target, RECEIPT))) {
    if (wrapper.includes(START) || wrapper.includes(END)) throw new Error('Platform route has no receipt');
    return null;
  }
  const receipt = JSON.parse(readRegular(target, RECEIPT));
  if (receipt.schema !== 1 || receipt.skill !== skillId || !/^[a-f0-9]{64}$/.test(receipt.hash) ||
      !receipt.files || !Object.keys(receipt.files).length || receipt.files['SKILL.md'] === undefined) {
    throw new Error('Invalid platform distribution receipt');
  }
  const block = routeFor(receipt.hash);
  if (wrapper.split(START).length !== 2 || wrapper.split(END).length !== 2 || !wrapper.includes(block)) {
    throw new Error('Authored platform route drift; refusing replacement');
  }
  for (const [relative, hash] of Object.entries(receipt.files)) {
    safeRelative(relative);
    if (!/^[a-f0-9]{64}$/.test(hash) || digest(readRegular(target, `core/distributions/${receipt.hash}/${relative}`)) !== hash) {
      throw new Error(`Maintained platform core drift: ${relative}`);
    }
  }
  return receipt;
}

/** The CLI supplies only its own package root; distributionRoot is a test seam.
 * Apply requires the exact hash returned by a read-only plan. There is no force.
 */
export function refreshPlatformSkill({ skillId, repo, apply = false, expectedSourceHash,
  distributionRoot = ROOT } = {}) {
  if (!repo || !stat(path.resolve(repo))?.isDirectory()) {
    throw new Error('Platform refresh requires an existing repository or home root');
  }
  // Resolve OS aliases above the explicitly selected root (e.g. macOS /var).
  // A link at the selected root itself is rejected by lstat above.
  const repoRoot = fs.realpathSync(repo);
  const source = sourceSnapshot(skillId, distributionRoot);
  const target = regularPath(repoRoot, `.agent/skills/${skillId}`, { directory: true });
  if (!stat(target)?.isDirectory()) throw new Error('Platform refresh requires an existing skill install');
  if (target === source.provenance.source_path || target.startsWith(source.provenance.source_path + path.sep) ||
      source.provenance.source_path.startsWith(target + path.sep)) throw new Error('Platform target aliases distribution source');
  const wrapperBytes = readRegular(target, 'SKILL.md');
  const wrapper = wrapperBytes.toString();
  if (matter(wrapper).data.name !== skillId) throw new Error('Existing wrapper belongs to another skill');
  const previous = inspectReceipt(target, skillId, wrapper);
  const layer = `core/distributions/${source.hash}`;
  // Prevalidate the whole write set. Collisions are verified, never overwritten.
  for (const entry of source.entries) {
    const file = regularPath(target, `${layer}/${entry.path}`);
    if (stat(file) && !readRegular(target, `${layer}/${entry.path}`).equals(entry.data)) {
      throw new Error(`Unmanaged platform layer collision: ${entry.path}`);
    }
  }
  const nextWrapper = previous ? wrapper.replace(routeFor(previous.hash), routeFor(source.hash))
    : wrapper + `\n\n${routeFor(source.hash)}\n`;
  const result = { success: true, dryRun: !apply, skillId, target,
    source: { ...source.provenance, hash: source.hash }, previousHash: previous?.hash || null,
    current: previous?.hash === source.hash, actions: previous?.hash === source.hash ? [] : [
      ...source.entries.map(entry => ({ op: 'ensure-immutable-file', path: `${layer}/${entry.path}`, sha256: digest(entry.data) })),
      { op: 'route-preserved-wrapper', path: 'SKILL.md' }, { op: 'record-provenance', path: RECEIPT },
    ] };
  if (!apply) return result;
  if (expectedSourceHash !== source.hash) throw new Error('Apply requires --source-hash from the reviewed distribution plan');
  if (result.current) return result;
  const lock = path.join(target, '.platform-refresh.lock');
  const fd = fs.openSync(lock, 'wx', 0o600);
  try {
    // A competing refresh must not invalidate the plan while acquiring its lock.
    if (!readRegular(target, 'SKILL.md').equals(wrapperBytes) ||
        JSON.stringify(inspectReceipt(target, skillId, wrapper)) !== JSON.stringify(previous)) {
      throw new Error('Platform install changed during planning');
    }
    for (const entry of source.entries) {
      const relative = `${layer}/${entry.path}`;
      const file = regularPath(target, relative);
      if (stat(file)) {
        if (!readRegular(target, relative).equals(entry.data)) throw new Error(`Platform layer drift: ${entry.path}`);
        continue;
      }
      fs.mkdirSync(path.dirname(file), { recursive: true });
      regularPath(target, relative);
      fs.writeFileSync(file, entry.data, { flag: 'wx', mode: entry.mode });
    }
    // Source bytes are already snapshotted; a moving distribution cannot change
    // what this plan installs. Only these two small managed files are replaced.
    const publish = (relative, data, expected) => {
      const file = regularPath(target, relative);
      const tmp = `${file}.${crypto.randomUUID()}.tmp`;
      try {
        fs.writeFileSync(tmp, data, { flag: 'wx', mode: stat(file)?.mode & 0o777 || 0o600 });
        fs.chmodSync(tmp, stat(file)?.mode & 0o777 || 0o600);
        regularPath(target, relative);
        if (expected && !readRegular(target, relative).equals(expected)) throw new Error('Platform wrapper changed during refresh');
        fs.renameSync(tmp, file);
      } finally { fs.rmSync(tmp, { force: true }); }
    };
    publish('SKILL.md', nextWrapper, wrapperBytes);
    publish(RECEIPT, JSON.stringify({ schema: 1, ...source.provenance, hash: source.hash }, null, 2) + '\n');
    inspectReceipt(target, skillId, readRegular(target, 'SKILL.md').toString());
    return result;
  } finally {
    fs.closeSync(fd);
    fs.unlinkSync(lock);
  }
}
