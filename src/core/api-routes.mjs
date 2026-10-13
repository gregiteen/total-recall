/**
 * Route table of the Total Recall HTTP API, read from the Express routers
 * themselves so a CLI verb exists for every route without a hand-kept list.
 */
import { extractRoutes } from '../server/route-inventory.mjs';

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
  // Read the same mounted stack the server uses, including installed plugins.
  // Import failures are errors: an incomplete inventory must not look complete.
  const { default: router } = await import('../server/rest.mjs');
  const seen = new Set();
  const out = [];
  for (const { method, path: routePath } of extractRoutes(router)) {
    if (typeof routePath !== 'string') continue;
    const key = `${method} ${routePath}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const group = routePath.replace(/^\/api\//, '').split('/').filter(Boolean)[0] || 'root';
    out.push({ group, method, path: routePath,
      action: actionFor(method, routePath, group),
      params: [...routePath.matchAll(/:([A-Za-z0-9_]+)/g)].map(match => match[1]),
    });
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
