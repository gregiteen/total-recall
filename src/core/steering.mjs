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
import { compileSurfaceFromGraph, writeSurface } from './surface.mjs';
import { detectConflicts } from './graph.mjs';

// ─── TYPE CONFIGURATION ─────────────────────────────────────────────────────────

const TYPE_CONFIG = {
  never: {
    wikiType: 'anti-pattern',
    sentiment: 'negative',
    defaultIntensity: 8,
    alertType: 'CAUTION',
    prefix: 'NEVER',
    surfaceFormat: (d) => `[NEVER] ${d}`,
  },
  always: {
    wikiType: 'pattern',
    sentiment: 'positive',
    defaultIntensity: 7,
    alertType: 'TIP',
    prefix: 'ALWAYS',
    surfaceFormat: (d) => `[ALWAYS] ${d}`,
  },
  correct: {
    wikiType: 'concept',
    sentiment: 'corrective',
    defaultIntensity: 6,
    alertType: 'IMPORTANT',
    prefix: 'CORRECTION',
    surfaceFormat: (d) => `[CORRECT] ${d}`,
  },
  prefer: {
    wikiType: 'preference',
    sentiment: 'positive',
    defaultIntensity: 5,
    alertType: 'TIP',
    prefix: 'PREFER',
    surfaceFormat: (d) => `[PREFER] ${d}`,
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

  // Step 3: Hot-patch system prompt & Step 4-6: Graph integration
  if (db && !dryRun) {
    try {
      const hasGraph = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='graph_nodes'").get();
      if (hasGraph) {
        // Step 4: Create/update graph node
        const existing = db.prepare('SELECT weight FROM graph_nodes WHERE slug = ?').get(slug);
        if (existing) {
          db.prepare('UPDATE graph_nodes SET weight = weight + 1, priority = ?, updated_at = datetime("now") WHERE slug = ?')
            .run(effectiveIntensity, slug);
          result.steps.graph = 'updated (weight incremented)';
        } else {
          const actionType = config.sentiment === 'negative' ? 'suppress' : 'inject';
          // Use 'absolute-invariant' for NEVER/ALWAYS, 'conditional' for prefer/correct
          const nodeType = ['never', 'always'].includes(type) ? 'absolute-invariant' : 'conditional';
          db.prepare(`
            INSERT INTO graph_nodes (slug, meaning, condition, action_type, weight, priority, node_type, subgraph, source_files)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(slug, directive, '{}', actionType, 1.0, effectiveIntensity, nodeType, 'shared', JSON.stringify([`${slug}.md`]));
          result.steps.graph = 'created';
        }

        // Step 5: Detect conflicts via graph.mjs
        const newConflicts = detectConflicts(db, [slug]);
        if (newConflicts.length > 0) {
          result.steps.graph_conflicts = `detected ${newConflicts.length} graph conflicts`;
        }

        // Step 6: Recompile surface from graph
        const compiled = compileSurfaceFromGraph(db, 'discuss', { tokenBudget: 2500 });
        if (fs.existsSync(paths.systemPrompt)) {
          const writeRes = writeSurface(paths.systemPrompt, compiled.surface, behavioralSurfaceHeader);
          result.steps.systemPrompt = writeRes.success ? 'recompiled via graph' : `failed: ${writeRes.error}`;
        }
      }
    } catch (err) {
      result.steps.graph = `error: ${err.message}`;
    }
  }

  // Fallback to legacy regex patching if db or graph_nodes is not available
  if (!result.steps.systemPrompt && fs.existsSync(paths.systemPrompt) && !dryRun) {
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
      const lines = currentSection.split('\n');
      const headerLine = lines[0];
      const signalLines = lines.slice(1).map(l => l.trim()).filter(l => l.length > 0);
      
      signalLines.unshift(steeredRule);
      const prunedSignals = signalLines.slice(0, 15); // Cap at 15
      
      const newSection = [headerLine, '', ...prunedSignals, ''].join('\n');
      const newContent = content.slice(0, sectionStart) + newSection + content.slice(sectionEnd);
      fs.writeFileSync(paths.systemPrompt, newContent);
      result.steps.systemPrompt = `legacy hot-patched (${prunedSignals.length}/15 slots)`;
    }
  } else if (!result.steps.systemPrompt) {
    result.steps.systemPrompt = dryRun ? 'dry-run' : 'file not found';
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

/**
 * Delete a steering cascade.
 *
 * @param {Object} options
 * @param {string} options.directive - The directive text to match
 * @param {Object} options.paths - Resolved paths from utils.resolvePaths()
 * @param {Object} [options.db] - Open database connection (for FTS5 update)
 * @param {boolean} [options.dryRun] - Show changes without writing
 * @param {string} [options.behavioralSurfaceHeader] - Section header in system prompt
 * @returns {Object} Result with steps taken
 */
export function unsteer({
  directive,
  paths,
  db = null,
  dryRun = false,
  behavioralSurfaceHeader = '## DISTILLED MEMORY (SUBJECT STATES)',
}) {
  const slug = slugify(directive);
  const result = {
    directive,
    slug,
    dryRun,
    steps: {},
  };

  // 1. Delete Wiki node
  const wikiFilePath = path.join(paths.wikiDir, `${slug}.md`);
  if (fs.existsSync(wikiFilePath)) {
    if (!dryRun) fs.unlinkSync(wikiFilePath);
    result.steps.wiki = dryRun ? 'dry-run' : 'deleted';
  } else {
    result.steps.wiki = 'not found';
  }

  // 2. Remove from System Prompt / Surface
  if (fs.existsSync(paths.systemPrompt)) {
    const content = fs.readFileSync(paths.systemPrompt, 'utf-8');
    const sectionStart = content.indexOf(behavioralSurfaceHeader);
    
    if (sectionStart !== -1) {
      const afterHeader = content.indexOf('\n', sectionStart);
      const nextSection = content.indexOf('\n## ', afterHeader + 1);
      const sectionEnd = nextSection !== -1 ? nextSection : content.length;
      const currentSection = content.slice(sectionStart, sectionEnd);
      
      const lines = currentSection.split('\n');
      const headerLine = lines[0];
      // Keep lines that DO NOT contain the directive
      const signalLines = lines.slice(1)
        .map(l => l.trim())
        .filter(l => l.length > 0 && !l.includes(directive));
      
      const newSection = [headerLine, '', ...signalLines, ''].join('\n');
      const newContent = content.slice(0, sectionStart) + newSection + content.slice(sectionEnd);
      
      if (!dryRun) {
        fs.writeFileSync(paths.systemPrompt, newContent);
      }
      result.steps.systemPrompt = dryRun ? 'dry-run' : 'patched (removed)';
    } else {
      result.steps.systemPrompt = 'section not found';
    }
  } else {
    result.steps.systemPrompt = 'file not found';
  }

  // 3. Update FTS5 index
  if (db && !dryRun) {
    try {
      const hasFts = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='memory_fts'"
      ).get();
      if (hasFts) {
        const relativePath = path.relative(paths.root, wikiFilePath);
        db.prepare('DELETE FROM memory_fts WHERE source_id = ?').run(relativePath);
        result.steps.fts5 = 'updated (removed)';
      }
    } catch (err) {
      result.steps.fts5 = `error: ${err.message}`;
    }
  } else {
    result.steps.fts5 = dryRun ? 'dry-run' : 'skipped (no db)';
  }

  return result;
}
