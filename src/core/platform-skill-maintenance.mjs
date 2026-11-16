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
import { readProcessCommand, shouldHonorPidLock } from './pid-lock.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const RECEIPT = '.platform-distribution.json';
const LOCAL = '.platform-refresh';
const LOCK = '.platform-refresh.lock';
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

function verifyReceipt(target, skillId, wrapper, receipt) {
  if (!receipt) {
    if (wrapper.includes(START) || wrapper.includes(END)) throw new Error('Platform route has no receipt');
    return null;
  }
  if (Object.keys(receipt).sort().join(',') !== 'files,hash,package,package_version,schema,skill,skill_version,source_path' ||
      receipt.schema !== 1 || receipt.skill !== skillId || !/^[a-f0-9]{64}$/.test(receipt.hash) ||
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
  const identity = { package: receipt.package, package_version: receipt.package_version,
    skill: receipt.skill, skill_version: receipt.skill_version, files: receipt.files };
  if (typeof receipt.source_path !== 'string' || !path.isAbsolute(receipt.source_path) ||
      digest(JSON.stringify(identity)) !== receipt.hash) throw new Error('Invalid platform receipt provenance');
  return receipt;
}

function inspectState(target, skillId, wrapper) {
  const bytes = stat(regularPath(target, RECEIPT)) ? readRegular(target, RECEIPT) : null;
  const document = bytes ? JSON.parse(bytes) : null;
  if (document?.schema !== 2) return { receipt: verifyReceipt(target, skillId, wrapper, document), bytes, pending: null };
  const { checksum, ...intent } = document;
  if (Object.keys(intent).sort().join(',') !== 'after_wrapper_sha256,before_wrapper_sha256,next,previous,schema' ||
      checksum !== digest(JSON.stringify(intent)) ||
      !/^[a-f0-9]{64}$/.test(intent.before_wrapper_sha256) || !/^[a-f0-9]{64}$/.test(intent.after_wrapper_sha256) ||
      !intent.next || intent.next.schema !== 1 || intent.previous && intent.previous.schema !== 1) {
    throw new Error('Invalid platform refresh pending receipt');
  }
  const hash = digest(wrapper);
  const phase = hash === intent.before_wrapper_sha256 ? 'before-wrapper'
    : hash === intent.after_wrapper_sha256 ? 'after-wrapper' : null;
  if (!phase) throw new Error('Authored wrapper drift from pending platform refresh');
  // Validate both possible receipts and all core bytes. A journal never grants
  // authority to install an unverified layer, traverse private paths or infer a
  // missing receipt from a route alone.
  const before = phase === 'before-wrapper' ? wrapper : intent.previous
    ? wrapper.replace(routeFor(intent.next.hash), routeFor(intent.previous.hash))
    : wrapper.endsWith(`\n\n${routeFor(intent.next.hash)}\n`)
      ? wrapper.slice(0, -(`\n\n${routeFor(intent.next.hash)}\n`.length)) : null;
  if (before === null || digest(before) !== intent.before_wrapper_sha256) throw new Error('Invalid pending platform wrapper transition');
  verifyReceipt(target, skillId, before, intent.previous);
  const after = intent.previous ? before.replace(routeFor(intent.previous.hash), routeFor(intent.next.hash))
    : before + `\n\n${routeFor(intent.next.hash)}\n`;
  if (digest(after) !== intent.after_wrapper_sha256) throw new Error('Invalid pending platform wrapper transition');
  verifyReceipt(target, skillId, after, intent.next);
  return { receipt: intent.previous, bytes, pending: document, phase, after };
}

function syncDirectory(directory) {
  const fd = fs.openSync(directory, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}

function writeTemporary(target, data, mode = 0o600) {
  const directory = regularPath(target, LOCAL, { directory: true });
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = path.join(directory, crypto.randomUUID());
  const fd = fs.openSync(file, 'wx', mode);
  try {
    fs.writeFileSync(fd, data);
    fs.fchmodSync(fd, mode);
    fs.fsyncSync(fd);
  } catch (error) {
    fs.rmSync(file, { force: true });
    throw error;
  } finally { fs.closeSync(fd); }
  return file;
}

function publish(target, relative, data, expected) {
  const file = regularPath(target, relative);
  const tmp = writeTemporary(target, data, stat(file)?.mode & 0o777 || 0o600);
  try {
    regularPath(target, relative);
    const bytes = stat(file) ? readRegular(target, relative) : null;
    if (expected === null ? bytes !== null : !bytes?.equals(expected)) throw new Error(`Platform ${relative === 'SKILL.md' ? 'wrapper' : 'receipt'} changed during refresh`);
    fs.renameSync(tmp, file);
    syncDirectory(target);
  } finally { fs.rmSync(tmp, { force: true }); }
}

/* Lock ownership.
 *
 * POSIX has no atomic "remove this path only if it still holds the inode I
 * inspected". A reclaimer that checks a dead lock and then unlinks the path can
 * delete a live lock that another reclaimer created in between, and both then
 * run (reproduced with two real processes in the spec). Renaming the path away
 * does not help: it can move that live lock just the same.
 *
 * So nothing here ever removes a lock to take over. Each acquisition creates a
 * new generation, `.platform-refresh/lock-<n>`, with an exclusive link, which is
 * atomic and fails if the name exists. It then verifies from its own file that
 * no other lock is live. Two simultaneous reclaimers target the same name and
 * only one creates it; any other interleaving finds the other's live file and
 * yields. A false conflict only makes a caller retry; a second live holder
 * cannot pass the verification. Dead files are removed only by a holder, and a
 * removal that races a late creator is harmless because that creator verifies
 * against the holder and withdraws. A lock whose pid is alive but whose command
 * line is not its owner's (a reused pid) is dead. The pre-generation path
 * `.platform-refresh.lock` is read as generation zero and removed once dead.
 * Releases only delete the exact bytes their own acquisition wrote.
 * Mixed use with a release that predates generations is unsupported.
 */
const LOCK_NAME = /^lock-([1-9]\d{0,14})$/;
const lockRelative = generation => `${LOCAL}/lock-${generation}`;

function lockEntry(target, generation, relative) {
  const file = regularPath(target, relative);
  if (!stat(file)) return null;
  let bytes;
  try { bytes = readRegular(target, relative); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  let owner;
  try { owner = JSON.parse(bytes); } catch { throw new Error('EEXIST: Unknown platform refresh lock'); }
  if (owner.schema !== 1 || !Number.isInteger(owner.pid) || owner.pid < 1 ||
      typeof owner.command !== 'string' || !owner.command || !/^[a-f0-9-]{36}$/.test(owner.token || '')) {
    throw new Error('EEXIST: Unknown platform refresh lock');
  }
  const verdict = shouldHonorPidLock(owner.pid, { entryHint: owner.command, readCommand: readProcessCommand,
    isAlive: pid => { try { process.kill(pid, 0); return true; } catch (error) { if (error.code === 'ESRCH') return false; throw error; } } });
  return { generation, relative, bytes, dead: !verdict.honor };
}

function readLocks(target) {
  const locks = [lockEntry(target, 0, LOCK)];
  const directory = regularPath(target, LOCAL, { directory: true });
  if (stat(directory)) {
    for (const name of fs.readdirSync(directory)) {
      const match = LOCK_NAME.exec(name);
      if (match) locks.push(lockEntry(target, Number(match[1]), `${LOCAL}/${name}`));
    }
  }
  return locks.filter(Boolean).sort((a, b) => a.generation - b.generation);
}

function inspectLock(target) {
  const locks = readLocks(target);
  return locks.length ? { locks, dead: locks.every(lock => lock.dead) } : null;
}

function acquireLock(target) {
  const found = readLocks(target);
  if (found.some(lock => !lock.dead)) throw new Error('EEXIST: Platform refresh lock is held');
  const command = readProcessCommand(process.pid);
  if (!command) throw new Error('Cannot verify platform refresh process identity');
  const bytes = Buffer.from(JSON.stringify({ schema: 1, pid: process.pid, command, token: crypto.randomUUID() }));
  const relative = lockRelative((found.at(-1)?.generation ?? 0) + 1);
  const tmp = writeTemporary(target, bytes);
  try { fs.linkSync(tmp, regularPath(target, relative)); }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error('EEXIST: Platform refresh lock was taken by another process');
    throw error;
  } finally { fs.unlinkSync(tmp); }
  const owned = () => {
    try { return readRegular(target, relative).equals(bytes); } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
  };
  const release = () => { if (owned()) fs.unlinkSync(path.join(target, relative)); };
  try {
    const others = readLocks(target).filter(lock => lock.relative !== relative);
    if (!owned() || others.some(lock => !lock.dead)) throw new Error('EEXIST: Platform refresh lock is held or changed');
    for (const lock of others) {
      // Holder-only cleanup of abandoned files; bytes are re-read, never assumed.
      try {
        if (readRegular(target, lock.relative).equals(lock.bytes)) fs.unlinkSync(path.join(target, lock.relative));
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
  } catch (error) {
    release();
    throw error;
  }
  return release;
}

/** The CLI supplies only its own package root; distributionRoot is a test seam.
 * Apply requires the exact hash returned by a read-only plan. There is no force.
 */
export function refreshPlatformSkill({ skillId, repo, globalSkillsDir, apply = false, expectedSourceHash,
  distributionRoot = ROOT } = {}) {
  if (Boolean(repo) === Boolean(globalSkillsDir) || !stat(path.resolve(repo || globalSkillsDir))?.isDirectory()) {
    throw new Error('Platform refresh requires one existing repository or canonical global skills root');
  }
  // Resolve OS aliases above the explicitly selected root (e.g. macOS /var).
  // A link at the selected root itself is rejected by lstat above.
  const anchor = globalSkillsDir ? regularPath(path.resolve(globalSkillsDir), '', { directory: true }) : fs.realpathSync(repo);
  const available = sourceSnapshot(skillId, distributionRoot);
  const target = regularPath(anchor, globalSkillsDir ? skillId : `.agent/skills/${skillId}`, { directory: true });
  if (!stat(target)?.isDirectory()) throw new Error('Platform refresh requires an existing skill install');
  if (target === available.provenance.source_path || target.startsWith(available.provenance.source_path + path.sep) ||
      available.provenance.source_path.startsWith(target + path.sep)) throw new Error('Platform target aliases distribution source');
  const wrapperBytes = readRegular(target, 'SKILL.md');
  const wrapper = wrapperBytes.toString();
  if (matter(wrapper).data.name !== skillId) throw new Error('Existing wrapper belongs to another skill');
  const state = inspectState(target, skillId, wrapper);
  const previous = state.receipt;
  const next = state.pending?.next || { schema: 1, ...available.provenance, hash: available.hash };
  const { schema, hash, ...provenance } = next;
  // A pending transition is completed at its already verified pinned version,
  // even when the installed package advanced since the interrupted attempt.
  const source = { provenance, hash, entries: state.pending ? [] : available.entries };
  regularPath(target, LOCAL, { directory: true });
  const existingLock = inspectLock(target);
  const layer = `core/distributions/${source.hash}`;
  // Prevalidate the whole write set. Collisions are verified, never overwritten.
  for (const entry of source.entries) {
    const file = regularPath(target, `${layer}/${entry.path}`);
    if (stat(file) && !readRegular(target, `${layer}/${entry.path}`).equals(entry.data)) {
      throw new Error(`Unmanaged platform layer collision: ${entry.path}`);
    }
  }
  const nextWrapper = state.pending ? state.after : previous ? wrapper.replace(routeFor(previous.hash), routeFor(source.hash))
    : wrapper + `\n\n${routeFor(source.hash)}\n`;
  const result = { success: true, dryRun: !apply, skillId, target,
    source: { ...source.provenance, hash: source.hash }, previousHash: previous?.hash || null,
    availableSourceHash: available.hash,
    lock: existingLock ? existingLock.dead ? 'abandoned' : 'active' : 'absent',
    pending: state.pending ? { recoverable: true, phase: state.phase, lock: existingLock ? existingLock.dead ? 'abandoned' : 'active' : 'absent' } : null,
    current: !state.pending && previous?.hash === source.hash, actions: !state.pending && previous?.hash === source.hash ? [] : [
      ...source.entries.map(entry => ({ op: 'ensure-immutable-file', path: `${layer}/${entry.path}`, sha256: digest(entry.data) })),
      { op: 'route-preserved-wrapper', path: 'SKILL.md' }, { op: 'record-provenance', path: RECEIPT },
    ] };
  if (!apply) return result;
  if (expectedSourceHash !== source.hash) throw new Error('Apply requires --source-hash from the reviewed distribution plan');
  if (result.current && !existingLock) return result;
  const release = acquireLock(target);
  try {
    if (result.current) return { ...result, lock: 'absent' };
    // A competing refresh must not invalidate the plan while acquiring its lock.
    if (!readRegular(target, 'SKILL.md').equals(wrapperBytes) ||
        !((state.bytes === null && !stat(regularPath(target, RECEIPT))) ||
          state.bytes && readRegular(target, RECEIPT).equals(state.bytes))) {
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
    // Flush every referenced layer before the durable two-state receipt can
    // authorize its route. Private brain paths are never walked or flushed.
    const directories = new Set([target]);
    for (const relative of Object.keys(next.files)) {
      const file = regularPath(target, `${layer}/${relative}`);
      const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
      try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
      for (let dir = path.dirname(file); dir !== target; dir = path.dirname(dir)) directories.add(dir);
    }
    for (const dir of [...directories].sort((a, b) => b.length - a.length)) syncDirectory(dir);
    if (!readRegular(target, 'SKILL.md').equals(wrapperBytes)) throw new Error('Platform wrapper changed during refresh');
    const intent = { schema: 2, previous, next, before_wrapper_sha256: digest(wrapperBytes), after_wrapper_sha256: digest(nextWrapper) };
    const pendingBytes = state.bytes && state.pending ? state.bytes : Buffer.from(JSON.stringify({ ...intent, checksum: digest(JSON.stringify(intent)) }, null, 2) + '\n');
    if (!state.pending) publish(target, RECEIPT, pendingBytes, state.bytes);
    if (state.phase !== 'after-wrapper') publish(target, 'SKILL.md', nextWrapper, wrapperBytes);
    publish(target, RECEIPT, JSON.stringify(next, null, 2) + '\n', pendingBytes);
    inspectState(target, skillId, readRegular(target, 'SKILL.md').toString());
    return { ...result, pending: null, lock: 'absent', recovered: Boolean(state.pending), current: source.hash === available.hash };
  } finally {
    release();
  }
}
