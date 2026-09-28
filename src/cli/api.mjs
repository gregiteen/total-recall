/**
 * total-recall api — every HTTP API route as a CLI verb.
 *
 *   total-recall api list [group] [--json]
 *   total-recall api <group> <action> [positional params…] [--data '<json>'] [--query k=v]… [--json]
 *   total-recall api call <METHOD> </api/path> [--data '<json>'] [--query k=v]…
 *
 * Also reachable as `total-recall <group> <action>` for any group that has no
 * dedicated verb. Talks to the brain server named in config/brain.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadApiRoutes } from '../core/api-routes.mjs';
import { detectProjectBrain, getGlobalBrainDir } from './agent-dir.mjs';

function brainConnection() {
  const dirs = [detectProjectBrain(process.cwd())?.brainDir, getGlobalBrainDir()].filter(Boolean);
  for (const d of dirs) {
    try {
      const c = JSON.parse(fs.readFileSync(path.join(d, 'config', 'brain.json'), 'utf8'));
      if (c.url) return { url: process.env.TR_BRAIN || c.url, token: process.env.TR_PAT || c.token };
    } catch {
      /* try next */
    }
  }
  return { url: process.env.TR_BRAIN || 'http://localhost:3000', token: process.env.TR_PAT };
}

function parse(argv) {
  const out = { pos: [], query: {}, data: undefined, json: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') out.json = true;
    else if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--data') out.data = argv[++i];
    else if (a === '--query') {
      const [k, ...v] = String(argv[++i] ?? '').split('=');
      if (k) out.query[k] = v.join('=');
    } else out.pos.push(a);
  }
  return out;
}

async function call(method, routePath, { query, data }) {
  const { url, token } = brainConnection();
  const qs = new URLSearchParams(query).toString();
  const res = await fetch(`${url.replace(/\/$/, '')}${routePath}${qs ? `?${qs}` : ''}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(data !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: data !== undefined ? data : undefined,
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, ok: res.ok, body };
}

function printRoutes(routes) {
  const width = Math.max(...routes.map((r) => `${r.group} ${r.action}`.length), 10);
  for (const r of routes) {
    const params = r.params.map((p) => ` <${p}>`).join('');
    console.log(`  ${`${r.group} ${r.action}${params}`.padEnd(width + 12)} ${r.method.padEnd(6)} ${r.path}`);
  }
}

export default async function apiCli(argv = []) {
  const opts = parse(argv[0] === 'api' ? argv.slice(1) : argv);
  const routes = await loadApiRoutes();
  const [first, second, ...rest] = opts.pos;

  if (opts.help || !first || first === 'list') {
    const group = first === 'list' ? second : null;
    const shown = group ? routes.filter((r) => r.group === group) : routes;
    if (opts.json) return console.log(JSON.stringify(shown, null, 2));
    if (!group && !opts.help && first !== 'list') {
      console.log('Usage: total-recall api list [group] | api <group> <action> [params] [--data json] [--query k=v] | api call <METHOD> <path>\n');
    }
    if (!shown.length) return console.log(`  No routes for group "${group}".`);
    if (!group) {
      const groups = [...new Set(routes.map((r) => r.group))];
      console.log(`  ${routes.length} routes in ${groups.length} groups: ${groups.join(', ')}\n`);
      if (!opts.help && first !== 'list') return;
    }
    return printRoutes(shown);
  }

  if (first === 'call') {
    const [method, routePath] = [String(second || '').toUpperCase(), rest[0]];
    if (!method || !routePath) {
      console.error('Usage: total-recall api call <METHOD> </api/path> [--data json] [--query k=v]');
      process.exit(1);
    }
    return finish(await call(method, routePath, opts), opts);
  }

  const group = first;
  const groupRoutes = routes.filter((r) => r.group === group);
  if (!groupRoutes.length) {
    console.error(`Unknown API group "${group}". Run: total-recall api list`);
    process.exit(1);
  }
  if (!second) return printRoutes(groupRoutes);
  const route = groupRoutes.find((r) => r.action === second);
  if (!route) {
    console.error(`No "${second}" action in ${group}. Actions:`);
    printRoutes(groupRoutes);
    process.exit(1);
  }
  if (rest.length < route.params.length) {
    console.error(`Missing parameter(s): ${route.params.slice(rest.length).map((p) => `<${p}>`).join(' ')}`);
    process.exit(1);
  }
  let p = route.path;
  route.params.forEach((name, i) => {
    p = p.replace(`:${name}`, encodeURIComponent(rest[i]));
  });
  return finish(await call(route.method, p, opts), opts);
}

function finish(r, opts) {
  console.log(typeof r.body === 'string' ? r.body : JSON.stringify(r.body, null, opts.json ? 0 : 2));
  if (!r.ok) {
    console.error(`HTTP ${r.status}`);
    process.exitCode = 1;
  }
}
