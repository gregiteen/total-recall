import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { readSkillMeta } from '../core/skills-registry.mjs';
import { detectProjectBrain, getGlobalAgentDir, getGlobalBrainDir } from './agent-dir.mjs';
import { IDE_SKILLS, skillSourceRoots } from './skill-projection.mjs';

const missing = new Set(['ENOENT', 'ENOTDIR', 'ELOOP']);
const stat = file => fs.lstatSync(file, { throwIfNoEntry: false });

function danglingLink(file) {
  if (!stat(file)?.isSymbolicLink()) return null;
  const target = fs.readlinkSync(file);
  try {
    fs.statSync(file);
    return null;
  } catch (error) {
    if (!missing.has(error.code)) throw error;
    return { target, reason: error.code };
  }
}

export function inspectSkillLinks({ root, agentDir, brainDir, scope }) {
  const dirs = [
    ...skillSourceRoots(agentDir),
    path.join(brainDir, 'skills'),
    path.join(root, '.codex', 'skills'),
    path.join(root, '.gemini', 'skills'),
    path.join(root, '.github', 'skills'),
    ...IDE_SKILLS.flatMap(ide => ide[scope] ? [path.join(root, ...ide[scope].dir)] : []),
  ];
  const seen = new Set();
  const broken = [];
  let checked = 0;
  for (const dir of new Set(dirs)) {
    const item = stat(dir);
    if (!item) continue;
    const dirLink = danglingLink(dir);
    if (dirLink) {
      broken.push({ path: path.relative(root, dir), ...dirLink, directory: true });
      continue;
    }
    const physicalDir = fs.realpathSync(dir);
    if (seen.has(physicalDir) || !fs.statSync(dir).isDirectory()) continue;
    seen.add(physicalDir);
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isSymbolicLink()) continue;
      checked++;
      const file = path.join(dir, entry.name);
      const dangling = danglingLink(file);
      if (dangling) broken.push({ path: path.relative(root, file), ...dangling });
    }
  }
  return { root, scope, checked, broken };
}

function createArchive(archiveBrainDir, root) {
  const backupDir = path.join(archiveBrainDir, '.backups');
  fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
  if (!stat(backupDir).isDirectory()) throw new Error('Unsafe skills backup directory: ' + backupDir);
  const archive = fs.mkdtempSync(path.join(backupDir, 'skill-links-'));
  fs.writeFileSync(path.join(archive, 'scope.json'), JSON.stringify({ root }) + '\n', { mode: 0o600 });
  return archive;
}

export function archiveDanglingSkillLinks({ root, brainDir, archiveBrainDir = brainDir, broken, scope }, paths) {
  const physicalRoot = fs.realpathSync(root);
  const sharedSkills = scope === 'global' ? fs.realpathSync(path.dirname(brainDir)) : null;
  const candidates = [...new Set(paths)].map(relative => {
    const row = broken.find(entry => entry.path === relative && !entry.directory);
    if (!row) throw new Error('Expected a dangling skill entry from the audit: ' + relative);
    const file = path.join(root, relative);
    const physicalDir = fs.realpathSync(path.dirname(file));
    const declaredDir = path.join(physicalRoot, path.dirname(relative));
    if (!physicalDir.startsWith(physicalRoot + path.sep) ||
        (sharedSkills && physicalDir !== declaredDir && physicalDir !== sharedSkills &&
          physicalDir !== path.join(sharedSkills, 'total-recall', 'skills'))) {
      throw new Error('Skill link is outside the selected scope: ' + file);
    }
    return { ...row, file };
  });
  const archiveRoot = createArchive(archiveBrainDir, root);
  const archived = [];
  for (const candidate of candidates) {
    const backup = path.join(archiveRoot, candidate.path);
    fs.mkdirSync(path.dirname(backup), { recursive: true, mode: 0o700 });
    if (danglingLink(candidate.file)?.target !== candidate.target) {
      throw new Error(`Skill link changed during the audit: ${candidate.file}. Archive: ${archiveRoot}`);
    }
    fs.renameSync(candidate.file, backup);
    archived.push({ path: candidate.path, target: candidate.target, backup });
  }
  return archived;
}

export function linkSharedSkill({ root, agentDir, sharedSkillsDir, archiveBrainDir }, name) {
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(name) || name === 'total-recall') throw new Error('Expected a portable shared skill name');
  const source = path.join(sharedSkillsDir, name);
  if (!stat(source)?.isDirectory() || !stat(path.join(source, 'SKILL.md'))?.isFile()) {
    throw new Error('No installed shared skill: ' + name);
  }
  const meta = readSkillMeta(source);
  if (meta.id !== name || meta.repo_scoped) throw new Error('Skill does not match a portable shared skill: ' + name);
  const skillsDir = path.join(agentDir, 'skills');
  const physicalDir = fs.realpathSync(skillsDir);
  const physicalRoot = fs.realpathSync(root);
  if (!['.agent', '.agents'].some(dir => physicalDir === path.join(physicalRoot, dir, 'skills'))) {
    throw new Error('Expected an independent project skills directory: ' + skillsDir);
  }
  const destination = path.join(skillsDir, name);
  const existing = stat(destination);
  if (existing?.isSymbolicLink() && fs.existsSync(destination) && fs.realpathSync(destination) === fs.realpathSync(source)) {
    return { destination, source, status: 'already-linked' };
  }
  if (existing && !existing.isSymbolicLink() && !existing.isDirectory()) {
    throw new Error('Cannot replace a non-skill entry: ' + destination);
  }
  const backup = existing ? path.join(createArchive(archiveBrainDir, root), path.relative(root, destination)) : null;
  if (backup) {
    fs.mkdirSync(path.dirname(backup), { recursive: true, mode: 0o700 });
    fs.renameSync(destination, backup);
  }
  try {
    fs.symlinkSync(process.platform === 'win32' ? source : path.relative(physicalDir, source), destination,
      process.platform === 'win32' ? 'junction' : 'dir');
  } catch (error) {
    if (backup && !stat(destination)) fs.renameSync(backup, destination);
    if (backup && stat(backup)) throw new Error(`Could not link shared skill: ${error.message}. Previous entry: ${backup}`);
    throw error;
  }
  return { destination, source, backup, status: 'linked' };
}

export async function manageSkillLinks(args, layer) {
  const { values } = parseArgs({ args, options: {
    repo: { type: 'string' },
    archive: { type: 'string', multiple: true },
    'use-shared': { type: 'string' },
    json: { type: 'boolean' },
  } });
  if (layer === 'global' && values.repo) throw new Error('Choose either --global or --repo');
  if (values.archive && values['use-shared']) throw new Error('Choose either --archive or --use-shared');
  const project = layer === 'global' ? null : detectProjectBrain(path.resolve(values.repo || process.cwd()));
  if ((layer === 'project' || values.repo) && !project) throw new Error('No project brain found');
  if (values.repo && fs.realpathSync(values.repo) !== fs.realpathSync(project.projectRoot)) {
    throw new Error('--repo must be the selected project root');
  }
  const agentDir = project?.agentDir ?? getGlobalAgentDir();
  const brainDir = project?.brainDir ?? getGlobalBrainDir();
  const options = { root: project?.projectRoot ?? path.dirname(agentDir), agentDir, brainDir, scope: project ? 'project' : 'global' };
  const archiveBrainDir = getGlobalBrainDir();
  if (values['use-shared']) {
    if (!project) throw new Error('--use-shared requires a project brain');
    const linked = linkSharedSkill({
      ...options, archiveBrainDir, sharedSkillsDir: path.join(getGlobalAgentDir(), 'skills'),
    }, values['use-shared']);
    const { recompileAfterPluginMutation } = await import('../core/plugin-store.mjs');
    const compilation = await recompileAfterPluginMutation(options.root);
    if (values.json) console.log(JSON.stringify({ ...linked, compilation }));
    else {
      console.log(`${linked.destination} → ${linked.source}`);
      if (linked.backup) console.log(`  Previous entry archived at ${linked.backup}`);
      if (!compilation.ok) console.error(compilation.error);
    }
    if (!compilation.ok) process.exitCode = 1;
    return;
  }
  const before = inspectSkillLinks(options);
  const archived = values.archive ? archiveDanglingSkillLinks({ ...before, brainDir, archiveBrainDir }, values.archive) : [];
  const after = archived.length ? inspectSkillLinks(options) : before;
  const report = { ...after, archived };
  if (values.json) console.log(JSON.stringify(report));
  else {
    console.log(`${report.checked} skill links checked in ${report.root}. ${report.broken.length} dangling.`);
    for (const link of report.broken) console.log(`  ${link.path} → ${link.target} (${link.reason})`);
    for (const link of archived) console.log(`  Archived ${link.path} at ${link.backup}`);
  }
  if (report.broken.length) process.exitCode = 1;
}
