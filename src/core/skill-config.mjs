/**
 * Repo-layer configuration for layered skills.
 *
 * A layered skill's plugin-owned core ships the layer contract as
 * `core/config.schema.json` (JSON Schema, root type object) and may ship
 * `core/detect.mjs`. The canonical repo config is a `skill_config` SSSS
 * document in the repo's project vault (`system/skills/<id>.md`), written
 * through the operation service after the whole config validates against the
 * contract. `config.json` next to `core/` is a projection of that record for
 * the core scripts to read; it is rebuilt after every write.
 *
 * Collections: an array property annotated with `"x-collection": "<noun>"`
 * gets `<noun> list|add|remove` verbs; items are keyed by `"x-key"` (default
 * `name`).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { writeVfsDocument } from './ssss-operation-service.mjs';
import { findVfsDocumentByPath } from './vfs-documents.mjs';

const SKILL_ID = /^[a-z][a-z0-9-]{0,63}$/;
const FORBIDDEN_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);

export class SkillConfigError extends Error {
  constructor(message, { exitCode = 2, issues = [] } = {}) {
    super(message);
    this.exitCode = exitCode;
    this.issues = issues;
  }
}

function regularFile(file) {
  return fs.existsSync(file) && !fs.lstatSync(file).isSymbolicLink() && fs.statSync(file).isFile();
}

/** Locate a deployed layered skill inside a repository. */
export function resolveSkillDir(repoRoot, skillId) {
  if (!SKILL_ID.test(skillId || '')) throw new SkillConfigError('Skill id must be lowercase kebab-case');
  const skillDir = path.join(path.resolve(repoRoot), '.agent', 'skills', skillId);
  if (!fs.existsSync(skillDir)) throw new SkillConfigError(`Skill '${skillId}' is not deployed in ${repoRoot}`, { exitCode: 1 });
  if (fs.lstatSync(skillDir).isSymbolicLink()) throw new SkillConfigError(`Refusing symlinked skill directory: ${skillDir}`, { exitCode: 1 });
  return skillDir;
}

/** Load and compile the core-owned layer contract. */
export function loadConfigSchema(skillDir) {
  const coreDir = path.join(skillDir, 'core');
  if (fs.existsSync(coreDir) && fs.lstatSync(coreDir).isSymbolicLink()) {
    throw new SkillConfigError(`Refusing symlinked skill core: ${coreDir}`, { exitCode: 1 });
  }
  const schemaPath = path.join(coreDir, 'config.schema.json');
  if (!regularFile(schemaPath)) {
    throw new SkillConfigError(`Skill has no config contract (expected core/config.schema.json)`, { exitCode: 1 });
  }
  const raw = fs.readFileSync(schemaPath);
  let schema;
  try { schema = JSON.parse(raw.toString('utf8')); }
  catch (error) { throw new SkillConfigError(`core/config.schema.json is not valid JSON: ${error.message}`, { exitCode: 1 }); }
  if (schema?.type !== 'object') throw new SkillConfigError('core/config.schema.json must describe an object', { exitCode: 1 });
  let validator;
  try { validator = z.fromJSONSchema(schema); }
  catch (error) { throw new SkillConfigError(`core/config.schema.json is not a supported JSON Schema: ${error.message}`, { exitCode: 1 }); }
  return { schema, validator, schemaPath, sha256: crypto.createHash('sha256').update(raw).digest('hex') };
}

function formatIssues(issues) {
  return issues.map((issue) => `${issue.path.length ? issue.path.join('.') : '(root)'}: ${issue.message}`);
}

/** Validate a whole config document; returns the normalized value (defaults applied). */
export function validateSkillConfig(contract, value) {
  const result = contract.validator.safeParse(value);
  if (result.success) return { valid: true, value: result.data, errors: [] };
  return { valid: false, value: null, errors: formatIssues(result.error.issues) };
}

export function configPath(skillDir) {
  return path.join(skillDir, 'config.json');
}

export function recordPath(skillId) {
  return `system/skills/${skillId}.md`;
}

/** The repo's own project vault. Never walks up into a parent project's brain. */
export function projectVaultFor(skillDir) {
  const repoRoot = path.resolve(skillDir, '..', '..', '..');
  const brain = path.join(repoRoot, '.agent', 'skills', 'total-recall');
  if (!regularFile(path.join(brain, 'SKILL.md'))) {
    throw new SkillConfigError(`No project brain in ${repoRoot}; run 'total-recall init --project' there first`, { exitCode: 1 });
  }
  return path.join(brain, 'memory-vault');
}

function readProjection(skillDir) {
  const file = configPath(skillDir);
  if (!fs.existsSync(file)) return null;
  if (!regularFile(file)) throw new SkillConfigError(`Refusing non-regular config file: ${file}`, { exitCode: 1 });
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { throw new SkillConfigError(`config.json is not valid JSON: ${error.message}`, { exitCode: 1 }); }
}

/**
 * Current repo config. `source` is 'record' (canonical), 'projection' (a
 * config.json with no record yet, e.g. a repo skill awaiting import), or null.
 */
export function readSkillConfigState(skillDir) {
  const skillId = path.basename(skillDir);
  const record = findVfsDocumentByPath(recordPath(skillId), projectVaultFor(skillDir));
  const projection = readProjection(skillDir);
  if (record) {
    if (record.type !== 'skill_config' || !record.config || typeof record.config !== 'object') {
      throw new SkillConfigError(`${recordPath(skillId)} is not a skill_config record`, { exitCode: 1 });
    }
    return { config: record.config, source: 'record', record, projection, inSync: isDeepStrictEqual(projection, record.config) };
  }
  return { config: projection, source: projection === null ? null : 'projection', record: null, projection, inSync: projection === null };
}

export function readSkillConfig(skillDir) {
  return readSkillConfigState(skillDir).config;
}

/** Rebuild config.json from the canonical record (atomic replace). */
export function projectSkillConfig(skillDir, config) {
  const file = configPath(skillDir);
  if (fs.existsSync(file) && !regularFile(file)) throw new SkillConfigError(`Refusing non-regular config file: ${file}`, { exitCode: 1 });
  const temp = path.join(skillDir, `.config.json.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(temp, `${JSON.stringify(config, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o644 });
  try { fs.renameSync(temp, file); }
  catch (error) { fs.rmSync(temp, { force: true }); throw error; }
}

/**
 * The single write path for repo-layer config: validate against the core
 * contract, commit the skill_config record through the SSSS operation service,
 * then rebuild the config.json projection.
 */
export async function writeSkillConfig(skillDir, contract, value) {
  const checked = validateSkillConfig(contract, value);
  if (!checked.valid) {
    throw new SkillConfigError(`Config does not satisfy core/config.schema.json:\n  ${checked.errors.join('\n  ')}`, { issues: checked.errors });
  }
  const file = configPath(skillDir);
  if (fs.existsSync(file) && !regularFile(file)) throw new SkillConfigError(`Refusing non-regular config file: ${file}`, { exitCode: 1 });
  const skillId = path.basename(skillDir);
  const vaultRoot = projectVaultFor(skillDir);
  const existing = findVfsDocumentByPath(recordPath(skillId), vaultRoot);
  const now = new Date().toISOString();
  const createdAt = existing?.created_at ? new Date(existing.created_at).toISOString() : now;
  await writeVfsDocument(recordPath(skillId), {
    type: 'skill_config',
    title: `Skill config: ${skillId}`,
    description: `Repo-layer configuration for the ${skillId} skill.`,
    timestamp: now,
    skill_id: skillId,
    config: checked.value,
    schema_sha256: contract.sha256,
    created_at: createdAt,
    ...(existing ? { updated_at: now } : {}),
  }, '', { actorRole: 'system', intent: `Update repo config for skill ${skillId}`, vaultRoot });
  projectSkillConfig(skillDir, checked.value);
  return checked.value;
}

function splitPath(dotted) {
  if (!dotted) return [];
  const segments = String(dotted).split('.');
  for (const segment of segments) {
    if (!segment || FORBIDDEN_SEGMENTS.has(segment)) throw new SkillConfigError(`Invalid config path '${dotted}'`);
  }
  return segments;
}

export function getConfigValue(config, dotted) {
  let node = config;
  for (const segment of splitPath(dotted)) {
    if (node === null || typeof node !== 'object' || !Object.hasOwn(node, segment)) return undefined;
    node = node[segment];
  }
  return node;
}

/** Return a copy of `config` with `dotted` set (or removed when `value` is undefined). */
export function setConfigValue(config, dotted, value) {
  const segments = splitPath(dotted);
  if (segments.length === 0) throw new SkillConfigError('A config path is required');
  const root = structuredClone(config ?? {});
  let node = root;
  for (const segment of segments.slice(0, -1)) {
    if (node[segment] === undefined) node[segment] = {};
    if (node[segment] === null || typeof node[segment] !== 'object') {
      throw new SkillConfigError(`Config path '${dotted}' crosses a non-object value at '${segment}'`);
    }
    node = node[segment];
  }
  const last = segments.at(-1);
  if (value === undefined) delete node[last];
  else node[last] = value;
  return root;
}

/** CLI values: JSON when it parses (numbers, booleans, arrays, objects), otherwise a string. */
export function parseCliValue(raw) {
  try { return JSON.parse(raw); } catch { return raw; }
}

/** Array properties exposed as collection verbs, keyed by noun. */
export function listCollections(schema) {
  const collections = {};
  for (const [property, definition] of Object.entries(schema.properties || {})) {
    const noun = definition?.['x-collection'];
    if (definition?.type === 'array' && typeof noun === 'string' && SKILL_ID.test(noun)) {
      collections[noun] = { property, key: definition['x-key'] || 'name' };
    }
  }
  return collections;
}

/** Parse `key=value` pairs (or one JSON object) into a collection item. */
export function parseCollectionItem(args) {
  if (args.length === 1 && args[0].trim().startsWith('{')) {
    const item = parseCliValue(args[0]);
    if (item && typeof item === 'object' && !Array.isArray(item)) return item;
    throw new SkillConfigError('Collection item must be a JSON object');
  }
  if (args.length === 0) throw new SkillConfigError('Collection item needs key=value fields or a JSON object');
  let item = {};
  for (const arg of args) {
    const at = arg.indexOf('=');
    if (at <= 0) throw new SkillConfigError(`Expected key=value, got '${arg}'`);
    item = setConfigValue(item, arg.slice(0, at), parseCliValue(arg.slice(at + 1)));
  }
  return item;
}

export function addCollectionItem(config, collection, item) {
  const current = getConfigValue(config, collection.property) ?? [];
  if (!Array.isArray(current)) throw new SkillConfigError(`'${collection.property}' is not an array`);
  const key = item?.[collection.key];
  if (key === undefined || key === '') throw new SkillConfigError(`Item needs a '${collection.key}' field`);
  if (current.some((entry) => entry?.[collection.key] === key)) {
    throw new SkillConfigError(`${collection.property} already has ${collection.key} '${key}'`);
  }
  return setConfigValue(config, collection.property, [...current, item]);
}

export function removeCollectionItem(config, collection, key) {
  const current = getConfigValue(config, collection.property) ?? [];
  if (!Array.isArray(current)) throw new SkillConfigError(`'${collection.property}' is not an array`);
  const next = current.filter((entry) => String(entry?.[collection.key]) !== String(key));
  if (next.length === current.length) throw new SkillConfigError(`${collection.property} has no ${collection.key} '${key}'`, { exitCode: 1 });
  return setConfigValue(config, collection.property, next);
}

/** Run the core's detector. It proposes a config; nothing is written here. */
export async function detectSkillConfig(skillDir, repoRoot) {
  const detector = path.join(skillDir, 'core', 'detect.mjs');
  if (!regularFile(detector)) throw new SkillConfigError('Skill core has no detector (expected core/detect.mjs)', { exitCode: 1 });
  const mod = await import(`${pathToFileURL(detector).href}?t=${fs.statSync(detector).mtimeMs}`);
  const detect = mod.detect || mod.default;
  if (typeof detect !== 'function') throw new SkillConfigError('core/detect.mjs must export detect()', { exitCode: 1 });
  const proposal = await detect({ repoRoot: path.resolve(repoRoot), skillDir });
  if (!proposal || typeof proposal !== 'object' || Array.isArray(proposal)) {
    throw new SkillConfigError('detect() must return a config object', { exitCode: 1 });
  }
  return proposal;
}

/** Required top-level properties still absent from `config`. */
export function missingRequired(schema, config) {
  return (schema.required || []).filter((key) => config?.[key] === undefined);
}

/** Values at schema locations annotated `"x-command": true`, with their config paths. */
export function collectCommandValues(schema, value, at = []) {
  if (!schema || value === undefined || value === null) return [];
  if (schema['x-command'] === true && typeof value === 'string') return [{ path: at.join('.'), command: value }];
  const found = [];
  if (schema.type === 'array' && Array.isArray(value) && schema.items) {
    value.forEach((item, i) => found.push(...collectCommandValues(schema.items, item, [...at, String(i)])));
  }
  if (schema.properties && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(schema.properties)) {
      found.push(...collectCommandValues(child, value[key], [...at, key]));
    }
  }
  return found;
}

function onPath(binary) {
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    if (!dir) continue;
    const candidate = path.join(dir, binary);
    try {
      if (fs.statSync(candidate).isFile()) { fs.accessSync(candidate, fs.constants.X_OK); return true; }
    } catch { /* keep looking */ }
  }
  return false;
}

/** Whether a gate command's program exists; does not run it. */
export function resolveCommand(command, repoRoot) {
  const tokens = String(command).trim().split(/\s+/).filter(Boolean);
  while (tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[0])) tokens.shift();
  const program = tokens[0];
  if (!program) return { ok: false, reason: 'empty command' };
  if (path.isAbsolute(program)) {
    return fs.existsSync(program) ? { ok: true } : { ok: false, reason: `${program} does not exist` };
  }
  if (program.includes('/')) {
    const file = path.resolve(repoRoot, program);
    const inside = !path.relative(repoRoot, file).startsWith('..');
    return inside && fs.existsSync(file) ? { ok: true } : { ok: false, reason: `${program} does not exist in the repo` };
  }
  if (['npm', 'pnpm', 'yarn', 'bun'].includes(program) && tokens[1] === 'run' && tokens[2]) {
    let scripts = {};
    try { scripts = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).scripts || {}; } catch { /* no package.json */ }
    return Object.hasOwn(scripts, tokens[2]) ? { ok: true } : { ok: false, reason: `package.json has no '${tokens[2]}' script` };
  }
  return onPath(program) ? { ok: true } : { ok: false, reason: `'${program}' is not on PATH` };
}

/**
 * Check a deployed layered skill's repo layer against its core contract.
 * Shared by `skill status`, `skill config <id> check`, and `app verify`.
 * Each check is { id, level: 'error'|'warn', ok, message }; `ok` is false when
 * any error-level check fails.
 */
export function checkSkillLayerContract(skillDir) {
  const skillId = path.basename(skillDir);
  const repoRoot = path.resolve(skillDir, '..', '..', '..');
  const checks = [];
  const add = (id, ok, message, level = 'error') => checks.push({ id, level, ok, message });
  const result = () => ({ skill_id: skillId, path: skillDir, ok: checks.every((c) => c.ok || c.level !== 'error'), checks });

  let contract;
  try { contract = loadConfigSchema(skillDir); add('contract', true, 'core/config.schema.json loads'); }
  catch (error) { add('contract', false, error.message); return result(); }

  let state;
  try { state = readSkillConfigState(skillDir); }
  catch (error) { add('record', false, error.message); return result(); }
  if (state.source === null) { add('record', false, `Not configured; run 'total-recall skill config ${skillId} init'`); return result(); }
  if (state.source === 'projection') {
    add('record', false, `config.json is not recorded in SSSS; run 'total-recall skill config ${skillId} import'`);
  } else {
    add('record', true, `Recorded at ${recordPath(skillId)}`);
  }

  const checked = validateSkillConfig(contract, state.config);
  add('config', checked.valid, checked.valid ? 'Config satisfies the contract' : `Config violates the contract: ${checked.errors.join('; ')}`);
  if (state.source === 'record') {
    const current = state.record.schema_sha256 === contract.sha256;
    add('contract-version', current, current ? 'Validated against the current core contract'
      : 'The core contract changed since this config was recorded; re-save it to re-validate', 'warn');
    add('projection', state.inSync, state.inSync ? 'config.json matches the record'
      : `config.json has drifted from the record; run 'total-recall skill config ${skillId} rebuild'`);
  }
  for (const { path: at, command } of collectCommandValues(contract.schema, state.config)) {
    const resolved = resolveCommand(command, repoRoot);
    add(`command:${at}`, resolved.ok, resolved.ok ? `${at}: '${command}' resolves` : `${at}: ${resolved.reason}`);
  }
  return result();
}
