#!/usr/bin/env node

/**
 * sync-scaffold.mjs
 *
 * Syncs the live .agent/skills/total-recall/ directory into scaffold/.agent/skills/total-recall/,
 * excluding personal/runtime data (sessions, logs, config, secrets, derived caches).
 *
 * Run this before every release to keep the scaffold in sync.
 * Also wired into the release.mjs pre-flight checks.
 */

import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = path.join(ROOT, '.agent', 'skills', 'total-recall') + '/';
const TARGET = path.join(ROOT, 'scaffold', '.agent', 'skills', 'total-recall') + '/';

// Directories and files that are personal/runtime — never ship in scaffold
const EXCLUDES = [
  'node_modules',
  'logs/',
  'sessions/',
  'backups/',
  'config/',
  'memory-derived/',
  'memory-inbox/',
  'scheduler/',
  '*.enc',
  '.extension-connected',
  'graph.canvas',
  // Personal memory nodes (user-specific, not template defaults)
  'memory-vault/queries/',
  'memory-vault/instructions/',
  'memory-vault/anti-patterns/',
  'memory-vault/decisions/',
  'memory-vault/corrections/',
  'memory-vault/lore/',
  'memory-vault/patterns/',
];

const excludeArgs = EXCLUDES.map(e => `--exclude='${e}'`).join(' ');

console.log('🔄 Syncing live .agent/ → scaffold/.agent/ ...');
console.log(`   Source: ${SOURCE}`);
console.log(`   Target: ${TARGET}`);

try {
  const cmd = `rsync -av --delete ${excludeArgs} '${SOURCE}' '${TARGET}'`;
  const output = execSync(cmd, { encoding: 'utf8', cwd: ROOT });

  // Check if anything actually changed
  const changedLines = output.split('\n').filter(l =>
    l.trim() && !l.startsWith('sent ') && !l.startsWith('total ') && !l.endsWith('/')
  );

  if (changedLines.length === 0) {
    console.log('✅ Scaffold already in sync — no changes needed.');
  } else {
    console.log(`\n📦 Synced ${changedLines.length} file(s):`);
    changedLines.forEach(f => console.log(`   ${f}`));
    console.log('\n✅ Scaffold synced successfully.');
  }
} catch (err) {
  console.error('❌ Scaffold sync failed:', err.message);
  process.exit(1);
}
