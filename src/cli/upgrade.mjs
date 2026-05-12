/**
 * total-recall upgrade
 *
 * Swap the kernel model used by Ollama.
 *
 * Usage:
 *   npx total-recall upgrade --model <name>
 *
 * Options:
 *   --model <name>     Ollama model tag to pull (e.g., gemma2:27b)
 *   --help             Show this help
 */

import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const AGENT_DIR = path.join(os.homedir(), '.agent');

function commandExists(cmd) {
  try { execSync(`command -v ${cmd}`, { stdio: 'ignore' }); return true; } catch { return false; }
}

function parseArgs(args) {
  const opts = { model: null, help: false };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--model': opts.model = args[++i]; break;
      case '--help': case '-h': opts.help = true; break;
    }
  }
  return opts;
}

function printHelp() {
  console.log(`
  total-recall upgrade — Swap the kernel model

  Usage: total-recall upgrade --model <name>

  Examples:
    total-recall upgrade --model gemma2:27b
    total-recall upgrade --model gemma5:32b-q4_k_m

  This command:
    1. Pulls the specified model via Ollama
    2. Updates ~/.agent/config/frontier.yml with the new model name

  Options:
    --model <name>     Ollama model tag (required)
    --help, -h         Show this help
`);
}

export default async function upgrade(args) {
  const opts = parseArgs(args);
  if (opts.help) { printHelp(); return; }

  if (!opts.model) {
    console.error('  ❌ --model <name> is required');
    printHelp();
    process.exit(1);
  }

  if (!commandExists('ollama')) {
    console.error('  ❌ Ollama not found. Install it first: curl -fsSL https://ollama.com/install.sh | sh');
    process.exit(1);
  }

  console.error(`\n  🔄 Upgrading kernel model to: ${opts.model}`);
  console.error('  Pulling model (this may take a while)...\n');

  const result = spawnSync('ollama', ['pull', opts.model], { stdio: 'inherit', timeout: 3600_000 });
  if (result.status !== 0) {
    console.error(`  ❌ Failed to pull model: ${opts.model}`);
    process.exit(1);
  }

  // Update frontier.yml
  const configPath = path.join(AGENT_DIR, 'config', 'frontier.yml');
  if (fs.existsSync(configPath)) {
    let config = fs.readFileSync(configPath, 'utf8');
    config = config.replace(/model:\s*.+/m, `model: ${opts.model}`);
    fs.writeFileSync(configPath, config, 'utf8');
    console.error(`  ✅ Updated ${configPath}`);
  }

  console.error(`  ✅ Model upgraded to ${opts.model}\n`);
}
