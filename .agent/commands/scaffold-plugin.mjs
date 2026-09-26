#!/usr/bin/env node
/**
 * Composable CLI Command: npx total-recall scaffold-plugin <id> [options]
 * 
 * Scaffolds a new Total Recall capability plugin with:
 * - Manifest (plugin.json) with SSSS schemas, deploy contract, and artifact groups
 * - Executable CLI entrypoint (cli.mjs)
 * - Evolving context generator (generator.mjs)
 * - Core skill definition (skills/<id>/SKILL.md)
 * - P2P sharing & documentation README.md
 */

let createPlugin;
try {
  const mod = await import('../../src/cli/plugin/create.mjs');
  createPlugin = mod.createPlugin;
} catch {
  const mod = await import('/home/gregiteen/total-recall/src/cli/plugin/create.mjs');
  createPlugin = mod.createPlugin;
}

export async function run(argv = []) {
  const args = Array.isArray(argv) ? argv.slice(3) : [];
  await createPlugin(args);
}

export default async function (args = []) {
  await createPlugin(args);
}
