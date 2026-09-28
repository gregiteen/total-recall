/**
 * Route table of the Total Recall HTTP API, read from the Express routers
 * themselves so a CLI verb exists for every route without a hand-kept list.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROUTES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../server/routes');

/** Drop structured info log lines emitted by the modules the routes import, so CLI output stays parseable. */
export function silenceInfoLogs() {
  for (const stream of [process.stdout, process.stderr]) {
    const write = stream.write.bind(stream);
    stream.write = (chunk, ...rest) =>
      typeof chunk === 'string' && /^\{"timestamp":"[^"]+","level":"(info|debug)"/.test(chunk)
        ? true
        : write(chunk, ...rest);
  }
}

function isRouter(x) {
  return typeof x === 'function' && Array.isArray(x.stack);
}

/** Verb name for a route: the static path after /api/<group>, params dropped. */
export function actionFor(method, routePath, group) {
  const segs = routePath.replace(/^\/api\//, '').split('/').filter(Boolean);
  if (segs[0] === group) segs.shift();
  const staticSegs = segs.filter((s) => !s.startsWith(':') && s !== '*');
  const name = staticSegs.join('-');
  if (name) return name;
  return { GET: 'list', POST: 'create', PUT: 'update', PATCH: 'patch', DELETE: 'delete' }[method] || method.toLowerCase();
}

/**
 * @returns {Promise<Array<{group:string, method:string, path:string, action:string, params:string[]}>>}
 */
export async function loadApiRoutes() {
  silenceInfoLogs();
  const out = [];
  const files = fs
    .readdirSync(ROUTES_DIR)
    .filter((f) => f.endsWith('.mjs') && !f.endsWith('.spec.mjs') && !f.startsWith('_'))
    .sort();
  for (const file of files) {
    const group = file.replace(/\.mjs$/, '');
    let mod;
    // Route modules log startup lines on import; keep CLI output clean.
    const { log, info } = console;
    console.log = console.info = () => {};
    try {
      mod = await import(path.join(ROUTES_DIR, file));
    } catch {
      continue;
    } finally {
      console.log = log;
      console.info = info;
    }
    const routers = Object.values(mod).filter(isRouter);
    const seen = new Set();
    for (const router of routers) {
      for (const layer of router.stack) {
        if (!layer.route) continue;
        const paths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
        for (const p of paths) {
          if (typeof p !== 'string') continue;
          for (const method of Object.keys(layer.route.methods).map((m) => m.toUpperCase())) {
            const key = `${method} ${p}`;
            if (seen.has(key)) continue;
            seen.add(key);
            out.push({
              group,
              method,
              path: p,
              action: actionFor(method, p, group),
              params: [...p.matchAll(/:([A-Za-z0-9_]+)/g)].map((m) => m[1]),
            });
          }
        }
      }
    }
  }
  // Make (group, action) unique: suffix the method on collisions.
  const count = new Map();
  for (const r of out) count.set(`${r.group}/${r.action}`, (count.get(`${r.group}/${r.action}`) || 0) + 1);
  const used = new Map();
  for (const r of out) {
    const k = `${r.group}/${r.action}`;
    if (count.get(k) > 1) {
      let name = `${r.action}-${r.method.toLowerCase()}`;
      const n = (used.get(`${r.group}/${name}`) || 0) + 1;
      used.set(`${r.group}/${name}`, n);
      if (n > 1) name = `${name}-${n}`;
      r.action = name;
    }
  }
  return out;
}
