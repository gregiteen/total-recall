#!/usr/bin/env node
// Refresh the scaffold's pinned plugin copies and scripts/scaffold-plugins.json
// from each plugin's owner repository beside this one, or its installed copy where there is none. `--check` reports drift and exits 1 without writing.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { findOwnerRepos, syncScaffoldPlugins } from '../src/core/scaffold-plugins.mjs';
import { DEFAULT_PLUGIN_IDS } from '../src/core/default-plugins.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lock = JSON.parse(fs.readFileSync(path.join(root, 'scripts', 'scaffold-plugins.json'), 'utf8'));
// Core imports these plugins at load, so every scaffold must carry them.
const REQUIRED = DEFAULT_PLUGIN_IDS;
const { values: { plugin, source, check } } = parseArgs({ options: {
  plugin: { type: 'string' }, source: { type: 'string' }, check: { type: 'boolean' },
} });
const bundled = [...new Set([...REQUIRED, ...Object.keys(lock).map(k => k.split('/')[0])])];
if (plugin && !bundled.includes(plugin)) throw new Error('Unknown bundled plugin ' + plugin);
if (source && !plugin) throw new Error('--source requires --plugin <id>');
const ids = plugin ? [plugin] : bundled;
const owners = findOwnerRepos(root);
const sources = new Map(ids.filter(id => owners.has(id)).map(id => [id, owners.get(id)]));
if (source) sources.set(plugin, path.resolve(source));
for (const id of ids) console.log(`source   ${id}: ${sources.get(id) ? path.relative(root, sources.get(id)) : 'installed copy'}`);
const { changes, files } = syncScaffoldPlugins({ root, ids, write: !check, sources, preserveUnselected: Boolean(plugin) });
for (const c of changes) console.log(`${c.change.padEnd(8)} ${c.file}`);
console.log(`${check ? 'Checked' : 'Synced'} ${ids.join(', ')}: ${files} pinned files, ${changes.length} change(s)${check && changes.length ? ' — run without --check to apply' : ''}`);
if (check && changes.length) process.exitCode = 1;
