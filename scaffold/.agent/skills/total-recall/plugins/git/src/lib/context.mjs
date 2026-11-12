import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
export function git(ctx, args, options) {
  const result = ctx.git(args, options);
  if ((result.status ?? result.code) !== 0 || result.error) throw new Error(`Git ${args[0]} failed`);
  return String(result.stdout ?? '');
}
export function tr(ctx, args, options = {}) {
  return spawnSync(ctx.env.GIT_PLUGIN_TR_BIN || 'total-recall', args, {
    cwd: ctx.cwd, env: ctx.env, encoding: 'utf8', shell: false,
    timeout: 30000, maxBuffer: 16 * 1024 * 1024, ...options,
  });
}
export function trJSON(ctx, args) {
  const result = tr(ctx, args);
  if (result.error || result.status !== 0) throw new Error(`Total Recall ${args[0]} failed`);
  try { return JSON.parse(result.stdout); } catch { throw new Error(`Total Recall ${args[0]} returned invalid JSON`); }
}
export function repository(ctx) {
  return git(ctx, ['rev-parse', '--path-format=absolute', '--git-common-dir']).trim();
}
export async function ledger(ctx, kind = 'commits', required = false) {
  const dir = ctx.env.TR_PLUGIN_STATE_DIR;
  if (!dir) {
    if (required) throw new Error('TR_PLUGIN_STATE_DIR must be supplied by the Total Recall host');
    return null;
  }
  if (!path.isAbsolute(dir)) throw new Error('TR_PLUGIN_STATE_DIR must be absolute');
  let modulePath;
  const root = ctx.env.TR_PACKAGE_ROOT;
  if (root) {
    if (!path.isAbsolute(root) || JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).name !== 'total-recall-brain') throw new Error('Invalid Total Recall state host');
    modulePath = path.join(root, 'src/core/plugin-state-store.mjs');
  } else modulePath = require.resolve('total-recall-brain/src/core/plugin-state-store.mjs');
  const { PluginStateStore } = await import(pathToFileURL(modulePath).href);
  const key = crypto.createHash('sha256').update(repository(ctx)).digest('hex');
  return new PluginStateStore(path.join(dir, `${kind}-${key}.jsonl`), 'git');
}
export function session(env) { return env.CLAUDE_SESSION_ID || env.CODEX_SESSION_ID || env.TR_SESSION_ID || null; }
export function trailers(message) {
  // Trailers must be in the final paragraph. Body prose is not attribution.
  const block = message.trim().split(/\n\s*\n/).at(-1) || '';
  const result = {};
  let key;
  for (const line of block.split('\n')) {
    const match = /^([\w-]+):\s*(.*)$/.exec(line);
    if (match) { key = match[1].toLowerCase(); (result[key] ||= []).push(match[2]); }
    else if (/^\s+/.test(line) && key) result[key][result[key].length - 1] += ` ${line.trim()}`;
    else return {};
  }
  return result;
}
export function intent(message) {
  const rows = trailers(message);
  return {
    session: rows['agent-session']?.[0] || rows['session-id']?.[0] || rows.session?.[0] || null,
    trackerItems: [...new Set(message.match(/\b(?:[A-Z][A-Z0-9_]*-[A-Z]*\d[\w.-]*|P\d+\.\d+|R\d+)\b/g) || [])],
    decisions: [...(rows.decision || []), ...message.split('\n').filter(row => /^Decision\s*:/i.test(row)).map(row => row.replace(/^Decision\s*:\s*/i, ''))].filter((row, i, all) => all.indexOf(row) === i),
    rules: rows.rules || rows.rule || [], trailers: rows,
  };
}
export async function commitContext(ctx, sha) {
  const message = git(ctx, ['show', '-s', '--format=%B', sha]);
  const store = await ledger(ctx);
  const record = store?.read([]).findLast(row => row.type === 'git.commit_context' && row.sha === sha) || null;
  return { sha, message: message.trimEnd(), recorded: record, trailers: trailers(message), ...intent(message),
    ...(record ? { session: record.session, trackerItems: record.trackerItems, decisions: record.decisions, rules: record.rules } : {}) };
}
export function output(ctx, value, text) { console.log(ctx.json ? JSON.stringify(value, null, 2) : text); }
export function operation(summary, usage, run) {
  return { summary, usage, async run(args, ctx) {
    try { return await run(args, ctx); }
    catch (error) { if (ctx.json) console.log(JSON.stringify({ ok: false, error: error.message })); else console.error(error.message); return 1; }
  } };
}
export function activePlan(ctx) {
  const root = git(ctx, ['rev-parse', '--show-toplevel']).trim();
  const base = path.join(root, 'docs/projects/in-progress');
  if (!fs.existsSync(base)) return { tracker: null, plan: null, items: [], actionLog: '', reason: 'No active plan' };
  const dirs = fs.readdirSync(base, { withFileTypes: true }).filter(row => row.isDirectory());
  const trackers = dirs.flatMap(dir => fs.readdirSync(path.join(base, dir.name)).filter(name => name.endsWith('_PROJECT_TRACKER.md')).map(name => path.join(base, dir.name, name)));
  if (trackers.length !== 1) throw new Error('Expected one active project tracker');
  const tracker = trackers[0];
  const plan = tracker.replace('_PROJECT_TRACKER.md', '_DEVELOPMENT_PLAN.md');
  const body = fs.readFileSync(tracker, 'utf8');
  const planBody = fs.existsSync(plan) ? fs.readFileSync(plan, 'utf8') : '';
  return { tracker, plan, body, planBody, items: body.split('\n').filter(row => /^- \[[ xX]\]/.test(row)), actionLog: body.split(/^## Action Log\s*$/m)[1]?.trim() || '' };
}
