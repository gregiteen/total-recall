import fs from 'fs';
import path from 'path';
import { loadNodes, writeNode, atomicWrite, walkMd } from './vault.mjs';
import { detectConflicts, quarantineConflict } from './steering.mjs';
import { compileSurface } from './surface.mjs';
import { 
  generateMemoryCleanupProposals, 
  generateStaleKnowledgeRefreshProposals,
  evaluateProposalGate
} from './optimizer.mjs';

const DREAM_PROMOTION_THRESHOLD = 0.7;

/**
 * Phase 1: Light Sleep. Scan for modifications.
 */
export function scanModifiedVault(vaultDir, sinceHours = 24) {
  const cutoff = Date.now() - sinceHours * 60 * 60 * 1000;
  return walkMd(vaultDir).filter(fp => {
    try {
      return fs.statSync(fp).mtimeMs >= cutoff;
    } catch {
      return false;
    }
  });
}

/**
 * Phase 2: REM Sleep. Score nodes, check conflicts, promote/decay.
 */
export function evaluateCandidates(candidates, existingNodes, conflictsDir) {
  const promoted = [];
  const allConflicts = [];

  for (const candidate of candidates) {
    const conflicts = detectConflicts(candidate, existingNodes);

    if (conflicts.length > 0) {
      for (const c of conflicts) {
        quarantineConflict(c, conflictsDir);
      }
      allConflicts.push(...conflicts);
      continue;
    }

    const score = (candidate.evidence_count || 1) * 0.2 + (candidate.importance || 1) * 0.1;
    if (score >= DREAM_PROMOTION_THRESHOLD || candidate.confidence >= 0.8) {
      const node = {
        ...candidate,
        status: 'active',
        confidence: Math.min(1.0, (candidate.confidence || 0.5) + 0.1),
      };
      promoted.push(node);
      existingNodes.push(node);
    }
  }

  return { promoted, conflicted: allConflicts };
}

/**
 * Main Dream Cycle execution.
 */
export async function runDreamCycle({
  vaultDir, skillsDir, derivedDir, conflictsDir, instructionsFile
}) {
  console.log('\n🌙 PHASE 1 — Light Sleep (Scan)');
  const modified = scanModifiedVault(vaultDir);
  console.log(`   Modified vault files: ${modified.length}`);

  // In a real system, we'd extract candidates from sessions. For now, we simulate.
  const candidates = []; 

  console.log('\n💫 PHASE 2 — REM (Pattern Recognition)');
  const existingNodes = loadNodes(vaultDir);
  
  if (candidates.length > 0) {
    const { promoted, conflicted } = evaluateCandidates(candidates, existingNodes, conflictsDir);
    console.log(`   Promoted: ${promoted.length} | Conflicts: ${conflicted.length}`);
    for (const node of promoted) {
      writeNode(node, vaultDir);
    }
  } else {
    console.log('   No new candidates to evaluate.');
  }

  console.log('\n🌊 PHASE 3 — Deep Sleep (Recompile Surface)');
  try {
    await compileSurface({ vaultDir, skillsDir, derivedDir, instructionsFile });
    console.log('   ✅ Surface recompiled successfully');
  } catch (err) {
    console.error(`   ❌ Deep Sleep compile failed: ${err.message}`);
  }

  console.log('\n🧠 PHASE 4 — Lucid Dreaming (Optimizer Proposals)');
  try {
    const proposalsDir = path.join(vaultDir, 'proposals');
    if (!fs.existsSync(proposalsDir)) fs.mkdirSync(proposalsDir, { recursive: true });

    const cleanupProposals = await generateMemoryCleanupProposals(vaultDir);
    const staleProposals = await generateStaleKnowledgeRefreshProposals(vaultDir);
    const allProposals = [...cleanupProposals, ...staleProposals];
    
    if (allProposals.length > 0) {
      console.log(`   Generated ${allProposals.length} optimization proposals.`);
      for (const p of allProposals) {
        // Run Local Eval Gate
        const passed = await evaluateProposalGate(p, null);
        console.log(`   - Proposal [${p.category}]: ${p.summary} -> ${passed ? 'ACCEPTED' : 'REJECTED'}`);
        writeNode(p, proposalsDir);
      }
    } else {
      console.log('   No new proposals generated.');
    }
  } catch (err) {
    console.error(`   ❌ Optimizer failed: ${err.message}`);
  }

  return { status: 'success' };
}

// ─── Standalone Daemon Execution ────────────────────────────────────────────────

import { fileURLToPath } from 'url';
import os from 'os';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const AGENT_DIR = path.join(os.homedir(), '.agent');
  const vaultDir = path.join(AGENT_DIR, 'memory-vault');
  const skillsDir = path.join(AGENT_DIR, 'skills');
  const derivedDir = path.join(AGENT_DIR, 'memory-derived');
  const conflictsDir = path.join(AGENT_DIR, 'memory-inbox', 'conflicts');
  const instructionsFile = path.join(AGENT_DIR, 'INSTRUCTIONS.md');

  console.log('🤖 Total Recall Dream Cycle Daemon Started');

  async function daemonLoop() {
    while (true) {
      try {
        await runDreamCycle({
          vaultDir, skillsDir, derivedDir, conflictsDir, instructionsFile
        });
      } catch (err) {
        console.error('Dream cycle iteration failed:', err.message);
      }
      // Sleep for 60 seconds before next cycle
      await new Promise(resolve => setTimeout(resolve, 60000));
    }
  }

  daemonLoop();
}
