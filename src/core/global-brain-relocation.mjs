import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const within = (dir, parent) => dir === parent || dir.startsWith(parent + path.sep);
const stat = (file) => fs.lstatSync(file, { throwIfNoEntry: false });

/** Resolve the home alias created by relocateGlobalSkills for installation hooks. */
export function resolveRelocatedGlobalBrainDir(brainDir, { home = os.homedir() } = {}) {
  const selected = path.resolve(brainDir);
  const skills = path.resolve(home, '.agent', 'skills');
  if (selected !== path.join(skills, 'total-recall')) return selected;
  const link = stat(skills);
  if (!link?.isSymbolicLink()) return selected;

  const target = fs.readlinkSync(skills);
  const uid = process.getuid?.();
  const ownedDirectory = (file, mask) => {
    const entry = stat(file);
    return entry?.isDirectory() && (uid === undefined || (entry.uid === uid && (entry.mode & mask) === 0));
  };
  const targetBrain = path.join(target, 'total-recall');
  if (!path.isAbsolute(target) || path.basename(target) !== 'skills' ||
      (uid !== undefined && link.uid !== uid) || !ownedDirectory(path.dirname(skills), 0o022) ||
      !ownedDirectory(path.dirname(target), 0o077) || !ownedDirectory(target, 0o022) ||
      !ownedDirectory(targetBrain, 0o022) || fs.realpathSync(skills) !== target) {
    throw new Error('Unsafe shared skills relocation: ' + skills);
  }
  return targetBrain;
}

function checkRelativeLinks(source, dir = source) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) checkRelativeLinks(source, file);
    if (entry.isSymbolicLink()) {
      const link = fs.readlinkSync(file);
      if (!path.isAbsolute(link) && !within(path.resolve(dir, link), source)) {
        throw new Error(`Relative link leaves the shared skills directory: ${file}`);
      }
    }
  }
}

function planRelocation(source, requested) {
  const absolute = path.resolve(requested);
  const parent = fs.realpathSync(path.dirname(absolute));
  const destination = path.join(parent, path.basename(absolute));
  const target = path.join(destination, 'skills');
  const sourceStat = stat(source);
  const brain = path.join(source, 'total-recall');
  if (!sourceStat || !stat(brain)?.isDirectory() || !fs.existsSync(path.join(brain, 'SKILL.md'))) {
    throw new Error(`No initialized global brain at ${brain}`);
  }
  if (sourceStat.isSymbolicLink() && fs.realpathSync(source) === target) {
    return { source, destination, target, status: 'already-relocated' };
  }
  if (!sourceStat.isDirectory()) throw new Error(`Shared skills path is already linked: ${source}`);
  if (within(destination, fs.realpathSync(source))) throw new Error('Destination is inside shared skills');
  if (stat(destination)) throw new Error(`Destination already exists: ${destination}`);
  for (let dir = parent; ; dir = path.dirname(dir)) {
    if (stat(path.join(dir, '.git'))) throw new Error('Destination must be outside Git worktrees');
    if (dir === path.dirname(dir)) break;
  }
  if (sourceStat.dev !== fs.statSync(parent).dev) throw new Error('Destination must be on the same filesystem');
  checkRelativeLinks(fs.realpathSync(source));
  return { source, destination, target, status: 'planned' };
}

export function relocateGlobalSkills(requested, { apply = false, home = os.homedir() } = {}) {
  const source = path.join(home, '.agent', 'skills');
  if (!apply) return planRelocation(source, requested);

  const lock = `${source}.relocate-lock`;
  try {
    fs.mkdirSync(lock, { mode: 0o700 });
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error(`Shared skills relocation is locked: ${lock}`);
    throw error;
  }
  try {
    const plan = planRelocation(source, requested);
    if (plan.status === 'already-relocated') return plan;

    fs.mkdirSync(plan.destination, { mode: 0o700 });
    try {
      fs.renameSync(source, plan.target);
      try {
        fs.symlinkSync(plan.target, source, 'dir');
      } catch (error) {
        try {
          if (stat(source)) throw new Error(`${source} reappeared during relocation`);
          fs.renameSync(plan.target, source);
        } catch (restoreError) {
          throw new Error(`Could not restore the home skills path. The original tree is at ${plan.target}. ${restoreError.message}`, { cause: error });
        }
        throw error;
      }
    } catch (error) {
      if (!stat(plan.target)) fs.rmdirSync(plan.destination);
      throw error;
    }
    return { ...plan, status: 'relocated' };
  } finally {
    fs.rmdirSync(lock);
  }
}
