import fs from 'node:fs';
import path from 'node:path';
import { resolveAgentDir, resolveBrainDir, parseLayerFlag, getBothBrains } from './agent-dir.mjs';
import { compileSurface } from '../core/surface.mjs';
import { isSafeVaultName } from '../core/vault.mjs';
import { getNodes } from '../core/vault-cache.mjs';
import { deleteVfsDocument } from '../core/ssss-operation-service.mjs';
import { writeNodeValidatedAsync } from '../core/validated-write.mjs';
import { invalidate } from '../core/vault-cache.mjs';

function printHelp() {
  console.log(`
  total-recall forget — Delete a memory node by slug

  Usage: total-recall forget <slug> [options]

    Options:
    --global              Delete from the global brain
    --project             Delete from the project brain
    --project-all <name>  Archive nodes for a project through validated memory operations
    --no-compile          Skip auto-recompilation after deletion
    --help, -h            Show this help

  If neither --global nor --project is specified, the node is searched in the
  project brain first (if one exists), then falls back to global.

  Examples:
    npx total-recall forget test-propagation-delete-me
    npx total-recall forget old-invariant --global
    npx total-recall forget stale-fact --project
    npx total-recall forget my-node --no-compile
`);
}

export default async function forget(args) {
  const { layer: explicitLayer, remainingArgs } = parseLayerFlag(args);

  // Check for --project-all
  const projectAllIdx = remainingArgs.indexOf('--project-all');
  if (projectAllIdx !== -1 && remainingArgs[projectAllIdx + 1]) {
    const projectName = remainingArgs[projectAllIdx + 1];
    const { getGlobalBrainDir } = await import('./agent-dir.mjs');
    const { getNodes } = await import('../core/vault-cache.mjs');
    const globalVaultDir = path.join(getGlobalBrainDir(), 'memory-vault');
    
    if (!fs.existsSync(globalVaultDir)) {
      console.error('  ❌ Global vault not found.');
      return;
    }
    
    const nodes = getNodes(globalVaultDir).filter(n => n.project === projectName);
    if (nodes.length === 0) {
      console.error(`  ❌ No memory nodes found for project "${projectName}".`);
      return;
    }
    
    let count = 0;
    for (const node of nodes) {
      const result = await writeNodeValidatedAsync({ ...node, status: 'archived', updated: new Date().toISOString() }, globalVaultDir,
        { path: path.relative(globalVaultDir, node._filePath).split(path.sep).join('/') });
      if (!result.success) throw new Error(`Archiving ${node.slug} failed: ${result.validation?.errors?.join('; ') || result.error}`);
      count++;
    }
    console.log(`  ✅ Archived ${count} nodes for project "${projectName}"; canonical records preserved.`);
    if (!remainingArgs.includes('--no-compile')) {
      const brainDir = path.dirname(globalVaultDir);
      const agentDir = path.dirname(path.dirname(brainDir));
      await compileSurface({ vaultDir: globalVaultDir, skillsDir: path.join(agentDir, 'skills'),
        derivedDir: path.join(brainDir, 'memory-derived'), instructionsFile: path.join(agentDir, 'INSTRUCTIONS.md'), semantic: false });
    }
    return;
  }


  const slug = remainingArgs[0];
  const noCompile = remainingArgs.includes('--no-compile');

  if (!slug || slug === '--help' || slug === '-h') {
    printHelp();
    return;
  }

  let layer = explicitLayer;

  // Auto-detect which layer contains the node
  if (layer === 'auto') {
    const brains = getBothBrains();
    // Check project first, then global
    if (brains.project) {
      const projVaultDir = path.join(brains.project.brainDir, 'memory-vault');
      // Direct category scan instead of full vault load
      if (fs.existsSync(projVaultDir)) {
        const cats = fs.readdirSync(projVaultDir, { withFileTypes: true });
        for (const cat of cats) {
          if (cat.isDirectory() && fs.existsSync(path.join(projVaultDir, cat.name, `${slug}.md`))) {
            layer = 'project';
            break;
          }
        }
      }
    }
    if (layer === 'auto') {
      layer = 'global';
    }
  }

  const resolvedBrainDir = resolveBrainDir(layer);
  const resolvedAgentDir = resolveAgentDir(layer);
  const vaultDir = path.join(resolvedBrainDir, 'memory-vault');
  const derivedDir = path.join(resolvedBrainDir, 'memory-derived');
  const skillsDir = path.join(resolvedAgentDir, 'skills');
  const instructionsFile = path.join(resolvedAgentDir, 'INSTRUCTIONS.md');
  const layerLabel = layer === 'project' ? '[project]' : '[global]';

  // Attempt deletion
  const node = isSafeVaultName(slug) ? getNodes(vaultDir).find(n => n.slug === slug) : null;

  if (!node) {
    console.error(`  ❌ Node "${slug}" not found in ${layerLabel} vault at ${vaultDir}`);
    process.exit(1);
  }

  await deleteVfsDocument(path.relative(vaultDir, node._filePath).split(path.sep).join('/'), {
    vaultRoot: vaultDir, actorRole: 'system', intent: `Forget memory ${slug}`,
  });

  // Drop cached nodes immediately (fs.watch may lag or miss same-process deletes)
  invalidate(vaultDir);

  console.log(`  ✅ Deleted memory node "${slug}" from ${layerLabel} vault.`);

  // Recompile unless --no-compile
  if (!noCompile) {
    try {
      await compileSurface({ vaultDir, skillsDir, derivedDir, instructionsFile, semantic: false });
      console.log('  ✅ Local memory indexes and instruction surfaces updated.');
    } catch (err) {
      console.error(`  ❌ Memory deleted, but local compilation failed: ${err.message}`);
      process.exitCode = 1;
    }
  }
}
