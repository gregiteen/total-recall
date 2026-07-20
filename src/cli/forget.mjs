import fs from 'node:fs';
import path from 'node:path';
import { resolveAgentDir, resolveBrainDir, parseLayerFlag, getBothBrains } from './agent-dir.mjs';
import { compileSurface } from '../core/surface.mjs';
import { deleteNode } from '../core/vault.mjs';
import { invalidate } from '../core/vault-cache.mjs';

function printHelp() {
  console.log(`
  total-recall forget — Delete a memory node by slug

  Usage: total-recall forget <slug> [options]

    Options:
    --global              Delete from the global brain
    --project             Delete from the project brain
    --project-all <name>  Soft-delete all nodes for an abandoned project by moving them to .trash
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
    
    const trashDir = path.join(globalVaultDir, '.trash', projectName);
    fs.mkdirSync(trashDir, { recursive: true });
    
    let count = 0;
    // We need to move the actual file. We have node.slug and node.category.
    for (const n of nodes) {
      const sourcePath = path.join(globalVaultDir, n.category, `${n.slug}.md`);
      if (fs.existsSync(sourcePath)) {
        const destPath = path.join(trashDir, `${n.slug}.md`);
        fs.renameSync(sourcePath, destPath);
        count++;
      }
    }
    
    console.log(`  ✅ Soft-deleted ${count} nodes for project "${projectName}" (moved to .trash/)`);

    // Files moved under .trash still invalidate the vault cache (watcher may lag)
    invalidate(globalVaultDir);
    
    if (!remainingArgs.includes('--no-compile')) {
      console.log('  ⏳ Recompiling active memory surfaces and indexes in the background...');
      try {
        const { spawn } = await import('node:child_process');
        // Soft-delete from global vault tags — recompile global surfaces
        const child = spawn(process.argv[0], [process.argv[1], 'compile', '--global'], {
          detached: true,
          stdio: 'ignore'
        });
        child.unref();
        console.log('  ✅ Background compilation started.');
      } catch (err) {}
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
  const deleted = deleteNode(slug, vaultDir);

  if (!deleted) {
    console.error(`  ❌ Node "${slug}" not found in ${layerLabel} vault at ${vaultDir}`);
    process.exit(1);
  }

  // Drop cached nodes immediately (fs.watch may lag or miss same-process deletes)
  invalidate(vaultDir);

  console.log(`  ✅ Deleted memory node "${slug}" from ${layerLabel} vault.`);

  // Recompile unless --no-compile
  if (!noCompile) {
    console.log('  ⏳ Recompiling active memory surfaces and indexes in the background...');
    try {
      const { spawn } = await import('node:child_process');
      // Pass layer so project forget recompiles the project brain, not auto/wrong vault
      const compileArgs = [process.argv[1], 'compile'];
      if (layer === 'project') compileArgs.push('--project');
      else if (layer === 'global') compileArgs.push('--global');
      const child = spawn(process.argv[0], compileArgs, {
        detached: true,
        stdio: 'ignore'
      });
      child.unref();
      console.log('  ✅ Background compilation started.');
    } catch (err) {
      console.warn(`  ⚠️  Node deleted, but background recompilation spawn failed: ${err.message}`);
    }
  }
}
