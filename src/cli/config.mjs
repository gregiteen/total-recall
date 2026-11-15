import fs from 'node:fs';
import path from 'node:path';
import yaml from 'yaml';
import { resolveBrainDir, parseLayerFlag } from './agent-dir.mjs';
import { writeFileSecure } from '../core/secure-file.mjs';
import { readRegisteredProjects } from '../core/brain-registry.mjs';

function workspaceProjectRoot(brain) {
  const canonical = value => fs.existsSync(value) ? fs.realpathSync(value) : path.resolve(value);
  const globalBrain = resolveBrainDir('global');
  if (canonical(brain) === canonical(globalBrain)) return null;
  const matches = readRegisteredProjects(globalBrain).filter(row => typeof row.brainDir === 'string' && canonical(row.brainDir) === canonical(brain));
  if (matches.length > 1) throw new Error('The selected brain has ambiguous project registrations.');
  if (matches.length) {
    if (typeof matches[0].path !== 'string' || !path.isAbsolute(matches[0].path)) throw new Error('Invalid selected brain project path.');
    return canonical(matches[0].path);
  }
  // Unregistered standard project brains still own their local activation
  // policy. A standalone explicit brain uses the shared policy, never cwd's.
  const agent = path.resolve(brain, '../..');
  return path.basename(brain) === 'total-recall' && path.basename(path.dirname(brain)) === 'skills' &&
    ['.agent', '.agents'].includes(path.basename(agent)) ? path.dirname(agent) : null;
}

function readWorkspaceFile(filename, limit) {
  const fd = fs.openSync(filename, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > limit) throw new Error('Workspace input must be a bounded regular file.');
    const buffer = Buffer.alloc(limit + 1);
    let used = 0;
    while (used < buffer.length) {
      const count = fs.readSync(fd, buffer, used, buffer.length - used, null);
      if (!count) break;
      used += count;
    }
    if (used > limit) throw new Error('Workspace input exceeds the byte limit.');
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, used));
  } finally { fs.closeSync(fd); }
}

function workspaceOptions(args) {
  const options = {};
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (!['--file', '--version', '--restore', '--history', '--remove'].includes(flag) || Object.hasOwn(options, flag)) throw new Error('Invalid workspace configuration option.');
    if (['--history', '--remove'].includes(flag)) options[flag] = true;
    else {
      const value = args[++index];
      if (!value || value.startsWith('--')) throw new Error('Workspace option requires a value.');
      options[flag] = value;
    }
  }
  return options;
}

function workspaceVersion(options) {
  const version = options['--version'];
  if (version === 'null') return null;
  if (typeof version !== 'string' || !/^[a-f0-9]{64}$/.test(version)) throw new Error('Supply --version <current hash|null> from a prior read.');
  return version;
}

// Pre-defined mapping of known settings
const KEY_MAP = {
  'session_ttl_hours': { file: 'security', path: 'dashboard.session_ttl_hours', type: 'number' },
  'api_requests_per_minute': { file: 'security', path: 'rate_limits.api_requests_per_minute', type: 'number' },
  'sandbox_requests_per_minute': { file: 'security', path: 'rate_limits.sandbox_requests_per_minute', type: 'number' },
  'ingest_requests_per_minute': { file: 'security', path: 'rate_limits.ingest_requests_per_minute', type: 'number' },
  'host': { file: 'security', path: 'bind.host', type: 'string' },
  'port': { file: 'security', path: 'bind.port', type: 'number' },
  'allow_public_bind': { file: 'security', path: 'bind.allow_public_bind', type: 'boolean' },
  'require_https': { file: 'security', path: 'network.require_https', type: 'boolean' },
  'public_health': { file: 'security', path: 'network.public_health', type: 'boolean' },
  'allowed_origins': { file: 'security', path: 'network.allowed_origins', type: 'array' },

  // How long a `total-recall preflight ack` receipt stays fresh. Recorded in the receipt when it is written.
  'preflight_max_age_minutes': { file: 'preflight', path: 'preflight.max_age_minutes', type: 'number' },

  'daily_cap_usd': { file: 'budget', path: 'budget.daily_cap_usd', type: 'number' },
  'weekly_cap_usd': { file: 'budget', path: 'budget.weekly_cap_usd', type: 'number' },
  'budget_enabled': { file: 'budget', path: 'budget.enabled', type: 'boolean' },

  // Size of each rules section in the compiled instruction files (characters).
  'rules_invariants_budget_chars': { file: 'surface', path: 'rules.invariants_budget_chars', type: 'number' },
  'rules_preferences_budget_chars': { file: 'surface', path: 'rules.preferences_budget_chars', type: 'number' },
  'rules_corrections_budget_chars': { file: 'surface', path: 'rules.corrections_budget_chars', type: 'number' },

  // Token budget for the `context` instruction capsule. Raise it above the
  // default when every rule should load for every action instead of being
  // narrowed by applicability.
  'context_budget': { file: 'surface', path: 'context.budget', type: 'number' },
  'surface_bootstrap_budget': { file: 'surface', path: 'budget.bootstrap_total_tokens', type: 'number' },
};

function resolveKeyInfo(key) {
  if (/(?:^|[._-])(?:password|secret|token|pats?|credential|force_password_reset)(?:$|[._-])/i.test(key) || key.split('.').some(part => ['__proto__', 'constructor', 'prototype'].includes(part))) {
    throw new Error('Credential configuration belongs to the auth plugin; use total-recall auth --help');
  }
  if (KEY_MAP[key]) return KEY_MAP[key];

  for (const info of Object.values(KEY_MAP)) {
    if (info.path === key) return info;
  }

  // Fallback / dynamic inference
  const isBudget = key.startsWith('budget.') || key === 'budget';
  const file = isBudget ? 'budget' : key.startsWith('rules.') ? 'surface' : 'security';
  const targetPath = key;

  let type = 'string';
  if (key.includes('port') || key.includes('limit') || key.includes('ttl') || key.includes('cap') || key.includes('minute')) {
    type = 'number';
  } else if (key.includes('enable') || key.includes('allow') || key.includes('require') || key.includes('public') || key.includes('enforce') || key.includes('yolo')) {
    type = 'boolean';
  } else if (key.includes('origins') || key.includes('pats')) {
    type = 'array';
  }

  return { file, path: targetPath, type };
}

function getNestedProp(obj, dottedPath) {
  const parts = dottedPath.split('.');
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }
  return current;
}

function setNestedProp(obj, dottedPath, value) {
  const parts = dottedPath.split('.');
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (current[part] === undefined || current[part] === null || typeof current[part] !== 'object') {
      current[part] = {};
    }
    current = current[part];
  }
  current[parts[parts.length - 1]] = value;
}

function castAndValidate(valueStr, type, allowedValues) {
  if (valueStr === 'null' || valueStr === 'undefined' || valueStr === null) {
    return null;
  }

  if (type === 'boolean') {
    if (valueStr === 'true' || valueStr === '1' || valueStr === 'yes' || valueStr === true) return true;
    if (valueStr === 'false' || valueStr === '0' || valueStr === 'no' || valueStr === false) return false;
    throw new Error(`Invalid boolean value: "${valueStr}". Expected true or false.`);
  }

  if (type === 'number') {
    const num = Number(valueStr);
    if (isNaN(num)) {
      throw new Error(`Invalid number value: "${valueStr}".`);
    }
    return num;
  }

  if (type === 'array') {
    if (Array.isArray(valueStr)) return valueStr;
    if (typeof valueStr === 'string' && valueStr.startsWith('[')) {
      try {
        return JSON.parse(valueStr);
      } catch {}
    }
    return String(valueStr).split(',').map(s => s.trim()).filter(Boolean);
  }

  if (allowedValues && !allowedValues.includes(valueStr)) {
    throw new Error(`Invalid value: "${valueStr}". Must be one of: ${allowedValues.join(', ')}.`);
  }

  return valueStr;
}

export function readConfigValue(key, layer = 'global') {
  const info = KEY_MAP[key];
  if (!info) throw new Error(`Unknown config key: ${key}`);
  const configDir = path.join(resolveBrainDir(layer), 'config');
  const filePath = path.join(configDir, `${info.file}.yml`);
  if (!fs.existsSync(filePath)) return undefined;
  let parsed = {};
  try { parsed = yaml.parse(fs.readFileSync(filePath, 'utf8')) || {}; } catch { return undefined; }
  const parts = info.path.split('.');
  let current = parsed;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }
  return current;
}

export default async function configCommand(args) {
  const { layer, remainingArgs } = parseLayerFlag(args);
  const command = remainingArgs[0] || 'get';

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
  total-recall config [get|set] [key] [value] [options]

  Manage Core OS and Dashboard configuration settings directly from the CLI.

  Commands:
    get [key]      Retrieve the value of a configuration key. If key is omitted, lists all keys.
    set <key> <v>  Set the value of a configuration key. Converts inputs to correct type.
    drawer <right|bottom>                 Read a workspace drawer as JSON
    drawer <right|bottom> --history       Read bounded saved revisions
    drawer <right|bottom> --file <json> --version <hash|null>   Save a drawer
    drawer <right|bottom> --restore <revision> --version <hash>   Restore a drawer
    design <plugin>                      Read the selected-brain DESIGN.md choice
    design <plugin> --file <markdown> --version <hash|null>   Choose DESIGN.md content
    design <plugin> --remove --version <hash>   Return to the owner design

  Options:
    --global       Explicitly target the global brain configuration (~/.agent/)
    --project      Explicitly target the project brain configuration (<cwd>/.agent/)

  Common Keys:
    session_ttl_hours            Dashboard session TTL hours (number)
    api_requests_per_minute      Rate limit for API endpoints (number)
    daily_cap_usd                Cost-control daily cap (number)
    weekly_cap_usd               Cost-control weekly cap (number)
    budget_enabled               Enable/disable cost limit checks (true | false)
    rules_invariants_budget_chars    Characters for the invariants section of CLAUDE.md/AGENTS.md (number; default 9000)
    rules_preferences_budget_chars   Same for preferences (default 4000)
    rules_corrections_budget_chars   Same for corrections (default 8000)
    context_budget               Token budget for the context instruction capsule (number; default 4000)
    allowed_origins              CORS origins (e.g. "http://localhost:5173,http://localhost:3000")

  Examples:
    npx total-recall config get
    npx total-recall config set daily_cap_usd 10.0 --global
    npx total-recall config set allowed_origins "http://localhost:8000"
`);
    return;
  }

  if (command === 'drawer') {
    const { readDrawerConfig, readDrawerHistory, restoreDrawerConfig, writeDrawerConfig } = await import('../core/workspace-drawers.mjs');
    const [, edge, ...flags] = remainingArgs;
    const options = workspaceOptions(flags);
    const file = options['--file'], restore = options['--restore'];
    if (!edge || options['--remove'] || (file && restore) || (options['--history'] && (file || restore)) || (!file && !restore && options['--version'])) throw new Error('Invalid drawer options. See config --help.');
    const brain = layer === 'auto' && process.env.TR_BRAIN ? path.resolve(process.env.TR_BRAIN) : resolveBrainDir(layer);
    const result = file ? await writeDrawerConfig(brain, edge, JSON.parse(readWorkspaceFile(file, 512 * 1024)), workspaceVersion(options))
      : restore ? await restoreDrawerConfig(brain, edge, restore, workspaceVersion(options))
      : options['--history'] ? readDrawerHistory(brain, edge) : readDrawerConfig(brain, edge);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === 'design') {
    const { readPluginDesignChoice, writePluginDesignChoice, MAX_USER_DESIGN_BYTES } = await import('../core/ui-chunks.mjs');
    const [, plugin, ...flags] = remainingArgs;
    const options = workspaceOptions(flags);
    const file = options['--file'], remove = options['--remove'];
    if (!plugin || options['--history'] || options['--restore'] || (file && remove) || (!file && !remove && options['--version'])) throw new Error('Invalid design options. See config --help.');
    const brain = layer === 'auto' && process.env.TR_BRAIN ? path.resolve(process.env.TR_BRAIN) : resolveBrainDir(layer);
    const projectRoot = workspaceProjectRoot(brain);
    const result = file || remove
      ? await writePluginDesignChoice(brain, plugin, remove ? null : readWorkspaceFile(file, MAX_USER_DESIGN_BYTES), workspaceVersion(options), projectRoot)
      : readPluginDesignChoice(brain, plugin, projectRoot);
    if (!result) throw new Error('The design owner must be installed and enabled.');
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const brainDir = resolveBrainDir(layer);
  const configDir = path.join(brainDir, 'config');
  const securityPath = path.join(configDir, 'security.yml');
  const budgetPath = path.join(configDir, 'budget.yml');
  const surfacePath = path.join(configDir, 'surface.yml');
  const layerLabel = layer === 'project' ? '[project]' : layer === 'global' ? '[global]' : '[auto]';

  // Load configs safely
  let securityConfig = {};
  let budgetConfig = {};
  let surfaceConfig = {};
  const objFor = (file) => (file === 'budget' ? budgetConfig : file === 'surface' ? surfaceConfig : securityConfig);
  const pathFor = (file) => (file === 'budget' ? budgetPath : file === 'surface' ? surfacePath : securityPath);

  if (fs.existsSync(surfacePath)) {
    try {
      surfaceConfig = yaml.parse(fs.readFileSync(surfacePath, 'utf8')) || {};
    } catch {}
  }
  if (fs.existsSync(securityPath)) {
    try {
      securityConfig = yaml.parse(fs.readFileSync(securityPath, 'utf8')) || {};
    } catch {}
  }
  if (fs.existsSync(budgetPath)) {
    try {
      budgetConfig = yaml.parse(fs.readFileSync(budgetPath, 'utf8')) || {};
    } catch {}
  }

  if (command === 'get') {
    const key = remainingArgs[1];
    if (key) {
      const info = resolveKeyInfo(key);
      const targetObj = objFor(info.file);
      const value = getNestedProp(targetObj, info.path);
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) throw new Error('Read an individual non-credential setting');
      
      if (args.includes('--json') || args.includes('-j')) {
        console.log(JSON.stringify({ key, value }));
      } else {
        console.log(value !== undefined ? value : 'undefined');
      }
    } else {
      // List all known keys
      const allSettings = {};
      for (const [flatKey, info] of Object.entries(KEY_MAP)) {
        const targetObj = objFor(info.file);
        const val = getNestedProp(targetObj, info.path);
        allSettings[flatKey] = val !== undefined ? val : null;
      }

      if (args.includes('--json') || args.includes('-j')) {
        console.log(JSON.stringify(allSettings, null, 2));
      } else {
        console.log(`\n  ⚙️  Local UI & Settings Configuration ${layerLabel}\n`);
        for (const [k, v] of Object.entries(allSettings)) {
          const formattedValue = typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v);
          console.log(`  • ${k.padEnd(30)}: ${formattedValue}`);
        }
        console.log('\n  📍 Storage locations:');
        console.log(`     - Security: ${securityPath}`);
        console.log(`     - Budget:   ${budgetPath}`);
        console.log(`     - Surface:  ${surfacePath}\n`);
      }
    }
    return;
  }

  if (command === 'set') {
    const key = remainingArgs[1];
    let rawValue = remainingArgs[2];

    if (!key) {
      console.error('Error: Key is required for set command. Run total-recall config --help for usage.');
      process.exit(1);
    }

    if (rawValue === undefined) {
      console.error(`Error: Value is required for key "${key}".`);
      process.exit(1);
    }

    const info = resolveKeyInfo(key);
    const targetObj = objFor(info.file);
    const targetPath = pathFor(info.file);

    try {
      const parsedValue = castAndValidate(rawValue, info.type, info.values);
      setNestedProp(targetObj, info.path, parsedValue);

      // Write back securely
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }
      writeFileSecure(targetPath, yaml.stringify(targetObj), { encoding: 'utf8', mode: 0o600 });

      console.log(`\n  ✅ Success! Config key "${key}" ${layerLabel} set to: ${JSON.stringify(parsedValue)}`);
      console.log(`  📍 Saved in: ${targetPath}\n`);
    } catch (err) {
      console.error(`\n  ❌ Error setting "${key}": ${err.message}\n`);
      process.exit(1);
    }
    return;
  }

  console.error(`Unknown subcommand "${command}". Run total-recall config --help for usage.`);
  process.exit(1);
}
