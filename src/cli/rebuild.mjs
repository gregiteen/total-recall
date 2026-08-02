import fs from 'fs';
import path from 'path';
import { compileSurface } from '../core/surface.mjs';
import { detectIndexDrift } from '../core/drift-detector.mjs';
import { resolveAgentDir, resolveBrainDir, parseLayerFlag } from './agent-dir.mjs';
import { logger } from '../core/logger.mjs';

/**
 * SSSS Projection Rebuild Command
 *
 * Implements the rebuild operation required by §10 of the SSSS spec.
 * Discards derived indexes and rebuilds them deterministically from
 * the canonical vault state.
 */

export async function runRebuild(options = {}) {
  const layer = options.layer || 'auto';
  const agentDir = resolveAgentDir(layer);
  const brainDir = resolveBrainDir(layer);
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
  // Discard the cheap, fully-derivable indexes — but NOT embeddings.db.
  //
  // `fs.rmSync(derivedDir)` used to take the whole directory, which threw away
  // every vector. Embeddings are not free to re-derive: each one is a provider
  // call. Worse, the rebuild that followed was fire-and-forget, so the process
  // exited before replacing them and the index stayed empty — that is how this
  // brain ended up with 520 nodes and 0 embeddings while reporting success.
  //
  // The index is content-hash incremental and prunes slugs no longer in the
  // vault, so keeping it across a rebuild is correct as well as cheap.
  console.log('🗑️  Discarding existing derived indexes...');
  if (fs.existsSync(derivedDir)) {
    for (const entry of fs.readdirSync(derivedDir)) {
      if (entry.startsWith('embeddings.db')) continue; // also skips -wal / -shm
      fs.rmSync(path.join(derivedDir, entry), { recursive: true, force: true });
    }
  }

  console.log('🏗️  Recompiling surface from canonical vault...');
  try {
    const stats = await compileSurface({ vaultDir, skillsDir, derivedDir, instructionsFile, force: true });
    console.log(`✅ Processed ${stats.nodesProcessed} canonical memory nodes.`);
    console.log(`✅ Injected memory into ${stats.skillsInjected} skill files.`);
    console.log(`✅ Rebuilt graph-index.jsonl, memory-layers.jsonl, and skill-routes.jsonl.`);

    // Report vector coverage explicitly. "Post-build verification passed: 0 drift"
    // checks the jsonl indexes only — it passed happily on a brain with 520 nodes
    // and 0 embeddings, i.e. keyword-only recall that returns plausible-looking
    // results from the wrong places.
    if (stats.semanticUnavailable) {
      console.log(`⚠️  Vector search is OFF — embeddings unavailable${stats.semanticError ? `: ${stats.semanticError}` : ''}.`);
      console.log(`   Recall will fall back to keyword matching.`);
    } else {
      console.log(`✅ Embeddings: ${stats.semanticIndexed} built, ${stats.semanticSkipped} unchanged${stats.semanticFailed ? `, ${stats.semanticFailed} FAILED` : ''}.`);
    }


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
  const { layer, remainingArgs } = parseLayerFlag(args);
  const options = {
    check: remainingArgs.includes('--check'),
    layer,
  };
  const code = await runRebuild(options);
  process.exit(code);
}
