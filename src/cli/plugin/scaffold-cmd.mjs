#!/usr/bin/env node
/**
 * Scaffold CLI command handler
 * Handles:
 *   npx total-recall scaffold-plugin <id> [options]
 *   npx total-recall scaffold plugin <id> [options]
 *   npx total-recall scaffold repo <path> [options]
 */

import { createPlugin } from './create.mjs';

export async function run(argv = []) {
  let args = Array.isArray(argv) ? argv.slice(2) : [];
  if (args[0] === 'scaffold' || args[0] === 'scaffold-plugin') {
    args = args.slice(1);
  }
  if (args[0] === 'plugin') {
    args = args.slice(1);
  }

  await createPlugin(args);
}

export default async function (args = []) {
  let cleanArgs = Array.isArray(args) ? args : [];
  if (cleanArgs[0] === 'plugin') {
    cleanArgs = cleanArgs.slice(1);
  }
  await createPlugin(cleanArgs);
}
