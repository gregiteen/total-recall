#!/usr/bin/env node
/**
 * Scaffold CLI command handler
 * Handles:
 *   npx total-recall scaffold-plugin <id> [options]
 *   npx total-recall scaffold plugin <id> [options]
 *   npx total-recall scaffold repo <path> [options]
 */

import { createPlugin } from './create.mjs';
import { runCodexPackage } from './codex-package.mjs';

function printHelp() {
  console.log(`Usage:
  total-recall scaffold-plugin <id> [--name <name>] [--description <description>] [--with-cli] [--no-install]
  total-recall scaffold plugin <id> [options]
  total-recall scaffold codex-plugin --help

Use total-recall plugin --help for the full plugin creation options.`);
}

async function scaffold(args) {
  if (args[0] === 'plugin') args = args.slice(1);
  if (args[0] === 'codex-plugin') return runCodexPackage(args.slice(1));
  if (!args.length || args.includes('--help') || args.includes('-h') || args[0] === 'help') {
    printHelp();
    return;
  }
  return createPlugin(args);
}

export async function run(argv = []) {
  let args = Array.isArray(argv) ? argv.slice(2) : [];
  if (args[0] === 'scaffold' || args[0] === 'scaffold-plugin') {
    args = args.slice(1);
  }
  return scaffold(args);
}

export default async function (args = []) {
  return scaffold(Array.isArray(args) ? args : []);
}
