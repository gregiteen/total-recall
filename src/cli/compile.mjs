/**
 * total-recall compile
 *
 * Rebuild all derived indexes and INSTRUCTIONS.md from the memory vault.
 * Calls surface.mjs to perform BM25+TF-IDF routing and Tier 1 compilation.
 *
 * Usage:
 *   npx total-recall compile [options]
 *
 * Options:
 *   --vault <path>     Override vault directory (default: ~/.agent/memory-vault)
 *   --quiet            Suppress detailed output
 *   --help             Show this help
 */

import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AGENT_DIR = path.join(os.homedir(), '.agent');

function parseArgs(args) {
  const opts = { vault: null, skills: null, derived: null, instructions: null, quiet: false, help: false };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--vault': opts.vault = args[++i]; break;
      case '--skills': opts.skills = args[++i]; break;
      case '--derived': opts.derived = args[++i]; break;
      case '--instructions': opts.instructions = args[++i]; break;
      case '--quiet': case '-q': opts.quiet = true; break;
      case '--help': case '-h': opts.help = true; break;
    }
  }
  return opts;
}

function printHelp() {
  console.log(`
  total-recall compile — Rebuild indexes + INSTRUCTIONS.md from the memory vault

  Usage: total-recall compile [options]

  Options:
    --vault <path>         Override vault directory (default: ~/.agent/memory-vault)
    --skills <path>        Override skills directory (default: ~/.agent/skills)
    --derived <path>       Override derived directory (default: ~/.agent/memory-derived)
    --instructions <path>  Override instructions file (default: ~/.agent/INSTRUCTIONS.md)
    --quiet, -q            Suppress detailed output
    --help, -h             Show this help
`);
}

export default async function compile(args) {
  const opts = parseArgs(args);
  if (opts.help) { printHelp(); return; }

  const vaultDir = opts.vault || path.join(AGENT_DIR, 'memory-vault');
  const skillsDir = opts.skills || path.join(AGENT_DIR, 'skills');
  const derivedDir = opts.derived || path.join(AGENT_DIR, 'memory-derived');
  const instructionsFile = opts.instructions || path.join(AGENT_DIR, 'INSTRUCTIONS.md');

  if (!opts.quiet) {
    console.error('\n  🔄 Compiling surface...');
    console.error(`     Vault:        ${vaultDir}`);
    console.error(`     Skills:       ${skillsDir}`);
    console.error(`     Derived:      ${derivedDir}`);
    console.error(`     Instructions: ${instructionsFile}`);
  }

  const startTime = Date.now();

  try {
    const { compileSurface } = await import('../core/surface.mjs');
    const result = await compileSurface({ vaultDir, skillsDir, derivedDir, instructionsFile });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    if (!opts.quiet) {
      console.error(`\n  ✅ Compile complete (${elapsed}s)`);
      console.error(`     Nodes processed:  ${result.nodesProcessed}`);
      console.error(`     Skills injected:  ${result.skillsInjected}`);
    }
  } catch (err) {
    console.error(`\n  ❌ Compile failed: ${err.message}`);
    if (!opts.quiet) console.error(err.stack);
    process.exit(1);
  }
}
