/**
 * Vendor a plugin into a project.
 *
 * Plugins are a reusable head start. Vendoring copies a plugin's source into
 * the developer's own project once; the project then owns, tests and releases
 * that code and never needs the plugin or Total Recall at runtime. A provenance
 * file records where the copy came from so later upstream changes can be
 * compared by hand.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pluginBundleFiles, hashPluginDir } from './plugin-bundle.mjs';
import { listBundledPlugins } from './plugin-loader.mjs';
import { isGitSource } from './plugin-store.mjs';

const execFileAsync = promisify(execFile);
export const PROVENANCE_FILE = '.plugin-source.json';
export const BRICKS_FILE = 'tr-bricks.json';
export const DEFAULT_BRICKS_DIR = 'bricks';
const ID_PATTERN = /^[a-z][a-z0-9-]*$/;

function readManifest(dir) {
  const file = path.join(dir, 'plugin.json');
  if (!fs.existsSync(file)) throw new Error(`${dir} does not contain a plugin.json manifest`);
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`Invalid plugin.json: ${err.message}`);
  }
}

function assertEmptyDestination(dest) {
  if (!fs.existsSync(dest)) return;
  if (!fs.statSync(dest).isDirectory()) throw new Error(`${dest} exists and is not a directory`);
  if (fs.readdirSync(dest).length > 0) {
    throw new Error(`${dest} is not empty. Vendor into a new or empty directory so nothing is overwritten.`);
  }
}

function assertProjectDestination(projectRoot, target) {
  const root = fs.realpathSync(projectRoot);
  let parent = target;
  while (!fs.existsSync(parent)) {
    const next = path.dirname(parent);
    if (next === parent) throw new Error('Destination must be inside the project');
    parent = next;
  }
  const resolved = fs.realpathSync(parent);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error('Destination must be inside the project; symlink parent escapes it');
  }
}

function bricksPath(projectRoot) {
  return path.join(projectRoot, BRICKS_FILE);
}

export function readBricks(projectRoot = process.cwd()) {
  const file = bricksPath(projectRoot);
  if (!fs.existsSync(file)) return { bricks: [] };
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { bricks: Array.isArray(data.bricks) ? data.bricks : [] };
  } catch (err) {
    throw new Error(`${BRICKS_FILE} is not valid JSON: ${err.message}`);
  }
}

/** Installed bricks with local drift: 'unchanged', 'modified' or 'missing'. */
export function listBricks(projectRoot = process.cwd()) {
  return readBricks(projectRoot).bricks.map((b) => {
    const dir = path.resolve(projectRoot, b.dir);
    let status = 'missing';
    if (fs.existsSync(dir)) status = hashPluginDir(dir).sha256 === b.sha256 ? 'unchanged' : 'modified';
    return { ...b, status };
  });
}

function parseVersion(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(v || ''));
  return m ? m.slice(1).map(Number) : null;
}

/** Supports '*', exact 'x.y.z', '^x.y.z' (same major, at least) and '>=x.y.z'. */
export function satisfiesRange(version, range) {
  if (!range || range === '*') return true;
  const have = parseVersion(version);
  const m = /^(\^|>=)?\s*(\d+\.\d+\.\d+)$/.exec(String(range).trim());
  if (!have || !m) return false;
  const want = parseVersion(m[2]);
  const cmp = have[0] - want[0] || have[1] - want[1] || have[2] - want[2];
  if (m[1] === '>=') return cmp >= 0;
  if (m[1] === '^') return have[0] === want[0] && cmp >= 0;
  return cmp === 0;
}

function parseRequires(manifest) {
  if (manifest.requires === undefined) return [];
  if (!Array.isArray(manifest.requires)) throw new Error("plugin.json 'requires' must be an array");
  return manifest.requires.map((r) => {
    const entry = typeof r === 'string' ? { id: r } : r;
    if (!entry || !ID_PATTERN.test(entry.id || '')) throw new Error(`plugin.json 'requires' has an invalid entry: ${JSON.stringify(r)}`);
    return { id: entry.id, range: entry.version || '*' };
  });
}

function dependencyHints(dir) {
  const file = path.join(dir, 'package.json');
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')).dependencies || {};
  } catch {
    return {};
  }
}

/**
 * Add a plugin to the project as a brick: a self-owned copy under bricks/<id>
 * (or the given directory), recorded in tr-bricks.json.
 * @param {string} source bundled id, git URL or local directory
 * @param {string} [dest] directory inside the project; defaults to bricks/<id>
 */
export async function vendorPlugin(source, dest, options = {}) {
  const { projectRoot = process.cwd(), resolveRequires = false, chain = [] } = options;
  if (!source || typeof source !== 'string') throw new Error('Missing plugin source');

  let srcDir;
  let sourceRecord;
  let cleanup = null;
  const bundled = ID_PATTERN.test(source) ? listBundledPlugins().find((p) => p.id === source) : null;
  if (bundled) {
    srcDir = bundled.dir;
    sourceRecord = { kind: 'bundled', ref: bundled.id };
  } else if (isGitSource(source)) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-vendor-'));
    try {
      await execFileAsync('git', ['clone', '--depth', '1', '--', source, tmp], { timeout: 120_000 });
    } catch (err) {
      fs.rmSync(tmp, { recursive: true, force: true });
      throw new Error(`Failed to clone ${source}: ${(err.stderr || err.message || '').toString().trim()}`);
    }
    srcDir = tmp;
    cleanup = tmp;
    sourceRecord = { kind: 'git', ref: source };
  } else {
    const abs = path.resolve(projectRoot, source);
    if (!fs.existsSync(abs)) throw new Error(`No bundled plugin, git URL or directory matches '${source}'`);
    srcDir = abs;
    sourceRecord = { kind: 'local', ref: abs };
  }

  try {
    const manifest = readManifest(srcDir);
    if (!manifest.id || !ID_PATTERN.test(manifest.id)) throw new Error('plugin.json has no valid id');
    const relDest = dest || path.join(DEFAULT_BRICKS_DIR, manifest.id);
    const target = path.resolve(projectRoot, relDest);
    if (target !== projectRoot && !target.startsWith(path.resolve(projectRoot) + path.sep)) {
      throw new Error('Destination must be inside the project');
    }
    assertProjectDestination(projectRoot, target);
    const registry = readBricks(projectRoot);
    if (registry.bricks.some((b) => b.id === manifest.id)) {
      throw new Error(`Brick '${manifest.id}' is already in this project. Remove it from ${BRICKS_FILE} and its directory first.`);
    }
    assertEmptyDestination(target);

    const required = parseRequires(manifest);
    if (chain.includes(manifest.id)) throw new Error(`Circular requires: ${[...chain, manifest.id].join(' -> ')}`);
    const installed = (id) => readBricks(projectRoot).bricks.find((b) => b.id === id);
    const conflicts = required.filter((r) => installed(r.id) && !satisfiesRange(installed(r.id).version, r.range));
    if (conflicts.length) {
      throw new Error(`Conflicting required bricks: ${conflicts.map((r) => `${r.id} needs ${r.range} but ${installed(r.id).version} is installed`).join('; ')}`);
    }
    const missing = required.filter((r) => !installed(r.id));
    if (missing.length && !resolveRequires) {
      throw new Error(`Missing required bricks: ${missing.map((r) => `${r.id}@${r.range}`).join(', ')}. Add them first or resolve them automatically.`);
    }
    const resolved = [];
    for (const r of missing) {
      const dep = await vendorPlugin(r.id, undefined, { projectRoot, resolveRequires, chain: [...chain, manifest.id] });
      if (!satisfiesRange(dep.version, r.range)) {
        throw new Error(`Required brick ${r.id} resolved to ${dep.version}, which does not satisfy ${r.range}`);
      }
      resolved.push(dep.id);
    }
    if (registry.bricks.some((b) => b.id === manifest.id)) {
      throw new Error(`Brick '${manifest.id}' is already in this project.`);
    }

    // A plugin that declares a capability is vendored as a brick: capability
    // code only, no UI and no host manifest. Anything else is copied whole.
    const audience = manifest.capability ? 'brick' : 'host';
    const files = pluginBundleFiles(srcDir, { audience });
    fs.mkdirSync(target, { recursive: true });
    for (const f of files) {
      const out = path.join(target, f.path);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      if (f.data) fs.writeFileSync(out, f.data);
      else fs.copyFileSync(f.abs, out);
      fs.chmodSync(out, f.mode);
    }
    // The recorded hash describes the vendored files, so drift detection stays
    // correct when a brick is a reduced copy of its source plugin.
    const sha256 = hashPluginDir(target).sha256;
    const vendoredAt = new Date().toISOString();
    const provenance = {
      vendored_from: manifest.id,
      version: manifest.version,
      source: sourceRecord,
      sha256,
      vendored_at: vendoredAt,
      note: 'This project owns this copy. Record upstream comparisons here; do not expect automatic updates.'
    };
    fs.writeFileSync(path.join(target, PROVENANCE_FILE), `${JSON.stringify(provenance, null, 2)}\n`);
    registry.bricks = readBricks(projectRoot).bricks;
    registry.bricks.push({
      id: manifest.id,
      version: manifest.version,
      dir: path.relative(projectRoot, target).split(path.sep).join('/'),
      source: sourceRecord,
      sha256,
      added_at: vendoredAt,
      ...(required.length ? { requires: required } : {})
    });
    fs.writeFileSync(bricksPath(projectRoot), `${JSON.stringify(registry, null, 2)}\n`);
    return {
      id: manifest.id,
      version: manifest.version,
      dest: target,
      files: files.length,
      sha256,
      source: sourceRecord,
      dependencies: dependencyHints(target),
      requires: required,
      resolved
    };
  } finally {
    if (cleanup) fs.rmSync(cleanup, { recursive: true, force: true });
  }
}
