/** Run one dream cycle per selected brain. Scheduling belongs to automations. */
import fs from 'node:fs';
import path from 'node:path';
import { resolveAgentDir, resolveBrainDir, resolveSurfaceDir, getGlobalBrainDir, getGlobalAgentDir } from './agent-dir.mjs';
import { listUpdateRoots } from '../core/package-auto-update.mjs';

export function parseDreamArgs(args) {
  const opts = { layer: 'global', allBrains: false, dryRun: false, json: false };
  let explicitLayer;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--all-brains') opts.allBrains = true;
    else if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--json') opts.json = true;
    else if (arg === '--help' || arg === '-h') opts.help = true;
    else if (arg === '--global' || arg === '--project') {
      if (explicitLayer && explicitLayer !== arg) throw new Error('Choose --global or --project.');
      explicitLayer = arg;
      opts.layer = arg.slice(2);
    } else if (arg === '--vault') {
      if (!args[i + 1] || args[i + 1].startsWith('-')) throw new Error('--vault requires a path.');
      opts.vault = path.resolve(args[++i]);
    } else throw new Error(`Unknown dream option: ${arg}`);
  }
  if (opts.allBrains && (opts.vault || explicitLayer)) throw new Error('--all-brains cannot be combined with --vault, --global or --project.');
  return opts;
}

function target(brainDir, agentDir, surfaceDir, root) {
  return { root, brainDir, vaultDir: path.join(brainDir, 'memory-vault'),
    derivedDir: path.join(brainDir, 'memory-derived'), skillsDir: path.join(agentDir, 'skills'),
    conflictsDir: path.join(brainDir, 'memory-inbox', 'conflicts'),
    instructionsFile: path.join(surfaceDir, 'INSTRUCTIONS.md') };
}

export function discoverDreamBrains({ brainDir = getGlobalBrainDir(), agentDir = getGlobalAgentDir(), roots } = {}) {
  const brains = [target(brainDir, agentDir, agentDir, agentDir)];
  const seen = new Set([fs.existsSync(brainDir) ? fs.realpathSync(brainDir) : path.resolve(brainDir)]);
  for (const { root } of listUpdateRoots({ brainDir, roots })) {
    // Fleet selection is explicit. AGENT_DIR must not redirect project brains.
    const projectAgent = ['.agent', '.agents'].map(name => path.join(root, name))
      .find(dir => fs.existsSync(path.join(dir, 'skills/total-recall/memory-vault'))
        || fs.existsSync(path.join(dir, 'skills/total-recall/SKILL.md')));
    if (!projectAgent) continue;
    const projectBrain = path.join(projectAgent, 'skills/total-recall');
    const real = fs.realpathSync(projectBrain);
    if (seen.has(real)) continue;
    seen.add(real);
    brains.push(target(projectBrain, projectAgent, root, root));
  }
  return brains;
}

async function previewDecay({ vaultDir, derivedDir }) {
  const [{ loadNodes }, { readAccess }, { decayCandidates }] = await Promise.all([
    import('../core/vault.mjs'), import('../core/access-ledger.mjs'), import('../core/optimizer.mjs'),
  ]);
  return decayCandidates(loadNodes(vaultDir), readAccess(derivedDir)).map(node => node.slug);
}

function printHelp() {
  console.log(`Usage: total-recall dream [--global | --project | --all-brains] [--vault <path>] [--dry-run] [--json]
  Dream consolidates memory and runs phase 4 decay.
  --all-brains  Run the global brain and registered project brains on this node, one at a time.
  --dry-run     List brains and decay candidates without changes or runtime calls.
  --json        Print an array of per-brain results.
  --help, -h    Show this help.`);
}

export default async function dream(args = [], dependencies = {}) {
  let opts;
  try { opts = parseDreamArgs(args); }
  catch (error) { console.error(error.message); process.exitCode = 2; return; }
  if (opts.help) { printHelp(); return; }
  const results = [];
  try {
    const brains = opts.allBrains ? (dependencies.discover || discoverDreamBrains)() : [
      target(resolveBrainDir(opts.layer), resolveAgentDir(opts.layer), resolveSurfaceDir(opts.layer), resolveSurfaceDir(opts.layer)),
    ];
    if (opts.vault) {
      brains[0].vaultDir = opts.vault;
      brains[0].brainDir = path.dirname(opts.vault);
      brains[0].derivedDir = path.join(brains[0].brainDir, 'memory-derived');
      brains[0].conflictsDir = path.join(brains[0].brainDir, 'memory-inbox', 'conflicts');
    }
    const run = opts.dryRun ? null : (dependencies.run || (await import('../core/dream.mjs')).runDreamCycle);
    for (const brain of brains) {
      let row;
      try {
        if (!fs.existsSync(brain.vaultDir)) throw new Error(`Vault not found: ${brain.vaultDir}`);
        const result = opts.dryRun
          ? { status: 'dry_run', decay_candidates: await (dependencies.preview || previewDecay)(brain) }
          : await run(brain);
        row = { ...brain, ...result };
      } catch (error) { row = { ...brain, status: 'failed', error: error.message }; }
      results.push(row);
      if (!opts.json) {
        console.log(`${row.brainDir}: ${row.status}${row.error ? ` — ${row.error}` : ''}`);
        if (row.decay_candidates) console.log(`  Decay candidates: ${row.decay_candidates.join(', ') || 'none'}`);
        for (const error of row.errors || []) console.error(`  ${error}`);
      }
    }
  } catch (error) { results.push({ status: 'failed', error: error.message }); }
  if (opts.json) console.log(JSON.stringify(results, null, 2));
  else if (results.length === 1 && results[0].error && !results[0].brainDir) console.error(results[0].error);
  if (results.some(row => !['success', 'dry_run'].includes(row.status))) process.exitCode = 1;
  return results;
}
