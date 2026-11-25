/**
 * Give a repository its gate list.
 *
 *   ensureGates(repoRoot)                  create, import or rebuild; never overwrite
 *   ensureGates(repoRoot, { dryRun: true }) the same decision with nothing written
 *
 * The list is recorded as a `skill_config` document in the repository's project
 * vault; `.agent/skills/code-quality/config.json` is its projection. States:
 *
 *   configured   record and config.json agree; nothing to do
 *   unrecorded   config.json exists with no record: imported
 *   unprojected  record exists with no config.json: rebuilt
 *   missing      neither exists: detected from the repository and recorded
 *   drifted      both exist and differ: reported, never changed
 *   invalid      unreadable or breaks the contract: reported, never changed
 *   no-brain     no Total Recall project brain to record it in
 *
 * Detection reads the repository; it never runs a gate. A configured repository also gets a
 * `.gitignore` in its state folder for reports and locks, and nothing else.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { hostRoot } from './host.mjs';
import { detect } from './detect.mjs';

export const CORE_DIR = path.dirname(fileURLToPath(import.meta.url));
export const SKILL_ID = 'code-quality';

/** States in which a repository has no usable gate list. */
export const NEEDS_ENSURE = new Set(['missing', 'unrecorded', 'unprojected']);
/** States `ensure` reports and leaves alone. */
export const NEEDS_ATTENTION = new Set(['drifted', 'invalid', 'no-brain']);

const isFile = (file) => { try { return fs.statSync(file).isFile(); } catch { return false; } };

export function hasProjectBrain(repoRoot) {
  return isFile(path.join(repoRoot, '.agent', 'skills', 'total-recall', 'SKILL.md'));
}

export async function hostSkillConfig(root = hostRoot()) {
  return import(pathToFileURL(path.join(root, 'src', 'core', 'skill-config.mjs')).href);
}

const STATE_IGNORE = ['reports/', '.check.lock'];

/** Reports and locks are this machine's state; the gate list beside them is meant to be committed. */
export function ignoreState(skillDir) {
  const file = path.join(skillDir, '.gitignore');
  let current = '';
  try { current = fs.readFileSync(file, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const have = new Set(current.split(/\r?\n/).map((line) => line.trim()));
  const missing = STATE_IGNORE.filter((entry) => !have.has(entry));
  if (!missing.length) return false;
  fs.writeFileSync(file, `${current && !current.endsWith('\n') ? `${current}\n` : current}${missing.join('\n')}\n`);
  return true;
}

const gatesOf = (config) => (config?.checks || []).map((check) => check.id);

/**
 * @param {string} repoRoot absolute path
 * @returns {Promise<{ repo: string, state: string, action: string, gates: string[], error?: string }>}
 */
export async function ensureGates(repoRoot, options = {}) {
  const result = await decide(repoRoot, options);
  if (!options.dryRun && result.state === 'configured') ignoreState(path.join(result.repo, '.agent', 'skills', SKILL_ID));
  return result;
}

async function decide(repoRoot, { dryRun = false, host } = {}) {
  const repo = path.resolve(repoRoot);
  const base = { repo, state: 'missing', action: 'none', gates: [] };
  if (!hasProjectBrain(repo)) return { ...base, state: 'no-brain', error: `No Total Recall project brain in ${repo}; run: total-recall brain ensure ${repo}` };
  const skillDir = path.join(repo, '.agent', 'skills', SKILL_ID);
  try {
    const exists = fs.existsSync(skillDir);
    if (exists && fs.lstatSync(skillDir).isSymbolicLink()) throw new Error(`Refusing symlinked skill directory: ${skillDir}`);
    // Resolving registers the plugin's contract and creates the directory, so a dry run of a
    // repository with none decides from the detector alone.
    if (dryRun && !exists) return { ...base, action: 'would-create', gates: gatesOf(detect({ repoRoot: repo })) };
    const api = host || await hostSkillConfig();
    api.resolveSkillDir(repo, SKILL_ID, { coreDir: CORE_DIR });
    const contract = api.loadConfigSchema(skillDir);
    const state = api.readSkillConfigState(skillDir);

    if (state.source === null) {
      const detected = await api.detectSkillConfig(skillDir, repo);
      const checked = api.validateSkillConfig(contract, detected);
      if (!checked.valid) return { ...base, state: 'invalid', error: `Detected gates do not satisfy the contract: ${checked.errors.join('; ')}` };
      if (dryRun) return { ...base, state: 'missing', action: 'would-create', gates: gatesOf(checked.value) };
      await api.writeSkillConfig(skillDir, contract, detected);
      return { ...base, state: 'configured', action: 'created', gates: gatesOf(checked.value) };
    }

    const checked = api.validateSkillConfig(contract, state.config);
    if (!checked.valid) return { ...base, state: 'invalid', gates: gatesOf(state.config), error: checked.errors.join('; ') };
    if (state.source === 'projection') {
      if (dryRun) return { ...base, state: 'unrecorded', action: 'would-import', gates: gatesOf(checked.value) };
      await api.writeSkillConfig(skillDir, contract, state.projection);
      return { ...base, state: 'configured', action: 'imported', gates: gatesOf(checked.value) };
    }
    if (state.projection === null) {
      if (dryRun) return { ...base, state: 'unprojected', action: 'would-rebuild', gates: gatesOf(checked.value) };
      api.projectSkillConfig(skillDir, state.record.config);
      return { ...base, state: 'configured', action: 'rebuilt', gates: gatesOf(checked.value) };
    }
    if (!state.inSync) return { ...base, state: 'drifted', gates: gatesOf(state.config), error: `config.json differs from its record; run: total-recall code-quality config rebuild` };
    return { ...base, state: 'configured', action: 'none', gates: gatesOf(state.config) };
  } catch (error) {
    return { ...base, state: 'invalid', error: error.message };
  }
}
