import path from 'node:path';
import fs from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execute = promisify(execFile);

// Fixed read operations only. No command or argument comes from the caller.
const SOURCES = {
  machines: { status: ['mesh', 'status'], presence: ['mesh', 'presence'] },
  flows: {
    grants: ['mesh', 'grants', 'list'], plugins: ['plugin', 'peers'], updates: ['update', '--status'],
    tasks: ['user-automations', 'list'], agents: ['agent', 'list'], alerts: ['alerts', 'log'], deployments: ['deploy', 'status'],
  },
  placement: { tasks: ['user-automations', 'list'], agents: ['agent', 'list'] },
  boundary: { policy: ['mesh', 'policy', 'get'], grants: ['mesh', 'grants', 'list'] },
  join: { status: ['mesh', 'status'] },
};

export function meshDeclarations() {
  const manifest = JSON.parse(fs.readFileSync(new URL('../../plugin.json', import.meta.url), 'utf8'));
  return { ...manifest.mesh, provides: manifest.mesh.provides.map(capability => ({ ...capability, effect: manifest.cli.subcommands.find(operation => operation.name === capability.operation)?.effect })) };
}

export function parseCliObject(text) {
  const value = String(text).trim();
  try { const parsed = JSON.parse(value); if (parsed && typeof parsed === 'object') return parsed; } catch {}
  const lines = value.split('\n').filter(line => /^\s*[{[]/.test(line));
  if (lines.length > 1) {
    try { const rows = lines.map(line => JSON.parse(line)); if (rows.every(row => row && typeof row === 'object')) return rows; } catch {}
  }
  // Ignore prose banners; retain arrays and multiline JSON as one payload.
  for (let start = 0; start < value.length; start++) {
    if (!'{['.includes(value[start])) continue;
    let depth = 0, quoted = false;
    for (let end = start; end < value.length; end++) {
      const ch = value[end];
      if (quoted) { if (ch === '\\') end++; else if (ch === '"') quoted = false; }
      else if (ch === '"') quoted = true;
      else if ('{['.includes(ch)) depth++;
      else if ('}]'.includes(ch) && --depth === 0) {
        try { return JSON.parse(value.slice(start, end + 1)); } catch { break; }
      }
    }
  }
  throw new Error('Owner command did not return JSON');
}

async function readSource(args) {
  const root = process.env.TR_PACKAGE_ROOT;
  if (!root || !path.isAbsolute(root)) throw new Error('Explicit valid Total Recall host runtime required');
  const cli = path.join(root, 'bin', 'total-recall.mjs');
  if (!fs.statSync(cli).isFile()) throw new Error('Selected host CLI is unavailable');
  let result;
  try {
    result = await execute(process.execPath, [cli, ...args, '--json'], {
      cwd: process.cwd(), timeout: 20000, maxBuffer: 262144, encoding: 'utf8',
      env: { ...process.env, TR_EMBEDDINGS_DISABLED: '1' },
    });
  } catch (error) {
    // Do not forward arbitrary owner output or command diagnostics into a read view.
    throw new Error(error.killed ? 'Owner read timed out' : `Owner read failed (exit ${error.code ?? 'unknown'})`);
  }
  return parseCliObject(result.stdout);
}

export async function readMeshView(screen = 'machines', dependencies = {}) {
  if (!Object.hasOwn(SOURCES, screen)) throw new Error(`Unknown mesh screen: ${screen}`);
  const read = dependencies.readSource || readSource;
  const entries = await Promise.all(Object.entries(SOURCES[screen]).map(async ([name, args]) => {
    const checked_at = new Date().toISOString();
    try {
      const data = await read([...args]);
      if (!data || typeof data !== 'object' || data.ok === false || data.success === false) throw new Error('Owner reported a failed observation');
      return [name, { ok: true, command: args.join(' '), checked_at, data }];
    } catch (error) { return [name, { ok: false, command: args.join(' '), checked_at, error: error.message }]; }
  }));
  return { screen, observed_at: new Date().toISOString(), declarations: meshDeclarations(), sources: Object.fromEntries(entries) };
}
