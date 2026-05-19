/**
 * total-recall dream
 *
 * Manually trigger a single dream cycle (Light → REM → Deep Sleep).
 *
 * Usage:
 *   npx total-recall dream [options]
 *
 * Options:
 *   --vault <path>     Override vault directory (default: ~/.agent/memory-vault)
 *   --help             Show this help
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveAgentDir } from './agent-dir.mjs';
import { TRError, emitError } from '../errors.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AGENT_DIR = resolveAgentDir();

function parseArgs(args) {
  const opts = { vault: null, help: false };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--vault': opts.vault = args[++i]; break;
      case '--help': case '-h': opts.help = true; break;
    }
  }
  return opts;
}

function printHelp() {
  console.log(`
  total-recall dream — Manually trigger a dream cycle

  The dream cycle runs three phases:
    1. Light Sleep — Scan vault for recent modifications
    2. REM         — Score, conflict-check, and promote/decay candidates
    3. Deep Sleep  — Recompile the surface (indexes + INSTRUCTIONS.md)

  Usage: total-recall dream [options]

  Options:
    --vault <path>     Override vault directory (default: ~/.agent/memory-vault)
    --help, -h         Show this help
`);
}

export default async function dream(args) {
  const opts = parseArgs(args);
  if (opts.help) { printHelp(); return; }

  const vaultDir = opts.vault || path.join(AGENT_DIR, 'memory-vault');
  const skillsDir = path.join(AGENT_DIR, 'skills');
  const derivedDir = path.join(AGENT_DIR, 'memory-derived');
  const conflictsDir = path.join(AGENT_DIR, 'memory-inbox', 'conflicts');
  const instructionsFile = path.join(AGENT_DIR, 'INSTRUCTIONS.md');

  console.error('\n  🌙 Starting dream cycle...\n');
  const startTime = Date.now();

  try {
    const { runDreamCycle } = await import('../core/dream.mjs');
    const result = await runDreamCycle({
      vaultDir,
      skillsDir,
      derivedDir,
      conflictsDir,
      instructionsFile,
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`\n  ✅ Dream cycle complete (${elapsed}s) — status: ${result.status}`);
  } catch (err) {
    if (err instanceof TRError) {
      emitError(err);
    }
    emitError(new TRError(
      'COMPILE_FAIL',
      `Dream cycle failed: ${err.message}`,
      { vaultDir },
      err,
    ));
  }
}
