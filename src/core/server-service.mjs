/** Repair this installation's macOS server LaunchAgent. Never manages systemd. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { processIdentity } from './startup-health.mjs';

const PACKAGE_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const LABEL = 'com.totalrecall.server';
const corePathEnv = new Set(['AGENT_DIR', 'TR_SECRETS_BRAIN', 'TR_SERVER_PID_FILE']);
const inside = (root, value) => value === root || value.startsWith(root + path.sep);
const real = value => { try { return fs.realpathSync(value); } catch { return path.resolve(value); } };

export function stableNodePath(env = process.env) {
  for (const dir of (env.PATH || '').split(path.delimiter)) {
    if (!dir || !path.isAbsolute(dir)) continue;
    const candidate = path.join(dir, 'node');
    if (candidate.split(path.sep).includes('Cellar')) continue;
    try { fs.accessSync(candidate, fs.constants.X_OK); if (fs.statSync(candidate).isFile()) return candidate; } catch {}
  }
  throw new Error('No stable node executable on PATH. Add the node symlink directory to PATH.');
}

function convert(input, format, exec) {
  const result = exec('plutil', ['-convert', format, '-o', '-', '-'], { input, encoding: 'utf8', timeout: 5000 });
  if (result.status !== 0 || result.error) throw new Error(`Cannot convert server plist to ${format}.`);
  return result.stdout;
}

/** Detect foreign installations without naming any operator repository. */
function checkoutFor(value, oldRoot, packageRoot) {
  if (inside(packageRoot, value) || inside(real(packageRoot), value)) return null;
  if (oldRoot && real(oldRoot) !== real(packageRoot) && inside(oldRoot, value)) return oldRoot;
  for (let dir = value; ; dir = path.dirname(dir)) {
    try {
      if (JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).name === 'total-recall-brain'
          && real(dir) !== real(packageRoot)) return dir;
    } catch {}
    if (dir === path.dirname(dir)) return null;
  }
}

export function serverEnvironment(existing, { packageRoot, oldRoot }) {
  const env = {};
  for (const [key, value] of Object.entries(existing || {})) {
    if (typeof value !== 'string') throw new Error(`Server environment ${key} must be a string.`);
    if (key === 'PATH') {
      env[key] = value.split(path.delimiter).map(part => {
        const foreign = path.isAbsolute(part) && checkoutFor(part, oldRoot, packageRoot);
        return foreign ? path.join(packageRoot, path.relative(foreign, part)) : part;
      }).join(path.delimiter);
      continue;
    }
    const foreign = path.isAbsolute(value) && checkoutFor(value, oldRoot, packageRoot);
    if (!foreign) env[key] = value;
    else if (corePathEnv.has(key)) env[key] = path.join(packageRoot, path.relative(foreign, value));
    // Obsolete settings must not retain a path into another installation.
  }
  return env;
}

function publicPlist(plist) {
  const copy = structuredClone(plist);
  for (const key of Object.keys(copy.EnvironmentVariables || {})) {
    if (/password|secret(?!s_brain)|token|api.?key|credential/i.test(key)) copy.EnvironmentVariables[key] = '[redacted]';
  }
  return copy;
}

function plistDiff(before, after) {
  const lines = [];
  const walk = (a, b, key) => {
    if (JSON.stringify(a) === JSON.stringify(b)) return;
    if (a && b && !Array.isArray(a) && !Array.isArray(b) && typeof a === 'object' && typeof b === 'object') {
      for (const part of new Set([...Object.keys(a), ...Object.keys(b)])) walk(a[part], b[part], key ? `${key}.${part}` : part);
    } else {
      if (a !== undefined) lines.push(`- ${key}: ${JSON.stringify(a)}`);
      if (b !== undefined) lines.push(`+ ${key}: ${JSON.stringify(b)}`);
    }
  };
  walk(publicPlist(before), publicPlist(after), '');
  return lines.join('\n') || 'No plist changes.';
}

export async function ensureServerService({ dryRun = false, platform = process.platform, home = os.homedir(),
  packageRoot = PACKAGE_ROOT, env = process.env, exec = spawnSync, identity = processIdentity,
  uid = process.getuid?.(), sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), attempts = 40 } = {}) {
  if (platform !== 'darwin') return { status: 'unchanged', reason: 'server-release owns the server on systemd hosts; no changes made.' };
  packageRoot = path.resolve(packageRoot);
  const plistPath = path.join(home, 'Library/LaunchAgents', `${LABEL}.plist`);
  const oldBytes = fs.existsSync(plistPath) ? fs.readFileSync(plistPath) : null;
  const existing = oldBytes ? JSON.parse(convert(oldBytes, 'json', exec)) : {};
  const template = fs.readFileSync(path.join(packageRoot, 'templates', `${LABEL}.plist`), 'utf8');
  const desired = JSON.parse(convert(template, 'json', exec));
  const substitute = value => typeof value === 'string' ? value.replaceAll('__ROOT__', packageRoot).replaceAll('__HOME__', home)
    : Array.isArray(value) ? value.map(substitute) : value && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value).map(([key, val]) => [key, substitute(val)])) : value;
  const plist = substitute(desired);
  plist.WorkingDirectory = packageRoot;
  plist.ProgramArguments[0] = stableNodePath(env);
  plist.EnvironmentVariables = { ...plist.EnvironmentVariables,
    ...serverEnvironment(existing.EnvironmentVariables, { packageRoot, oldRoot: existing.WorkingDirectory }) };
  const diff = plistDiff(existing, plist);
  if (dryRun) return { status: 'dry_run', plistPath, diff };

  const xml = convert(JSON.stringify(plist), 'xml1', exec);
  const domain = `gui/${uid}`;
  const service = `${domain}/${LABEL}`;
  const run = args => exec('launchctl', args, { encoding: 'utf8', timeout: 10000 });
  const ok = result => result.status === 0 && !result.error;
  const must = args => { if (!ok(run(args))) throw new Error(`launchctl ${args[0]} failed for ${service}.`); };
  const agentDir = plist.EnvironmentVariables.AGENT_DIR || path.join(home, '.agent');
  const pidFile = plist.EnvironmentVariables.TR_SERVER_PID_FILE || path.join(agentDir, 'skills/total-recall/server.pid');
  const entry = path.join(packageRoot, 'src/server/index.mjs');
  const previous = identity(pidFile, entry);
  if (previous.status === 'unknown') throw new Error('Server process identity is unknown. Nothing changed.');
  const loaded = ok(run(['print', service]));
  if (!loaded && ['running', 'conflict'].includes(previous.status)) throw new Error('A server runs outside this LaunchAgent. Nothing changed.');
  fs.mkdirSync(path.dirname(plistPath), { recursive: true });
  for (const log of [plist.StandardOutPath, plist.StandardErrorPath]) if (log) fs.mkdirSync(path.dirname(log), { recursive: true });
  const pending = `${plistPath}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(pending, xml, { mode: 0o600 });
    fs.renameSync(pending, plistPath);
    if (loaded) {
      must(['bootout', service]);
      let retired = false;
      for (let i = 0; i < attempts; i++) {
        if (!ok(run(['print', service]))) { retired = true; break; }
        await sleep(250);
      }
      if (!retired) throw new Error('LaunchAgent did not retire.');
    }
    must(['bootstrap', domain, plistPath]);
    for (let i = 0; i < attempts; i++) {
      const observed = identity(pidFile, entry);
      if (observed.status === 'running' && (!loaded || observed.pid !== previous.pid)) return { status: 'ready', plistPath, pid: observed.pid, entry: observed.entry };
      await sleep(250);
    }
    throw new Error('Server process verification failed after launchd reload.');
  } catch (error) {
    // Keep the previous definition available for operator recovery. Never report success.
    if (oldBytes !== null) fs.writeFileSync(plistPath, oldBytes, { mode: 0o600 });
    else fs.rmSync(plistPath, { force: true });
    throw error;
  } finally { fs.rmSync(pending, { force: true }); }
}
