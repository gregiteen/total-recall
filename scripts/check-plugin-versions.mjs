#!/usr/bin/env node
/**
 * Default plugins reach existing installs only when their version goes up, so a default plugin that
 * changed without a new version would ship and never arrive. This compares the scaffold with the
 * last published package and fails on exactly that case.
 *
 * Usage: node scripts/check-plugin-versions.mjs [--json]
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DEFAULT_PLUGIN_IDS } from '../src/core/default-plugins.mjs';
import { hashPluginDir } from '../src/core/plugin-bundle.mjs';
import { comparePackageVersions } from '../src/core/package-version.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLUGINS = path.join('scaffold', '.agent', 'skills', 'total-recall', 'plugins');
const packageName = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8')).name;
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-plugin-versions-'));
const version = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'plugin.json'), 'utf8')).version;

let failed = true;
try {
  const npm = (...args) => execFileSync('npm', args, { cwd: work, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const published = npm('view', packageName, 'version');
  const tarball = npm('pack', `${packageName}@${published}`, '--silent').split('\n').pop();
  execFileSync('tar', ['-xzf', tarball], { cwd: work });

  const rows = DEFAULT_PLUGIN_IDS.map((id) => {
    const ours = path.join(repo, PLUGINS, id);
    const theirs = path.join(work, 'package', PLUGINS, id);
    if (!fs.existsSync(theirs)) return { id, version: version(ours), state: 'new' };
    const [now, then] = [version(ours), version(theirs)];
    const order = comparePackageVersions(now, then);
    if (order === -1) return { id, version: now, published: then, state: 'behind' };
    if (order === 1) return { id, version: now, published: then, state: 'newer' };
    return { id, version: now, published: then, state: hashPluginDir(ours).sha256 === hashPluginDir(theirs).sha256 ? 'unchanged' : 'needs-version' };
  });
  const bad = rows.filter((row) => row.state === 'needs-version' || row.state === 'behind');
  if (process.argv.includes('--json')) console.log(JSON.stringify({ ok: bad.length === 0, published, rows }, null, 2));
  else {
    for (const row of rows) console.log(`${row.state.padEnd(14)} ${row.id} ${row.version}${row.published && row.published !== row.version ? ` (published ${row.published})` : ''}`);
    if (bad.length) console.log(`\n${bad.map((row) => row.id).join(', ')} changed since ${packageName} ${published} without a new version, so existing installs would not get the change.`);
  }
  failed = bad.length > 0;
} catch (err) {
  console.error(`Could not compare with the published package: ${err.stderr || err.message}`);
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
