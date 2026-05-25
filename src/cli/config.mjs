import fs from 'node:fs';
import path from 'node:path';
import yaml from 'yaml';
import { resolveBrainDir, parseLayerFlag } from './agent-dir.mjs';

// Pre-defined mapping of known settings
const KEY_MAP = {
  'yolo_mode': { file: 'security', path: 'yolo_mode', type: 'boolean' },
  'enforce_local_only': { file: 'security', path: 'privacy.enforce_local_only', type: 'boolean' },
  'allow_frontier_export': { file: 'security', path: 'privacy.allow_frontier_export', type: 'string', values: ['always', 'ask_per_skill', 'never'] },
  'password_hash': { file: 'security', path: 'dashboard.password_hash', type: 'string' },
  'session_ttl_hours': { file: 'security', path: 'dashboard.session_ttl_hours', type: 'number' },
  'force_password_reset': { file: 'security', path: 'dashboard.force_password_reset', type: 'boolean' },
  'api_requests_per_minute': { file: 'security', path: 'rate_limits.api_requests_per_minute', type: 'number' },
  'sandbox_requests_per_minute': { file: 'security', path: 'rate_limits.sandbox_requests_per_minute', type: 'number' },
  'ingest_requests_per_minute': { file: 'security', path: 'rate_limits.ingest_requests_per_minute', type: 'number' },
  'host': { file: 'security', path: 'bind.host', type: 'string' },
  'port': { file: 'security', path: 'bind.port', type: 'number' },
  'allow_public_bind': { file: 'security', path: 'bind.allow_public_bind', type: 'boolean' },
  'require_https': { file: 'security', path: 'network.require_https', type: 'boolean' },
  'public_health': { file: 'security', path: 'network.public_health', type: 'boolean' },
  'allowed_origins': { file: 'security', path: 'network.allowed_origins', type: 'array' },

  'daily_cap_usd': { file: 'budget', path: 'budget.daily_cap_usd', type: 'number' },
  'weekly_cap_usd': { file: 'budget', path: 'budget.weekly_cap_usd', type: 'number' },
  'budget_enabled': { file: 'budget', path: 'budget.enabled', type: 'boolean' }
};

function resolveKeyInfo(key) {
  if (KEY_MAP[key]) return KEY_MAP[key];

  for (const info of Object.values(KEY_MAP)) {
    if (info.path === key) return info;
  }

  // Fallback / dynamic inference
  const isBudget = key.startsWith('budget.') || key === 'budget';
  const file = isBudget ? 'budget' : 'security';
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

export default async function configCommand(args) {
  const { layer, remainingArgs } = parseLayerFlag(args);
  const command = remainingArgs[0] || 'get';

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
  total-recall config [get|set] [key] [value] [options]

  Manage Sovereign OS and Dashboard configuration settings directly from the CLI.

  Commands:
    get [key]      Retrieve the value of a configuration key. If key is omitted, lists all keys.
    set <key> <v>  Set the value of a configuration key. Converts inputs to correct type.

  Options:
    --global       Explicitly target the global brain configuration (~/.agent/)
    --project      Explicitly target the project brain configuration (<cwd>/.agent/)

  Common Keys:
    yolo_mode                    Fully autonomous mode (true | false)
    allow_frontier_export        Frontier export policy (always | ask_per_skill | never)
    session_ttl_hours            Dashboard session TTL hours (number)
    api_requests_per_minute      Rate limit for API endpoints (number)
    daily_cap_usd                Cost-control daily cap (number)
    weekly_cap_usd               Cost-control weekly cap (number)
    budget_enabled               Enable/disable cost limit checks (true | false)
    allowed_origins              CORS origins (e.g. "http://localhost:5173,http://localhost:3000")

  Examples:
    npx total-recall config get
    npx total-recall config get yolo_mode
    npx total-recall config set yolo_mode true --project
    npx total-recall config set daily_cap_usd 10.0 --global
    npx total-recall config set allowed_origins "http://localhost:8000"
`);
    return;
  }

  const brainDir = resolveBrainDir(layer);
  const configDir = path.join(brainDir, 'config');
  const securityPath = path.join(configDir, 'security.yml');
  const budgetPath = path.join(configDir, 'budget.yml');
  const layerLabel = layer === 'project' ? '[project]' : layer === 'global' ? '[global]' : '[auto]';

  // Load configs safely
  let securityConfig = {};
  let budgetConfig = {};

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
      const targetObj = info.file === 'budget' ? budgetConfig : securityConfig;
      const value = getNestedProp(targetObj, info.path);
      
      if (args.includes('--json') || args.includes('-j')) {
        console.log(JSON.stringify({ key, value }));
      } else {
        console.log(value !== undefined ? value : 'undefined');
      }
    } else {
      // List all known keys
      const allSettings = {};
      for (const [flatKey, info] of Object.entries(KEY_MAP)) {
        const targetObj = info.file === 'budget' ? budgetConfig : securityConfig;
        const val = getNestedProp(targetObj, info.path);
        allSettings[flatKey] = val !== undefined ? val : null;
      }

      if (args.includes('--json') || args.includes('-j')) {
        console.log(JSON.stringify(allSettings, null, 2));
      } else {
        console.log(`\n  ⚙️  Sovereign UI & Settings Configuration ${layerLabel}\n`);
        for (const [k, v] of Object.entries(allSettings)) {
          const formattedValue = typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v);
          console.log(`  • ${k.padEnd(30)}: ${formattedValue}`);
        }
        console.log('\n  📍 Storage locations:');
        console.log(`     - Security: ${securityPath}`);
        console.log(`     - Budget:   ${budgetPath}\n`);
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
    const targetObj = info.file === 'budget' ? budgetConfig : securityConfig;
    const targetPath = info.file === 'budget' ? budgetPath : securityPath;

    try {
      const parsedValue = castAndValidate(rawValue, info.type, info.values);
      setNestedProp(targetObj, info.path, parsedValue);

      // Write back securely
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }
      fs.writeFileSync(targetPath, yaml.stringify(targetObj), { encoding: 'utf8', mode: 0o600 });

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
