#!/usr/bin/env node
// Refresh the scaffold's pinned plugin copies and scripts/scaffold-plugins.json
// from the installed owner plugins. `--check` reports drift and exits 1 without writing.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncScaffoldPlugins } from '../src/core/scaffold-plugins.mjs';
import { DEFAULT_PLUGIN_IDS } from '../src/core/default-plugins.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lock = JSON.parse(fs.readFileSync(path.join(root, 'scripts', 'scaffold-plugins.json'), 'utf8'));
// Core imports these plugins at load, so every scaffold must carry them.
const REQUIRED = DEFAULT_PLUGIN_IDS;
const ids = [...new Set([...REQUIRED, ...Object.keys(lock).map((k) => k.split('/')[0])])];
const check = process.argv.includes('--check');
const { changes, files } = syncScaffoldPlugins({ root, ids, write: !check });
for (const c of changes) console.log(`${c.change.padEnd(8)} ${c.file}`);
console.log(`${check ? 'Checked' : 'Synced'} ${ids.join(', ')}: ${files} pinned files, ${changes.length} change(s)${check && changes.length ? ' — run without --check to apply' : ''}`);
if (check && changes.length) process.exitCode = 1;
