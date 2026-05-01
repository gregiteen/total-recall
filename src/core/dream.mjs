/**
 * dream.mjs — Dream Daemon (Total Recall Layer 6)
 *
 * Background consolidation cycle dispatched at /start.
 * Performs NREM (consolidation) and REM (cross-referencing)
 * sweeps over daily logs and wiki nodes.
 *
 * Stub — will be fully implemented in the standalone repo (Phase 6).
 */

import fs from 'fs';
import path from 'path';
import { parseFrontmatter, walkMarkdown } from './utils.mjs';

// Confidence decay thresholds (days)
const DECAY_THRESHOLDS = {
  preference:      { highToMedium: 90,  mediumToLow: 180 },
  'anti-pattern':  { highToMedium: 60,  mediumToLow: 120 },
  pattern:         { highToMedium: 30,  mediumToLow: 90  },
  concept:         { highToMedium: 30,  mediumToLow: 90  },
  decision:        { highToMedium: 45,  mediumToLow: 120 },
  project:         { highToMedium: 14,  mediumToLow: 45  },
};

/**
 * Run confidence decay on all wiki nodes.
 *
 * @param {string} wikiDir - Path to wiki directory
 * @param {Object} [options]
 * @param {boolean} [options.dryRun] - Show changes without writing
 * @returns {Object} { decayed: number, details: Array }
 */
export function runConfidenceDecay(wikiDir, { dryRun = false } = {}) {
  const files = walkMarkdown(wikiDir);
  const today = new Date();
  const details = [];

  for (const fp of files) {
    const content = fs.readFileSync(fp, 'utf-8');
    const { meta } = parseFrontmatter(content);

    if (!meta.type || !meta.last_verified || !meta.confidence) continue;

    const thresholds = DECAY_THRESHOLDS[meta.type];
    if (!thresholds) continue;

    const lastVerified = new Date(meta.last_verified);
    const daysSince = Math.floor((today - lastVerified) / 86400000);
    const currentConfidence = meta.confidence;
    let newConfidence = currentConfidence;

    if (currentConfidence === 'high' && daysSince > thresholds.highToMedium) {
      newConfidence = 'medium';
    } else if (currentConfidence === 'medium' && daysSince > thresholds.mediumToLow) {
      newConfidence = 'low';
    }

    if (newConfidence !== currentConfidence) {
      details.push({
        slug: path.basename(fp, '.md'),
        from: currentConfidence,
        to: newConfidence,
        daysSince,
        type: meta.type,
      });

      if (!dryRun) {
        const updated = content.replace(
          `confidence: ${currentConfidence}`,
          `confidence: ${newConfidence}`
        );
        fs.writeFileSync(fp, updated);
      }
    }
  }

  return { decayed: details.length, details };
}

/**
 * Run the full dream cycle (NREM + REM).
 * Stub — full implementation in Phase 6.
 *
 * @param {Object} options
 * @param {string} options.wikiDir
 * @param {string} options.dailyLogsDir
 * @param {boolean} [options.dryRun]
 * @returns {Object}
 */
export function dream({ wikiDir, dailyLogsDir, dryRun = false }) {
  const decayResult = runConfidenceDecay(wikiDir, { dryRun });

  // TODO Phase 6: NREM consolidation (daily logs → wiki nodes)
  // TODO Phase 6: REM cross-referencing (merge duplicates, detect patterns)
  // TODO Phase 6: Prune zero-access, low-confidence nodes past threshold

  return {
    timestamp: new Date().toISOString(),
    confidenceDecay: decayResult,
    nrem: { consolidated: 0 },  // Stub
    rem: { connections: 0 },     // Stub
  };
}
