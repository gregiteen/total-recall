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
import { slugify, walkMarkdown, parseFrontmatter } from './utils.mjs';
import { createNode } from './wiki.mjs';
import { compileSurfaceFromGraph, writeSurfaceMulti, clearSurfaceMulti } from './surface.mjs';

// ─── DUPLICATE DETECTION ────────────────────────────────────────────────────────

/**
 * Compute Jaccard similarity between two strings (word-level).
 * Returns a value between 0 (no overlap) and 1 (identical words).
 */
function jaccardSimilarity(a, b) {
  const setA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const setB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  if (setA.size === 0 && setB.size === 0) return 1;
  const intersection = [...setA].filter(w => setB.has(w)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Check if a directive is a near-duplicate of an existing wiki node.
 * Returns the duplicate node slug if similarity > threshold, null otherwise.
 */
export function detectDuplicate(wikiDir, directive, { threshold = 0.7 } = {}) {
  const files = walkMarkdown(wikiDir);
  for (const fp of files) {
    try {
      const content = fs.readFileSync(fp, 'utf-8');
      const { body } = parseFrontmatter(content);
      const similarity = jaccardSimilarity(directive, body);
      if (similarity >= threshold) {
        return {
          slug: path.basename(fp, '.md'),
          similarity: Math.round(similarity * 100),
        };
      }
    } catch { continue; }
  }
  return null;
}
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

  // Step 0a: Duplicate detection — prevent hallucinated redundant steers
  const duplicate = detectDuplicate(paths.wikiDir, directive);
  if (duplicate) {
    console.log(`   ⚠️  Potential duplicate found: "${duplicate.slug}" (${duplicate.similarity}% similar)`);
    result.duplicate = duplicate;
  }

  // Step 0b: Contradiction check
  const conflicts = checkContradictions(db, directive);
  result.conflicts = conflicts;

  // CRITICAL FIX: Auto-Resolve Conflicts (Phase 20)
  // Prevents the memory graph from holding contradictory rules which cause the agent to violate instructions.
  if (conflicts.length > 0 && !dryRun) {
    for (const c of conflicts) {
      // 1. Delete the conflicting wiki node file
      const conflictPath = path.join(paths.root, c.source_id);
      if (fs.existsSync(conflictPath)) {
        fs.unlinkSync(conflictPath);
      }
      // 2. Remove from FTS5 index
      if (db) {
        db.prepare('DELETE FROM memory_fts WHERE source_id = ?').run(c.source_id);
      }
      // 3. Remove from graph_nodes
      if (db) {
        const conflictSlug = path.basename(c.source_id, '.md');
        try {
          db.prepare('DELETE FROM graph_nodes WHERE slug = ?').run(conflictSlug);
        } catch (e) {
          // Ignore if graph_nodes table doesn't exist yet
        }
      }
    }
    result.steps.auto_resolved = `Deleted ${conflicts.length} conflicting older rules.`;
  }

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
        if (paths.systemPromptFiles && paths.systemPromptFiles.length > 0) {
          const writeRes = writeSurfaceMulti(paths.systemPromptFiles, compiled.surface, behavioralSurfaceHeader);
          const allSuccess = writeRes.results.every(r => r.success);
          result.steps.systemPromptFiles = allSuccess ? 'recompiled via graph' : `failed for some files: ${JSON.stringify(writeRes.results)}`;
        }
      }
    } catch (err) {
      result.steps.graph = `error: ${err.message}`;
    }
  }

  // Fallback to legacy regex patching if db or graph_nodes is not available
  if (!result.steps.systemPromptFiles && paths.systemPromptFiles && paths.systemPromptFiles.length > 0 && !dryRun) {
    let patchedCount = 0;
    for (const promptFile of paths.systemPromptFiles) {
      if (fs.existsSync(promptFile)) {
        const content = fs.readFileSync(promptFile, 'utf-8');
        const sectionStart = content.indexOf(behavioralSurfaceHeader);

        if (sectionStart !== -1) {
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
          fs.writeFileSync(promptFile, newContent);
          patchedCount++;
        }
      }
    }
    result.steps.systemPromptFiles = patchedCount > 0 ? `legacy hot-patched (${patchedCount} files)` : 'section not found';
  } else if (!result.steps.systemPromptFiles) {
    result.steps.systemPromptFiles = dryRun ? 'dry-run' : 'files not found';
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
  if (paths.systemPromptFiles && paths.systemPromptFiles.length > 0) {
    if (!dryRun) {
      const clearRes = clearSurfaceMulti(paths.systemPromptFiles, behavioralSurfaceHeader);
      result.steps.systemPromptFiles = 'patched (removed from multi)';
    } else {
      result.steps.systemPromptFiles = 'dry-run';
    }
  } else {
    result.steps.systemPromptFiles = 'files not found';
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
      // Also remove from graph_nodes
      try {
        db.prepare('DELETE FROM graph_nodes WHERE slug = ?').run(slug);
        result.steps.graph = 'deleted';
      } catch (e) {
        // Ignore if graph_nodes doesn't exist
      }
    } catch (err) {
      result.steps.fts5 = `error: ${err.message}`;
    }
  } else {
    result.steps.fts5 = dryRun ? 'dry-run' : 'skipped (no db)';
  }

  return result;
}
