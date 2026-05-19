import fs from 'fs';
import path from 'path';
import { compileSurface } from '../core/surface.mjs';
import { detectIndexDrift } from '../core/drift-detector.mjs';
import { resolveAgentDir } from './agent-dir.mjs';
import { logger } from '../core/logger.mjs';
import { TRError, emitError } from '../errors.mjs';

/**
 * SSSS Projection Rebuild Command
 *
 * Implements the rebuild operation required by §10 of the SSSS spec.
 * Discards derived indexes and rebuilds them deterministically from
 * the canonical vault state.
 */

export async function runRebuild(options = {}) {
  const agentDir = resolveAgentDir();
  const vaultDir = path.join(agentDir, 'memory-vault');
  const skillsDir = path.join(agentDir, 'skills');
  const derivedDir = path.join(agentDir, 'memory-derived');
  const instructionsFile = path.join(agentDir, 'INSTRUCTIONS.md');

  console.log('🔄 SSSS Projection Rebuild');
  console.log('==========================');
  console.log(`Vault:    ${vaultDir}`);
  console.log(`Derived:  ${derivedDir}`);
  console.log('--------------------------');

  if (options.check) {
    console.log('Detecting drift...');
    const drift = detectIndexDrift(vaultDir, derivedDir);
    if (!drift.drifted) {
      console.log('✅ Indexes are fully synchronized. No drift detected.');
      return 0;
    } else {
      throw new TRError('DRIFT_DETECTED', 'Index drift detected between canonical vault and derived indexes.', {
        missing_in_index: drift.missing_in_index.length,
        stale_in_index:   drift.stale_in_index.length,
        ghost_in_index:   drift.missing_in_vault.length,
      });
    }
  }

  // Perform full rebuild
  console.log('🗑️  Discarding existing derived indexes...');
  if (fs.existsSync(derivedDir)) {
    fs.rmSync(derivedDir, { recursive: true, force: true });
  }

  console.log('🏗️  Recompiling surface from canonical vault...');
  try {
    const stats = await compileSurface({ vaultDir, skillsDir, derivedDir, instructionsFile });
    console.log(`✅ Processed ${stats.nodesProcessed} canonical memory nodes.`);
    console.log(`✅ Injected memory into ${stats.skillsInjected} skill files.`);
    console.log(`✅ Rebuilt graph-index.jsonl, memory-layers.jsonl, and skill-routes.jsonl.`);
    
    // Verify
    const drift = detectIndexDrift(vaultDir, derivedDir);
    if (!drift.drifted) {
      console.log('✅ Post-build verification passed: 0 drift.');
      logger.info('rebuild', `Rebuild completed successfully. Processed ${stats.nodesProcessed} nodes.`);
      return 0;
    } else {
      throw new TRError('DRIFT_PERSIST', 'Post-rebuild verification failed: drift remains after recompile.', {
        missing_in_index: drift.missing_in_index.length,
        stale_in_index:   drift.stale_in_index.length,
        ghost_in_index:   drift.missing_in_vault.length,
      });
    }
  } catch (err) {
    if (err instanceof TRError) throw err;
    logger.error('rebuild', `Rebuild failed: ${err.message}`);
    throw new TRError('REBUILD_FAIL', `Rebuild failed: ${err.message}`, { vaultDir }, err);
  }
}

export default async function cli(args) {
  const options = { check: args.includes('--check') };
  try {
    const code = await runRebuild(options);
    process.exit(code);
  } catch (err) {
    emitError(err);
  }
}
