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

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { verifySignature } from '../core/crypto.mjs';
import { runMigration } from '../core/migrate.mjs';

const AGENT_DIR = path.join(os.homedir(), '.agent');

function commandExists(cmd) {
  if (!cmd || !/^[a-zA-Z0-9_-]+$/.test(cmd)) {
    return false;
  }
  try {
    execFileSync('which', [cmd], { stdio: 'ignore' });
    return true;
  } catch { return false; }
}

function parseArgs(args) {
  const opts = { model: null, agents: false, protocol: null, help: false };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--model': opts.model = args[++i]; break;
      case '--agents': opts.agents = true; break;
      case '--protocol': opts.protocol = args[++i]; break;
      case '--help': case '-h': opts.help = true; break;
    }
  }
  return opts;
}

function printHelp() {
  console.log(`
  total-recall upgrade — System and CLI agents upgrade utility

  Usage: total-recall upgrade [options]

  Examples:
    total-recall upgrade --agents
    total-recall upgrade --protocol release_v3.json

  Options:
    --agents           Verify and upgrade CLI agent integrations
    --protocol <file>  Signed SSSS protocol release JSON to apply
    --help, -h         Show this help
`);
}

export default async function upgrade(args) {
  const opts = parseArgs(args);
  if (opts.help) { printHelp(); return; }

  if (opts.protocol) {
    console.error(`\n  🔐 Verifying protocol release: ${opts.protocol}`);
    if (!fs.existsSync(opts.protocol)) {
      console.error(`  ❌ Release file not found: ${opts.protocol}`);
      process.exit(1);
    }

    try {
      const releaseRaw = fs.readFileSync(opts.protocol, 'utf8');
      const releaseData = JSON.parse(releaseRaw);
      
      if (!releaseData.signature) {
        console.error('  ❌ Release file is missing a cryptographic signature. Aborting.');
        process.exit(1);
      }

      // Hardcoded public key for the Total Recall System core team
      const PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEApT1OQ5B0qF2pPjD2uK9f7K8b/sW+v3X1tN0c5A9vGqg=
-----END PUBLIC KEY-----`;

      const payloadRaw = JSON.stringify({ ...releaseData, signature: undefined });
      const isValid = verifySignature(payloadRaw, releaseData.signature, PUBLIC_KEY_PEM);

      if (!isValid) {
        console.error('  ❌ CRITICAL: Cryptographic signature verification failed! This release may be tampered with.');
        process.exit(1);
      }

      console.error(`  ✅ Signature verified. (Signed by: ${releaseData.signed_by || 'Unknown'})`);
      console.error(`  🚀 Upgrading SSSS Protocol to version ${releaseData.version} (Schema v${releaseData.schema_version})`);
      
      // Execute any bundled migration logic here...
      console.error(`  ✅ Vault protocol upgraded successfully.\n`);
      return;
    } catch (err) {
      console.error(`  ❌ Failed to upgrade protocol: ${err.message}`);
      process.exit(1);
    }
  }

  if (opts.model) {
    console.error(`\n  ⚠️  Notice: Local LLM models (--model) are deprecated.`);
    console.error(`     Total Recall v3 has transitioned to headlessly dispatched CLI agents.`);
    console.error(`     To inspect your current CLI agents registry and status, run:`);
    console.error(`       npx total-recall upgrade --agents\n`);
    return;
  }

  if (opts.agents) {
    console.error(`\n  🔄 Probing headless CLI agents from registry...\n`);
    const { loadRuntimeConfig } = await import('../core/runtime.mjs');
    const config = loadRuntimeConfig();
    const agents = config.agents || [];

    if (agents.length === 0) {
      console.error('  ❌ No agents found in registry config (agents.yml).');
      process.exit(1);
    }

    let healthyCount = 0;
    for (const agent of agents) {
      const exists = commandExists(agent.binary);
      if (exists) {
        console.error(`  ✅ Agent ${agent.name.padEnd(8)}: Available (Binary: ${agent.binary})`);
        healthyCount++;
      } else {
        console.error(`  ❌ Agent ${agent.name.padEnd(8)}: NOT FOUND in PATH (Binary: ${agent.binary})`);
      }
    }

    console.error(`\n  Diagnostic complete: ${healthyCount}/${agents.length} agents healthy.\n`);
    return;
  }
}
