import fs from 'fs';
import path from 'path';
import { compileSurface } from '../core/surface.mjs';
import { detectIndexDrift } from '../core/drift-detector.mjs';
import { resolveAgentDir, resolveBrainDir } from './agent-dir.mjs';
import { logger } from '../core/logger.mjs';

/**
 * SSSS Projection Rebuild Command
 *
 * Implements the rebuild operation required by §10 of the SSSS spec.
 * Discards derived indexes and rebuilds them deterministically from
 * the canonical vault state.
 */

export async function runRebuild(options = {}) {
  const agentDir = resolveAgentDir();
  const brainDir = resolveBrainDir();
  const vaultDir = path.join(brainDir, 'memory-vault');
  const skillsDir = path.join(agentDir, 'skills');
  const derivedDir = path.join(brainDir, 'memory-derived');
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
      console.log('⚠️ Drift detected between canonical vault and derived indexes:');
      if (drift.missing_in_index.length > 0) {
        console.log(`   - ${drift.missing_in_index.length} nodes missing in index`);
      }
      if (drift.stale_in_index.length > 0) {
        console.log(`   - ${drift.stale_in_index.length} nodes out of sync in index`);
      }
      if (drift.missing_in_vault.length > 0) {
        console.log(`   - ${drift.missing_in_vault.length} ghost records in index (deleted from vault)`);
      }
      console.log('\nRun `total-recall rebuild` (without --check) to repair.');
      return 1;
    }
  }

  // Perform full rebuild
  console.log('🗑️  Discarding existing derived indexes...');
  if (fs.existsSync(derivedDir)) {
    fs.rmSync(derivedDir, { recursive: true, force: true });
  }

  console.log('🏗️  Recompiling surface from canonical vault...');
  try {
    const stats = await compileSurface({ vaultDir, skillsDir, derivedDir, instructionsFile, force: true });
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
      console.error('❌ Post-build verification failed! Drift remains.');
      return 1;
    }
  } catch (err) {
    console.error(`❌ Rebuild failed: ${err.message}`);
    logger.error('rebuild', `Rebuild failed: ${err.message}`);
    return 1;
  }
}

export default async function cli(args) {
  const options = { check: args.includes('--check') };
  const code = await runRebuild(options);
  process.exit(code);
}
