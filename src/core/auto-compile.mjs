import path from 'node:path';
import { resolveAgentDir, resolveBrainDir } from '../cli/agent-dir.mjs';
import { compileSurface } from './surface.mjs';
import { invalidate } from './vault-cache.mjs';
import { compileRegisteredProjects } from '../cli/rebuild.mjs';

/**
 * Automatically recompile instruction surfaces and local indexes.
 * Used by all CLI commands that modify memory nodes, rules, plugins, or skills.
 *
 * @param {Object} options
 * @param {'global'|'project'|'auto'} [options.layer='auto']
 * @param {boolean} [options.semantic=false] - Whether to generate vector embeddings
 * @param {boolean} [options.force=true] - Force recompilation
 * @param {boolean} [options.silent=false] - Suppress console output
 * @returns {Promise<boolean>}
 */
export async function autoCompileSurfaces({ layer = 'auto', semantic = false, force = true, silent = false } = {}) {
  try {
    const resolvedAgentDir = resolveAgentDir(layer);
    const resolvedBrainDir = resolveBrainDir(layer);
    const skillsDir = path.join(resolvedAgentDir, 'skills');
    const vaultDir = path.join(resolvedBrainDir, 'memory-vault');
    const derivedDir = path.join(resolvedBrainDir, 'memory-derived');
    const instructionsFile = path.join(resolvedAgentDir, 'INSTRUCTIONS.md');

    invalidate(vaultDir);
    await compileSurface({ vaultDir, skillsDir, derivedDir, instructionsFile, semantic, force });

    if (layer === 'global') {
      await compileRegisteredProjects();
    }

    if (!silent) {
      console.log('  ✅ Instruction surfaces and local indexes automatically compiled.');
    }
    return true;
  } catch (err) {
    if (!silent) {
      console.error(`  ⚠️  Auto-compile failed: ${err.message}`);
    }
    return false;
  }
}
