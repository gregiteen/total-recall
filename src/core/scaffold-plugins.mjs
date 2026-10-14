/**
 * The scaffold ships pinned copies of a few owner plugins (auth today) so a new
 * brain works before anything is installed. The pin must describe exactly what
 * the npm package carries: the plugin's own `npm pack` contents without tests,
 * plus its lockfile for reproducible installs. `.gitignore` is never part of it,
 * because npm drops it from every package.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { isBrainState } from './brain-state.mjs';

export const TEST_PATTERNS = [/^test\//, /^tests\//, /(^|\/)[^/]+\.(spec|test)\.[cm]?[jt]sx?$/, /^vitest\.config\.[cm]?[jt]s$/];

export function isReleaseFile(rel) {
  const unix = rel.split(path.sep).join('/');
  if (unix === '.gitignore' || unix.endsWith('/.gitignore')) return false;
  if (unix.split('/').includes('node_modules')) return false;
  return !TEST_PATTERNS.some((re) => re.test(unix));
}

/** Files of one plugin that ship in the scaffold, relative to the plugin root. */
export function releaseFiles(pluginDir, run = spawnSync) {
  const r = run('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: pluginDir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.error || r.status !== 0) throw new Error(`npm pack --dry-run failed in ${pluginDir}: ${(r.stderr || '').trim().split('\n').pop() || r.error?.message}`);
  const text = String(r.stdout || '');
  const packed = JSON.parse(text.slice(text.indexOf('[')))[0]?.files?.map((f) => f.path) || [];
  const files = new Set(packed.filter(isReleaseFile));
  for (const file of files) {
    if (path.isAbsolute(file) || file.split(/[\\/]/).some(part => ['..', '.agent', '.agents', '.ssss', '.tr'].includes(part)) || isBrainState(file)) throw new Error(`Plugin release contains private brain state or unsafe path: ${file}`);
  }
  if (fs.existsSync(path.join(pluginDir, 'package-lock.json'))) files.add('package-lock.json');
  return [...files].sort();
}

const digest = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

/** Compare (and with write:true, update) the scaffold copies and the pin. */
export function syncScaffoldPlugins({ root, ids, write = false, run = spawnSync }) {
  const scaffoldPlugins = path.join(root, 'scaffold', '.agent', 'skills', 'total-recall', 'plugins');
  const lock = {};
  const changes = [];
  // Validate every owner before copying any source or replacing the release pin.
  const plans = ids.map(id => {
    const source = fs.realpathSync(path.join(root, '.agent', 'skills', 'total-recall', 'plugins', id));
    const files = releaseFiles(source, run);
    return { id, source, files };
  });
  for (const { id, source, files } of plans) {
    const target = path.join(scaffoldPlugins, id);
    for (const rel of files) {
      const from = path.join(source, rel);
      const to = path.join(target, rel);
      const sha = digest(from);
      lock[`${id}/${rel}`] = sha;
      if (!fs.existsSync(to)) changes.push({ file: `${id}/${rel}`, change: 'added' });
      else if (digest(to) !== sha) changes.push({ file: `${id}/${rel}`, change: 'updated' });
      if (write) { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to); }
    }
    const keep = new Set(files);
    const walk = (dir) => {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const abs = path.join(dir, entry.name);
        if (entry.isDirectory()) { walk(abs); if (write && fs.readdirSync(abs).length === 0) fs.rmdirSync(abs); continue; }
        const rel = path.relative(target, abs).split(path.sep).join('/');
        if (!keep.has(rel)) { changes.push({ file: `${id}/${rel}`, change: 'removed' }); if (write) fs.rmSync(abs); }
      }
    };
    walk(target);
  }
  if (write) fs.writeFileSync(path.join(root, 'scripts', 'scaffold-plugins.json'), `${JSON.stringify(Object.fromEntries(Object.entries(lock).sort()), null, 2)}\n`);
  return { changes, files: Object.keys(lock).length };
}
