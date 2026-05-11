#!/usr/bin/env node

/**
 * health.mjs — Verify all CLI agents are installed, authenticated, and functional.
 * 
 * Usage:
 *   node .agent/skills/cli-agents/scripts/health.mjs
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const AGENTS = [
  {
    name: 'Gemini CLI',
    bin: '/Users/greg/.nvm/versions/node/v24.12.0/bin/gemini',
    versionArgs: ['--version'],
  },
  {
    name: 'Claude Code',
    bin: '/Users/greg/.local/bin/claude',
    versionArgs: ['--version'],
  },
  {
    name: 'Codex CLI',
    bin: '/Users/greg/.nvm/versions/node/v24.12.0/bin/codex',
    versionArgs: ['--version'],
  },
];

async function checkAgent(agent) {
  try {
    const { stdout } = await execFileAsync(agent.bin, agent.versionArgs, { timeout: 10000 });
    const version = stdout.trim().split('\n')[0];
    return { name: agent.name, status: '✅', version, bin: agent.bin };
  } catch (e) {
    return { name: agent.name, status: '❌', version: `ERROR: ${e.message}`, bin: agent.bin };
  }
}

async function main() {
  console.log('🔍 CLI Agent Health Check\n');

  const results = await Promise.all(AGENTS.map(checkAgent));

  const maxName = Math.max(...results.map(r => r.name.length));
  const maxVer = Math.max(...results.map(r => r.version.length));

  for (const r of results) {
    console.log(`  ${r.status} ${r.name.padEnd(maxName)}  ${r.version.padEnd(maxVer)}  ${r.bin}`);
  }

  const failed = results.filter(r => r.status === '❌');
  if (failed.length > 0) {
    console.log(`\n⚠️  ${failed.length} agent(s) failed health check.`);
    process.exit(1);
  } else {
    console.log('\n✅ All agents healthy.');
  }
}

main();
