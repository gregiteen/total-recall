#!/usr/bin/env node

/**
 * sync-scaffold.mjs
 *
 * Syncs the live .agent/skills/total-recall/ directory into scaffold/.agent/skills/total-recall/,
 * using an ALLOWLIST approach for the memory-vault (only curated template nodes ship).
 * Everything else (skills, references, scripts, evals, subagents, SKILL.md) syncs fully.
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

// ── Step 1: Sync everything EXCEPT the memory-vault ──
// These are runtime/personal dirs that never ship
const EXCLUDES = [
  'node_modules',
  'logs/',
  'sessions/',
  'backups/',
  'config/',
  // The skills registry is developer-local state: it records absolute
  // source_paths of every repo on THIS machine. Syncing it shipped 562 lines of
  // /Users/<name>/... and named 16 third-party repos inside the npm tarball —
  // an open-source-invariant violation and a disclosure of the author's whole
  // project inventory. New brains start with an empty catalog by design
  // (loadRegistry returns emptyRegistry() when the file is absent).
  'skills-registry/',
  'memory-derived/',
  'memory-inbox/',
  'scheduler/',
  'browser-profile/',
  '*.enc',
  '.extension-connected',
  'graph.canvas',
  // Exclude the ENTIRE vault — we handle it separately via allowlist
  'memory-vault/',
];

const excludeArgs = EXCLUDES.map(e => `--exclude='${e}'`).join(' ');

console.log('🔄 Syncing live .agent/ → scaffold/.agent/ ...');
console.log(`   Source: ${SOURCE}`);
console.log(`   Target: ${TARGET}`);

try {
  // Sync non-vault files (skills, references, scripts, SKILL.md, evals, subagents)
  const cmd1 = `rsync -av --delete ${excludeArgs} '${SOURCE}' '${TARGET}'`;
  execSync(cmd1, { encoding: 'utf8', cwd: ROOT });

  // ── Step 2: Sync ONLY curated template vault nodes ──
  // These are the generic system defaults that every new user should get.
  // Personal nodes (user facts, corrections, anti-patterns, decisions, lore) are NEVER shipped.
  const CURATED_VAULT_NODES = [
    'invariants/operating-instructions.md',
    'preferences/always-websearch-gap.md',
    'preferences/topic-research-sop.md',
    'concepts/cli-help-reference.md',
  ];

  const vaultSrc = path.join(SOURCE, 'memory-vault');
  const vaultDst = path.join(TARGET, 'memory-vault');

  // Ensure target category dirs exist
  execSync(`mkdir -p '${vaultDst}/invariants' '${vaultDst}/preferences' '${vaultDst}/concepts'`, { encoding: 'utf8' });

  let vaultSynced = 0;
  for (const node of CURATED_VAULT_NODES) {
    const src = path.join(vaultSrc, node);
    const dst = path.join(vaultDst, node);
    try {
      execSync(`rsync -av '${src}' '${dst}'`, { encoding: 'utf8', cwd: ROOT });
      vaultSynced++;
    } catch {
      console.warn(`   ⚠ Curated node not found: ${node}`);
    }
  }

  // Clean up any vault files that are NOT in the curated list
  const curatedSet = new Set(CURATED_VAULT_NODES);
  const findCmd = `find '${vaultDst}' -type f -name '*.md'`;
  const existingFiles = execSync(findCmd, { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  for (const absPath of existingFiles) {
    const rel = path.relative(vaultDst, absPath);
    if (!curatedSet.has(rel)) {
      execSync(`rm '${absPath}'`);
      console.log(`   🗑 Removed non-curated node: ${rel}`);
    }
  }

  console.log(`\n✅ Scaffold synced. ${vaultSynced} curated vault node(s) shipped.`);
} catch (err) {
  console.error('❌ Scaffold sync failed:', err.message);
  process.exit(1);
}
