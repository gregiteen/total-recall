#!/usr/bin/env node
/**
 * Gate: the shipped scaffold must contain NO per-brain state.
 *
 * Three releases running, a state file was treated as a template and either
 * published or used to overwrite a real brain's data. Each was fixed by hand,
 * one file at a time, which is why there was a third. This turns the class into
 * a release-blocking check:
 *
 *   - scaffold/ carries nothing classified as brain state
 *   - the manifest shipped beside sync-repo.mjs matches the canonical one
 *     (sync-repo refuses to run without it, so a drifted copy is as dangerous
 *     as a missing one)
 *
 * Run by the code-quality gates and the release pre-flight.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findBrainState, BRAIN_STATE_MANIFEST } from '../src/core/brain-state.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCAFFOLD_BRAIN = path.join(ROOT, 'scaffold', '.agent', 'skills', 'total-recall');
const SHIPPED_MANIFEST = path.join(SCAFFOLD_BRAIN, 'scripts', 'brain-state.json');

let failed = 0;

// 1. Nothing state-like may ship.
const found = findBrainState(SCAFFOLD_BRAIN).filter((rel) => {
  // memory-vault is the one deliberate exception: a small curated set of seed
  // nodes ships so a new brain starts with the operating rules. It is allowed
  // ONLY because sync-scaffold copies an explicit allowlist into it rather
  // than syncing the directory.
  return !rel.startsWith('memory-vault');
});

if (found.length) {
  console.error('❌ shipped scaffold contains per-brain state:\n');
  for (const f of found) console.error(`   ${f}`);
  console.error('\n   These belong to one brain. Publishing them leaks that brain, and a');
  console.error('   template sync would overwrite the real thing in every repo.');
  console.error('   Add the path to src/core/brain-state.json and re-run sync-scaffold.');
  failed = 1;
} else {
  console.log('✅ shipped scaffold carries no per-brain state');
}

// 2. The travelling copy must match the canonical one.
if (!fs.existsSync(SHIPPED_MANIFEST)) {
  console.error(`\n❌ ${path.relative(ROOT, SHIPPED_MANIFEST)} is missing.`);
  console.error('   sync-repo.mjs refuses to run without it, so every brain would fail to sync.');
  console.error('   Run: node scripts/sync-scaffold.mjs');
  failed = 1;
} else {
  const a = fs.readFileSync(BRAIN_STATE_MANIFEST, 'utf8');
  const b = fs.readFileSync(SHIPPED_MANIFEST, 'utf8');
  if (a !== b) {
    console.error(`\n❌ ${path.relative(ROOT, SHIPPED_MANIFEST)} has drifted from src/core/brain-state.json.`);
    console.error('   A stale copy is what this whole mechanism exists to prevent.');
    console.error('   Run: node scripts/sync-scaffold.mjs');
    failed = 1;
  } else {
    console.log('✅ shipped brain-state manifest matches the canonical one');
  }
}

// 3. No self-dependency or stale self-install
const pkgJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
if (pkgJson.dependencies?.['total-recall-brain'] || pkgJson.devDependencies?.['total-recall-brain']) {
  console.error('\n❌ package.json must not depend on total-recall-brain (self-dependency).');
  failed = 1;
} else if (fs.existsSync(path.join(ROOT, 'node_modules', 'total-recall-brain'))) {
  console.error('\n❌ node_modules/total-recall-brain exists in source repository.');
  failed = 1;
} else {
  console.log('✅ no self-dependency on total-recall-brain');
}

process.exit(failed);
