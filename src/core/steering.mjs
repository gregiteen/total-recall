/**
 * steering.mjs — Immediate Behavioral Steering Cascade (Total Recall)
 *
 * Real-time behavior modification without waiting for session end.
 * Performs an atomic 4-way write:
 *   1. Appends to user preferences file (permanent record)
 *   2. Creates/updates wiki node (knowledge graph)
 *   3. Hot-patches behavioral surface in system prompt (immediate effect)
 *   4. Updates FTS5 index
 */

import fs from 'fs';
import path from 'path';
import { slugify } from './utils.mjs';
import { createNode } from './wiki.mjs';

// ─── TYPE CONFIGURATION ─────────────────────────────────────────────────────────

const TYPE_CONFIG = {
  never: {
    wikiType: 'anti-pattern',
    sentiment: 'negative',
    defaultIntensity: 8,
    alertType: 'CAUTION',
    prefix: 'NEVER',
    surfaceFormat: (d) => `> [!CAUTION]\n> **NEVER**: ${d}`,
  },
  always: {
    wikiType: 'pattern',
    sentiment: 'positive',
    defaultIntensity: 7,
    alertType: 'TIP',
    prefix: 'ALWAYS',
    surfaceFormat: (d) => `> [!TIP]\n> **ALWAYS**: ${d}`,
  },
  correct: {
    wikiType: 'concept',
    sentiment: 'corrective',
    defaultIntensity: 6,
    alertType: 'IMPORTANT',
    prefix: 'CORRECTION',
    surfaceFormat: (d) => `> [!IMPORTANT]\n> **CORRECTION**: ${d}`,
  },
  prefer: {
    wikiType: 'preference',
    sentiment: 'positive',
    defaultIntensity: 5,
    alertType: 'TIP',
    prefix: 'PREFER',
    surfaceFormat: (d) => `> [!TIP]\n> **PREFER**: ${d}`,
  },
};

export const VALID_STEER_TYPES = Object.keys(TYPE_CONFIG);

// ─── CHECK FOR CONTRADICTIONS ───────────────────────────────────────────────────

export function checkContradictions(db, directive) {
  if (!db) return [];

  try {
    const hasFts = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='memory_fts'"
    ).get();

    if (!hasFts) return [];

    const safeTerms = directive
      .split(/\s+/)
      .filter(t => t.length > 2)
      .slice(0, 5)
      .map(t => `"${t.replace(/"/g, '')}"`)
      .join(' OR ');

    if (!safeTerms) return [];

    return db.prepare(`
      SELECT source_id, title, snippet(memory_fts, 3, '→', '←', '...', 30) as snippet
      FROM memory_fts
      WHERE memory_fts MATCH ? AND source = 'wiki'
      ORDER BY rank
      LIMIT 3
    `).all(safeTerms);
  } catch {
    return [];
  }
}

// ─── STEER ──────────────────────────────────────────────────────────────────────

/**
 * Execute a steering cascade.
 *
 * @param {Object} options
 * @param {string} options.type - Steer type: 'never' | 'always' | 'correct' | 'prefer'
 * @param {string} options.directive - The directive text
 * @param {Object} options.paths - Resolved paths from utils.resolvePaths()
 * @param {Object} [options.db] - Open database connection (for FTS5 update)
 * @param {number} [options.intensity] - Override intensity (1-10)
 * @param {boolean} [options.dryRun] - Show changes without writing
 * @param {string} [options.behavioralSurfaceHeader] - Section header in system prompt
 * @returns {Object} Result with steps taken
 */
export function steer({
  type,
  directive,
  paths,
  db = null,
  intensity = null,
  dryRun = false,
  behavioralSurfaceHeader = '## DISTILLED MEMORY (SUBJECT STATES)',
}) {
  const config = TYPE_CONFIG[type];
  if (!config) {
    throw new Error(`Invalid steer type: "${type}". Must be one of: ${VALID_STEER_TYPES.join(', ')}`);
  }

  const effectiveIntensity = intensity || config.defaultIntensity;
  const today = new Date().toISOString().split('T')[0];
  const timestamp = new Date().toISOString();
  const slug = slugify(directive);

  const result = {
    type,
    directive,
    intensity: effectiveIntensity,
    slug,
    dryRun,
    steps: {},
  };

  // Step 0: Contradiction check
  const conflicts = checkContradictions(db, directive);
  result.conflicts = conflicts;

  // Step 1: Append to user preferences file
  const userEntry = `\n- **${today}**: [STEER/${type.toUpperCase()}] ${directive}`;
  if (!dryRun && fs.existsSync(paths.userMd)) {
    fs.appendFileSync(paths.userMd, userEntry + '\n');
    result.steps.userMd = 'appended';
  } else {
    result.steps.userMd = dryRun ? 'dry-run' : 'skipped (file not found)';
  }

  // Step 2: Create wiki node
  if (!dryRun) {
    const nodeResult = createNode(paths.wikiDir, {
      slug,
      type: config.wikiType,
      sentiment: config.sentiment,
      intensity: effectiveIntensity,
      directive,
      provenance: [`steer:${timestamp}`],
    });
    result.steps.wiki = nodeResult.exists ? 'updated' : 'created';
    result.wikiPath = nodeResult.filePath;
  } else {
    result.steps.wiki = 'dry-run';
  }

  // Step 3: Hot-patch system prompt
  if (fs.existsSync(paths.systemPrompt)) {
    const content = fs.readFileSync(paths.systemPrompt, 'utf-8');
    const sectionStart = content.indexOf(behavioralSurfaceHeader);

    if (sectionStart === -1) {
      result.steps.systemPrompt = 'section not found';
    } else {
      const afterHeader = content.indexOf('\n', sectionStart);
      const nextSection = content.indexOf('\n## ', afterHeader + 1);
      const sectionEnd = nextSection !== -1 ? nextSection : content.length;
      const currentSection = content.slice(sectionStart, sectionEnd);

      const steeredRule = config.surfaceFormat(directive);

      // Count existing steered rules
      const existingSteers = (currentSection.match(/> \[!(?:CAUTION|TIP|IMPORTANT)\]\n> \*\*(?:NEVER|ALWAYS|CORRECTION|PREFER)\*\*/g) || []).length;

      if (existingSteers >= 5) {
        result.steps.systemPrompt = 'hot slots full (5/5)';
      } else if (!dryRun) {
        const triggersMarker = '> [!IMPORTANT]\n> **ACTIVE MEMORY TRIGGERS**';
        const triggersIdx = currentSection.indexOf(triggersMarker);

        let newSection;
        if (triggersIdx !== -1) {
          const beforeTriggers = currentSection.slice(0, triggersIdx).trimEnd();
          const afterTriggers = currentSection.slice(triggersIdx);
          newSection = `${beforeTriggers}\n${steeredRule}\n\n${afterTriggers}`;
        } else {
          newSection = `${currentSection.trimEnd()}\n${steeredRule}\n`;
        }

        const newContent = content.slice(0, sectionStart) + newSection + content.slice(sectionEnd);
        fs.writeFileSync(paths.systemPrompt, newContent);
        result.steps.systemPrompt = `patched (${existingSteers + 1}/5 hot slots)`;
      } else {
        result.steps.systemPrompt = 'dry-run';
      }
    }
  } else {
    result.steps.systemPrompt = 'file not found';
  }

  // Step 4: Update FTS5 index
  if (!dryRun && db) {
    try {
      const hasFts = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='memory_fts'"
      ).get();

      if (hasFts) {
        const wikiFilePath = result.wikiPath;
        const relativePath = path.relative(paths.root, wikiFilePath);
        db.prepare('DELETE FROM memory_fts WHERE source_id = ?').run(relativePath);
        const wikiContent = fs.readFileSync(wikiFilePath, 'utf-8');
        db.prepare(`
          INSERT INTO memory_fts (source, source_id, title, content, category)
          VALUES ('wiki', ?, ?, ?, ?)
        `).run(relativePath, directive, wikiContent, config.wikiType);
        result.steps.fts5 = 'updated';
      }
    } catch (err) {
      result.steps.fts5 = `error: ${err.message}`;
    }
  } else {
    result.steps.fts5 = dryRun ? 'dry-run' : 'skipped (no db)';
  }

  return result;
}
