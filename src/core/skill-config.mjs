/**
 * Repo-layer configuration for layered skills.
 *
 * A layered skill's plugin-owned core ships the layer contract as
 * `core/config.schema.json` (JSON Schema, root type object) and may ship
 * `core/detect.mjs`. The repo-owned `config.json` next to `core/` is only ever
 * written here, after the whole document validates against that schema, so
 * every CLI customization path produces a config the core scripts can read.
 *
 * Collections: an array property annotated with `"x-collection": "<noun>"`
 * gets `<noun> list|add|remove` verbs; items are keyed by `"x-key"` (default
 * `name`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';

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
  let schema;
  try { schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8')); }
  catch (error) { throw new SkillConfigError(`core/config.schema.json is not valid JSON: ${error.message}`, { exitCode: 1 }); }
  if (schema?.type !== 'object') throw new SkillConfigError('core/config.schema.json must describe an object', { exitCode: 1 });
  let validator;
  try { validator = z.fromJSONSchema(schema); }
  catch (error) { throw new SkillConfigError(`core/config.schema.json is not a supported JSON Schema: ${error.message}`, { exitCode: 1 }); }
  return { schema, validator, schemaPath };
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

export function readSkillConfig(skillDir) {
  const file = configPath(skillDir);
  if (!fs.existsSync(file)) return null;
  if (!regularFile(file)) throw new SkillConfigError(`Refusing non-regular config file: ${file}`, { exitCode: 1 });
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { throw new SkillConfigError(`config.json is not valid JSON: ${error.message}`, { exitCode: 1 }); }
}

/** The single write path for repo-layer config: validate, then replace atomically. */
export function writeSkillConfig(skillDir, contract, value) {
  const checked = validateSkillConfig(contract, value);
  if (!checked.valid) {
    throw new SkillConfigError(`Config does not satisfy core/config.schema.json:\n  ${checked.errors.join('\n  ')}`, { issues: checked.errors });
  }
  const file = configPath(skillDir);
  if (fs.existsSync(file) && !regularFile(file)) throw new SkillConfigError(`Refusing non-regular config file: ${file}`, { exitCode: 1 });
  const temp = path.join(skillDir, `.config.json.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(temp, `${JSON.stringify(checked.value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o644 });
  try { fs.renameSync(temp, file); }
  catch (error) { fs.rmSync(temp, { force: true }); throw error; }
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
