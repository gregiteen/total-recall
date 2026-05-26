import fs from 'node:fs';
import path from 'node:path';
import { resolveAgentDir, resolveBrainDir, parseLayerFlag, getBothBrains } from './agent-dir.mjs';
import { compileSurface } from '../core/surface.mjs';
import { deleteNode, loadNodes } from '../core/vault.mjs';

function printHelp() {
  console.log(`
  total-recall forget — Delete a memory node by slug

  Usage: total-recall forget <slug> [options]

  Options:
    --global              Delete from the global brain
    --project             Delete from the project brain
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
      const projNodes = loadNodes(projVaultDir);
      if (projNodes.some(n => n.slug === slug)) {
        layer = 'project';
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

  console.log(`  ✅ Deleted memory node "${slug}" from ${layerLabel} vault.`);

  // Recompile unless --no-compile
  if (!noCompile) {
    console.log('  ⏳ Recompiling active memory surfaces and indexes...');
    try {
      const brains = getBothBrains();
      const globalVaultDir = brains.global ? path.join(brains.global.brainDir, 'memory-vault') : undefined;
      const compileResult = await compileSurface({
        vaultDir,
        skillsDir,
        derivedDir,
        instructionsFile,
        globalVaultDir: layer === 'project' ? globalVaultDir : undefined
      });
      console.log(`  ✅ Recompilation successful! Processed ${compileResult.nodesProcessed} SSSS nodes.`);

      // Propagate to project brains when deleting from global
      if (layer === 'global' && brains.global) {
        const registryPath = path.join(brains.global.brainDir, 'config', 'project-registry.json');
        if (fs.existsSync(registryPath)) {
          try {
            const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
            const globalVault = path.join(brains.global.brainDir, 'memory-vault');
            let recompiled = 0;
            for (const project of registry) {
              if (!project.brainDir || !fs.existsSync(project.brainDir)) continue;
              const projVaultDir = path.join(project.brainDir, 'memory-vault');
              const projDerivedDir = path.join(project.brainDir, 'memory-derived');
              const projAgentDir = path.dirname(path.dirname(project.brainDir));
              const projSkillsDir = path.join(projAgentDir, 'skills');
              const projInstructionsFile = path.join(projAgentDir, 'INSTRUCTIONS.md');
              const projRoot = path.dirname(projAgentDir);
              const projInstructions = path.join(projRoot, '.agent', 'INSTRUCTIONS.md');
              try {
                await compileSurface({
                  vaultDir: projVaultDir,
                  skillsDir: projSkillsDir,
                  derivedDir: projDerivedDir,
                  instructionsFile: fs.existsSync(projInstructions) ? projInstructions : projInstructionsFile,
                  globalVaultDir: globalVault
                });
                recompiled++;
              } catch (e) {
                // Non-fatal: skip projects that fail to recompile
              }
            }
            if (recompiled > 0) {
              console.log(`  ✅ Propagated to ${recompiled} registered project brain${recompiled === 1 ? '' : 's'}.`);
            }
          } catch { /* ignore registry parse errors */ }
        }
      }
    } catch (err) {
      console.warn(`  ⚠️  Node deleted, but surface recompilation failed: ${err.message}`);
    }
  }
}
