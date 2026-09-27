/**
 * App-runtime CLI generation.
 *
 * A capability plugin declares the command-line interface its app exposes as
 * data (`app_cli` in plugin.json). This module validates that spec and renders
 * one self-contained file per language: a Node ESM script or a Python argparse
 * module, in the manner of a hand-written app CLI such as a Flask app's own
 * `crm.py`. The generated file embeds the validated spec and a fixed runtime,
 * talks only to the app's HTTP API, and imports nothing from Total Recall, so
 * it keeps working where Total Recall is not installed.
 *
 * Generation is deterministic and never writes: callers decide where the file
 * goes.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TEMPLATE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'runtime-cli');
const TEMPLATES = { node: 'node.mjs.tmpl', python: 'python.py.tmpl' };

export const APP_CLI_LANGUAGES = Object.freeze(Object.keys(TEMPLATES));
export const ADAPTER_LANGUAGES = Object.freeze({ 'ssss-app': 'node', nextjs: 'node', react: 'node', flask: 'python' });

const NAME = /^[a-z][a-z0-9-]{0,63}$/;
const ARG_NAME = /^[a-z][a-z0-9_]{0,63}$/;
const ENV_NAME = /^[A-Z][A-Z0-9_]{0,63}$/;
const PATH_CHARS = /^\/[A-Za-z0-9_\-./{}]*$/;
const PLACEHOLDER = /\{([^{}]*)\}/g;
const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const TYPES = new Set(['string', 'integer', 'number', 'boolean']);
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);
// Taken by the generated runtime's own options and parser.
const RESERVED_ARGS = new Set(['json', 'base_url', 'help', 'command']);

const SPEC_KEYS = new Set(['name', 'description', 'api', 'auth', 'commands']);
const API_KEYS = new Set(['base_url_env', 'default_base_url', 'timeout_seconds']);
const AUTH_KEYS = new Set(['type', 'token_env']);
const COMMAND_KEYS = new Set(['name', 'description', 'method', 'path', 'args']);
const ARG_KEYS = new Set(['name', 'type', 'description', 'required', 'positional', 'choices', 'default']);

export class AppCliSpecError extends Error {
  constructor(errors) {
    super(`Invalid app_cli spec:\n  ${errors.join('\n  ')}`);
    this.name = 'AppCliSpecError';
    this.errors = errors;
  }
}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function unknownKeys(value, allowed, where, errors) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) errors.push(`${where}: unknown field '${key}'`);
  }
}

function optionalText(value, where, errors) {
  if (value !== undefined && (typeof value !== 'string' || !value.trim())) errors.push(`${where} must be a non-empty string`);
}

function matchesType(type, value) {
  if (type === 'string') return typeof value === 'string';
  if (type === 'integer') return Number.isInteger(value);
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  return typeof value === 'boolean';
}

function normalizeArg(arg, where, errors) {
  if (!isObject(arg)) {
    errors.push(`${where} must be an object`);
    return null;
  }
  unknownKeys(arg, ARG_KEYS, where, errors);
  if (typeof arg.name !== 'string' || !ARG_NAME.test(arg.name)) errors.push(`${where}.name must match ${ARG_NAME}`);
  else if (RESERVED_ARGS.has(arg.name)) errors.push(`${where}.name '${arg.name}' is reserved by the generated CLI`);
  if (!TYPES.has(arg.type)) errors.push(`${where}.type must be one of ${[...TYPES].join(', ')}`);
  optionalText(arg.description, `${where}.description`, errors);
  for (const flag of ['required', 'positional']) {
    if (arg[flag] !== undefined && typeof arg[flag] !== 'boolean') errors.push(`${where}.${flag} must be a boolean`);
  }
  if (arg.type === 'boolean' && arg.positional) errors.push(`${where}: a boolean cannot be positional`);
  if (arg.type === 'boolean' && arg.required) errors.push(`${where}: a boolean flag cannot be required`);
  if (arg.choices !== undefined) {
    if (arg.type === 'boolean') errors.push(`${where}: a boolean cannot have choices`);
    else if (!Array.isArray(arg.choices) || !arg.choices.length || !arg.choices.every((c) => matchesType(arg.type, c))) {
      errors.push(`${where}.choices must be a non-empty array of ${arg.type} values`);
    } else if (new Set(arg.choices).size !== arg.choices.length) errors.push(`${where}.choices has duplicates`);
  }
  if (arg.default !== undefined) {
    if (arg.positional) errors.push(`${where}: a positional argument cannot have a default`);
    if (arg.required) errors.push(`${where}: a required argument cannot have a default`);
    if (!matchesType(arg.type, arg.default)) errors.push(`${where}.default must be a ${arg.type}`);
    else if (Array.isArray(arg.choices) && !arg.choices.includes(arg.default)) errors.push(`${where}.default must be one of its choices`);
  }
  const out = { name: arg.name, type: arg.type };
  if (arg.description) out.description = arg.description;
  if (arg.positional) out.positional = true;
  if (arg.required || arg.positional) out.required = true;
  if (arg.choices !== undefined) out.choices = arg.choices;
  if (arg.default !== undefined) out.default = arg.default;
  return out;
}

function normalizeCommand(command, where, errors) {
  if (!isObject(command)) {
    errors.push(`${where} must be an object`);
    return null;
  }
  unknownKeys(command, COMMAND_KEYS, where, errors);
  if (typeof command.name !== 'string' || !NAME.test(command.name)) errors.push(`${where}.name must match ${NAME}`);
  optionalText(command.description, `${where}.description`, errors);
  if (!METHODS.has(command.method)) errors.push(`${where}.method must be one of ${[...METHODS].join(', ')}`);

  const rawArgs = command.args === undefined ? [] : command.args;
  if (!Array.isArray(rawArgs)) errors.push(`${where}.args must be an array`);
  const args = (Array.isArray(rawArgs) ? rawArgs : []).map((arg, i) => normalizeArg(arg, `${where}.args[${i}]`, errors)).filter(Boolean);
  const names = args.map((a) => a.name);
  if (new Set(names).size !== names.length) errors.push(`${where}.args has duplicate names`);

  if (typeof command.path !== 'string' || !PATH_CHARS.test(command.path) || command.path.split('/').includes('..')) {
    errors.push(`${where}.path must start with '/' and use only letters, digits, '-', '_', '.', '/' and {placeholders}, without '..'`);
  } else {
    const stripped = command.path.replace(PLACEHOLDER, '');
    if (stripped.includes('{') || stripped.includes('}')) errors.push(`${where}.path has an unbalanced brace`);
    for (const [, key] of command.path.matchAll(PLACEHOLDER)) {
      const arg = args.find((a) => a.name === key);
      if (!arg) errors.push(`${where}.path placeholder {${key}} has no matching arg`);
      else if (!arg.required) errors.push(`${where}.path placeholder {${key}} must be a required or positional arg`);
      else if (arg.type === 'boolean') errors.push(`${where}.path placeholder {${key}} cannot be a boolean`);
    }
  }

  const out = { name: command.name, method: command.method, path: command.path, args };
  if (command.description) out.description = command.description;
  return out;
}

/**
 * Validate an `app_cli` spec and return its normalized form: known fields
 * only, defaults filled in. Throws AppCliSpecError listing every problem.
 */
export function normalizeAppCliSpec(spec) {
  const errors = [];
  if (!isObject(spec)) throw new AppCliSpecError(['app_cli must be an object']);
  unknownKeys(spec, SPEC_KEYS, 'app_cli', errors);
  if (typeof spec.name !== 'string' || !NAME.test(spec.name)) errors.push(`app_cli.name must match ${NAME}`);
  optionalText(spec.description, 'app_cli.description', errors);

  const api = { timeout_seconds: 30 };
  if (!isObject(spec.api)) {
    errors.push('app_cli.api must be an object with base_url_env and default_base_url');
  } else {
    unknownKeys(spec.api, API_KEYS, 'app_cli.api', errors);
    if (typeof spec.api.base_url_env !== 'string' || !ENV_NAME.test(spec.api.base_url_env)) errors.push(`app_cli.api.base_url_env must match ${ENV_NAME}`);
    else api.base_url_env = spec.api.base_url_env;
    // The published default only ever points at the local app. Anything else is
    // the operator's to configure through the environment or --base-url.
    let base = null;
    try {
      base = new URL(spec.api.default_base_url);
    } catch { /* reported below */ }
    if (!base || !['http:', 'https:'].includes(base.protocol) || !LOOPBACK.has(base.hostname) || base.username || base.password || base.search || base.hash) {
      errors.push('app_cli.api.default_base_url must be an http(s) loopback URL (127.0.0.1, localhost or [::1]) without credentials, query or fragment');
    } else api.default_base_url = spec.api.default_base_url.replace(/\/+$/, '');
    if (spec.api.timeout_seconds !== undefined) {
      if (!Number.isInteger(spec.api.timeout_seconds) || spec.api.timeout_seconds < 1 || spec.api.timeout_seconds > 600) {
        errors.push('app_cli.api.timeout_seconds must be an integer from 1 to 600');
      } else api.timeout_seconds = spec.api.timeout_seconds;
    }
  }

  let auth;
  if (spec.auth !== undefined) {
    if (!isObject(spec.auth)) errors.push('app_cli.auth must be an object');
    else {
      unknownKeys(spec.auth, AUTH_KEYS, 'app_cli.auth', errors);
      if (spec.auth.type !== 'bearer') errors.push("app_cli.auth.type must be 'bearer'");
      if (typeof spec.auth.token_env !== 'string' || !ENV_NAME.test(spec.auth.token_env)) errors.push(`app_cli.auth.token_env must match ${ENV_NAME}`);
      auth = { type: 'bearer', token_env: spec.auth.token_env };
    }
  }

  let commands = [];
  if (!Array.isArray(spec.commands) || !spec.commands.length) errors.push('app_cli.commands must be a non-empty array');
  else {
    commands = spec.commands.map((c, i) => normalizeCommand(c, `app_cli.commands[${i}]`, errors)).filter(Boolean);
    const names = commands.map((c) => c.name);
    if (new Set(names).size !== names.length) errors.push('app_cli.commands has duplicate names');
  }

  if (errors.length) throw new AppCliSpecError(errors);
  const out = { name: spec.name, api };
  if (spec.description) out.description = spec.description;
  if (auth) out.auth = auth;
  out.commands = commands;
  return out;
}

/** Errors for an `app_cli` spec, or [] when it is valid. Used by the manifest validator. */
export function validateAppCliSpec(spec) {
  try {
    normalizeAppCliSpec(spec);
    return [];
  } catch (err) {
    if (err instanceof AppCliSpecError) return err.errors;
    throw err;
  }
}

export function languageForAdapter(adapter) {
  const language = ADAPTER_LANGUAGES[adapter];
  if (!language) {
    throw new Error(`No app CLI language for adapter '${adapter}'. Known adapters: ${Object.keys(ADAPTER_LANGUAGES).join(', ')}`);
  }
  return language;
}

/** Where the generated file conventionally lives in the app: `bin/<name>.mjs` or `<name>.py`. */
export function appCliPath(name, language) {
  return language === 'python' ? `${name.replace(/-/g, '_')}.py` : `bin/${name}.mjs`;
}

/**
 * Render the app CLI for one language.
 * @param {object} spec  The manifest's `app_cli`.
 * @param {{ language: 'node'|'python', source?: { id: string, version: string } }} options
 * @returns {{ language: string, path: string, content: string, mode: number, sha256: string, spec: object }}
 */
export function generateAppCli(spec, { language, source } = {}) {
  if (!TEMPLATES[language]) throw new Error(`Unknown app CLI language '${language}'. Use one of: ${APP_CLI_LANGUAGES.join(', ')}`);
  const normalized = normalizeAppCliSpec(spec);
  const specJson = JSON.stringify(normalized);
  const specHash = crypto.createHash('sha256').update(specJson).digest('hex');
  const origin = source?.id ? ` from plugin ${source.id}${source.version ? `@${source.version}` : ''}` : '';
  const header = `Generated by Total Recall${origin} (app_cli sha256 ${specHash.slice(0, 12)}). Regenerate instead of editing; it needs no Total Recall install.`;
  // JSON text is a valid JS expression; for Python it is embedded as a JSON
  // string literal (itself valid Python) and decoded with json.loads.
  const specLiteral = language === 'python' ? JSON.stringify(specJson) : JSON.stringify(normalized, null, 2);
  const template = fs.readFileSync(path.join(TEMPLATE_DIR, TEMPLATES[language]), 'utf8');
  if (template.split('__SPEC__').length !== 2 || template.split('__HEADER__').length !== 2) {
    throw new Error(`App CLI template ${TEMPLATES[language]} must contain __SPEC__ and __HEADER__ exactly once`);
  }
  const content = template.replace('__HEADER__', () => header).replace('__SPEC__', () => specLiteral);
  return {
    language,
    path: appCliPath(normalized.name, language),
    content,
    mode: 0o755,
    sha256: crypto.createHash('sha256').update(content).digest('hex'),
    spec: normalized,
  };
}
