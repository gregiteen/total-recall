/**
 * total-recall init
 *
 * Bootstrap Total Recall into an existing project repository.
 * Runs in the current working directory (cwd).
 *
 * What it does:
 *   1. Creates .agent/memory-vault/<categories>/ directory structure
 *   2. Creates .agent/skills/ and seeds the core SSSS skill
 *   3. Copies default invariant memory nodes from the scaffold
 *   4. Runs compile to inject the Total Recall memory block into any
 *      existing IDE instruction files (GEMINI.md, .cursorrules, CLAUDE.md,
 *      AGENTS.md, .clauderules) non-destructively, or creates INSTRUCTIONS.md
 *      + symlinks if they don't exist yet.
 *
 * Usage:
 *   npx total-recall init [options]
 *
 * Options:
 *   --dry-run     Print what would be done without making changes
 *   --help        Show this help
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');

// ─── Helpers ────────────────────────────────────────────────────────────────

function log(msg)      { console.error(`  ${msg}`); }
function logStep(n, msg) { console.error(`\n  [${n}] ${msg}`); }
function logOk(msg)    { console.error(`  ✅ ${msg}`); }
function logSkip(msg)  { console.error(`  ⏭  ${msg} (already exists)`); }
function logWarn(msg)  { console.error(`  ⚠️  ${msg}`); }

function ensureDir(dirPath, dryRun) {
  if (fs.existsSync(dirPath)) return false;
  if (!dryRun) fs.mkdirSync(dirPath, { recursive: true });
  return true;
}

function copyFile(src, dest, dryRun) {
  if (fs.existsSync(dest)) {
    logSkip(path.basename(dest));
    return false;
  }
  if (!dryRun) fs.copyFileSync(src, dest);
  logOk(`Installed ${path.relative(process.cwd(), dest)}`);
  return true;
}

function copyDirMerge(src, dest, dryRun) {
  if (!fs.existsSync(src)) return;
  ensureDir(dest, dryRun);
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirMerge(srcPath, destPath, dryRun);
    } else {
      copyFile(srcPath, destPath, dryRun);
    }
  }
}

function parseArgs(args) {
  const opts = { dryRun: false, help: false, brain: null, token: null };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--help' || arg === '-h') opts.help = true;
    else if (arg === '--brain') opts.brain = args[++i];
    else if (arg === '--token') opts.token = args[++i];
  }
  return opts;
}

function printHelp() {
  console.log(`
  total-recall init — Bootstrap Total Recall into an existing project repo

  Run this command from inside your project directory.

  Usage: total-recall init [options]

  Options:
    --dry-run     Print what would be done without making changes
    --help, -h    Show this help

  What it does:
    1. Creates .agent/memory-vault/ with the full SSSS category directory layout
    2. Seeds the SSSS skill into .agent/skills/ssss/
    3. Copies core operating invariant memory nodes from the scaffold
    4. Runs compile — injects the Total Recall memory block into any existing
       IDE instruction files (GEMINI.md, .cursorrules, CLAUDE.md, AGENTS.md,
       .clauderules) without overwriting them. If none exist, creates
       INSTRUCTIONS.md and the standard IDE symlinks.

  Example:
    cd ~/my-project
    npx total-recall init
`);
}

// ─── Main ───────────────────────────────────────────────────────────────────

export default async function init(args) {
  const opts = parseArgs(args);
  if (opts.help) { printHelp(); return; }

  const cwd = process.cwd();
  const agentDir = path.join(cwd, '.agent');

  console.error(`
  ┌─────────────────────────────────────────────────────────┐
  │  Total Recall Init                                       │
  │  Bootstrapping into: ${cwd.slice(0, 36).padEnd(36)}  │
  └─────────────────────────────────────────────────────────┘
`);

  if (opts.dryRun) logWarn('DRY RUN — no changes will be made\n');

  // ── Step 1: Create .agent/ directory layout ──
  logStep('1/4', 'Creating .agent/ directory structure');

  const vaultCategories = [
    'invariants', 'patterns', 'anti-patterns',
    'preferences', 'decisions', 'concepts'
  ];

  const dirs = [
    path.join(agentDir, 'skills'),
    path.join(agentDir, 'memory-derived'),
    path.join(agentDir, 'memory-inbox', 'pending'),
    path.join(agentDir, 'memory-inbox', 'conflicts'),
    path.join(agentDir, 'sessions'),
    ...vaultCategories.map(c => path.join(agentDir, 'memory-vault', c))
  ];

  let created = 0;
  for (const dir of dirs) {
    const wasCreated = ensureDir(dir, opts.dryRun);
    if (wasCreated) {
      if (opts.dryRun) log(`  mkdir ${path.relative(cwd, dir)}`);
      created++;
    }
  }
  logOk(`Directory structure ready (${created} created, ${dirs.length - created} already existed)`);

  // ── Step 2: Seed core skills ──
  logStep('2/4', 'Installing core skills into .agent/skills/');

  const scaffoldSkillsDir = path.join(ROOT, 'scaffold', '.agent', 'skills');
  let skillsToSeed = ['total-recall'];
  if (fs.existsSync(scaffoldSkillsDir)) {
    try {
      skillsToSeed = fs.readdirSync(scaffoldSkillsDir).filter(f => fs.statSync(path.join(scaffoldSkillsDir, f)).isDirectory());
    } catch { /* fallback to default */ }
  }

  for (const skill of skillsToSeed) {
    const skillSrc = path.join(scaffoldSkillsDir, skill);
    const skillDest = path.join(agentDir, 'skills', skill);

    if (!fs.existsSync(skillSrc)) {
      logWarn(`${skill} skill source not found — skipping.`);
    } else {
      copyDirMerge(skillSrc, skillDest, opts.dryRun);
      logOk(`${skill} skill installed`);
    }
  }

  // ── Step 3: Copy default memory vault nodes ──
  logStep('3/4', 'Seeding default memory vault nodes');

  const scaffoldVaultSrc = path.join(ROOT, 'scaffold', '.agent', 'memory-vault');
  const localVaultDest = path.join(agentDir, 'memory-vault');

  if (!fs.existsSync(scaffoldVaultSrc)) {
    logWarn('Scaffold memory vault not found — skipping.');
  } else {
    copyDirMerge(scaffoldVaultSrc, localVaultDest, opts.dryRun);
    logOk('Default memory vault seeded');
  }

  // ── Step 3.5: Seed the onboarding interview task ──
  logStep('3.5/4', 'Seeding onboarding interview into scheduler queue');

  const queueDir = path.join(agentDir, 'scheduler', 'queue');
  const interviewDest = path.join(queueDir, 'onboarding-interview.md');
  const interviewSrc = path.join(ROOT, 'templates', 'onboarding-interview.md');

  if (!fs.existsSync(interviewDest)) {
    if (!opts.dryRun) {
      fs.mkdirSync(queueDir, { recursive: true });
      if (fs.existsSync(interviewSrc)) {
        const now = new Date().toISOString();
        const content = fs.readFileSync(interviewSrc, 'utf8').replace(/\{\{CREATED_AT\}\}/g, now);
        fs.writeFileSync(interviewDest, content);
        logOk('Onboarding interview task queued — agent will conduct it on first chat');
      } else {
        logWarn('Interview template not found — skipping');
      }
    } else {
      log(`  Would write ${path.relative(cwd, interviewDest)}`);
    }
  } else {
    logSkip('onboarding-interview.md already in queue');
  }

  // ── Step 4: Run compile to inject memory block into existing IDE files ──
  logStep('4/4', 'Compiling vault and injecting into IDE instruction files');

  if (opts.dryRun) {
    log('  Would run: total-recall compile (targeting current directory)');
    logOk('Dry run complete. Run without --dry-run to apply changes.');
    return;
  }

  const instructionsFile = path.join(cwd, 'INSTRUCTIONS.md');
  const vaultDir = path.join(agentDir, 'memory-vault');
  const skillsDir = path.join(agentDir, 'skills');
  const derivedDir = path.join(agentDir, 'memory-derived');

  try {
    const { compileSurface } = await import('../core/surface.mjs');
    const result = await compileSurface({ vaultDir, skillsDir, derivedDir, instructionsFile });
    logOk(`Compile complete — ${result.nodesProcessed} nodes processed`);
  } catch (err) {
    logWarn(`Compile failed: ${err.message}`);
    logWarn('You can run `npx total-recall compile` manually once the issue is resolved.');
  }


  // ── Optional: register a remote brain for hybrid mode ──
  if (opts.brain) {
    const cfgDir = path.join(agentDir, 'config');
    fs.mkdirSync(cfgDir, { recursive: true });
    const brainCfg = { url: opts.brain };
    if (opts.token) brainCfg.token = opts.token;
    fs.writeFileSync(path.join(cfgDir, 'brain.json'), JSON.stringify(brainCfg, null, 2));
    logOk(`Registered brain at ${opts.brain}. Run \`npx total-recall sync\` to pull instructions.`);
  }

  console.error(`
  ✅ Total Recall initialized!

  Your .agent/ directory is ready. Here is what was set up:
    .agent/memory-vault/    ← Your SSSS memory vault (Tier 3)
    .agent/skills/ssss/     ← SSSS schema reference skill (Tier 2)

  IDE instruction files have been updated with the Total Recall memory block.
  Existing content in GEMINI.md, .cursorrules, CLAUDE.md etc. was preserved.

  Next steps:
    1. Run \`npx total-recall compile\` any time to rebuild the memory surface.
    2. Add memory nodes under .agent/memory-vault/<category>/<slug>.md
       (Read .agent/skills/ssss/SKILL.md for the exact SSSS schema.)
    3. Run \`npx total-recall daemon start\` to enable the background Dream Cycle.
`);
}
