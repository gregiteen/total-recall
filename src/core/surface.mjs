/**
 * surface.mjs — Behavioral Surface Compiler (Total Recall Layer 4)
 *
 * Auto-generates the DISTILLED MEMORY section from the knowledge graph.
 * Produces a 4-part behavioral surface:
 *   1. Attitude Paragraph — emergent character description
 *   2. Curated Rules — top-ranked negative + positive + corrective
 *   3. Steering Queue — hot-patched same-session directives
 *   4. Active Triggers — memory collection rules
 */

import fs from 'fs';
import { loadNodes } from './wiki.mjs';
import { rankNodes } from './ranking.mjs';

// ─── GENERATE ATTITUDE PARAGRAPH ────────────────────────────────────────────────

function generateAttitudeParagraph(nodes) {
  const antiPatterns = nodes.filter(n => n.sentiment === 'negative' || n.type === 'anti-pattern').slice(0, 5);
  const positivePatterns = nodes.filter(n => n.sentiment === 'positive').slice(0, 5);
  const corrections = nodes.filter(n => n.sentiment === 'corrective').slice(0, 3);

  const parts = ['You are an agent shaped by hard experience in this codebase.'];

  if (antiPatterns.length > 0) {
    const avoids = antiPatterns.slice(0, 3).map(n => n.title).join('; ');
    parts.push(`You instinctively guard against: ${avoids}.`);
  }

  if (positivePatterns.length > 0) {
    const practices = positivePatterns.slice(0, 3).map(n => n.title).join('; ');
    parts.push(`You actively practice: ${practices}.`);
  }

  if (corrections.length > 0) {
    const corrects = corrections.slice(0, 2).map(n => n.title).join('; ');
    parts.push(`You know from experience: ${corrects}.`);
  }

  return parts.join(' ');
}

// ─── COMPILE BEHAVIORAL SURFACE ─────────────────────────────────────────────────

/**
 * Compile the behavioral surface from wiki nodes.
 *
 * @param {Object} options
 * @param {string} options.wikiDir - Path to wiki directory
 * @param {string} [options.root] - Repo root for relative paths
 * @param {Object} [options.ranking] - Ranking config overrides
 * @param {string} [options.triggerCommand] - Command for active triggers
 * @returns {Object|null} { surface, stats, nodes } or null if no nodes
 */
export function compileSurface({
  wikiDir,
  root,
  ranking = {},
  triggerCommand = 'total-recall note --category TYPE "Description"',
} = {}) {
  const rawNodes = loadNodes(wikiDir, root);

  if (rawNodes.length === 0) {
    return null;
  }

  const surfaceCap = ranking.surfaceCap || 30;
  const hotSlots = ranking.hotSlots || 5;
  const compiledSlots = surfaceCap - hotSlots;

  const nodes = rankNodes(rawNodes, ranking);

  // Separate steered rules from ranked rules
  const steeredNodes = nodes.filter(n => n.isSteer).slice(0, hotSlots);
  const rankedNodes = nodes.filter(n => !n.isSteer).slice(0, compiledSlots);

  // Generate attitude paragraph
  const attitude = generateAttitudeParagraph(nodes);

  // Build the surface
  const lines = [];
  lines.push('## DISTILLED MEMORY (SUBJECT STATES)');

  // Part A: Attitude Paragraph
  lines.push('> [!NOTE]');
  lines.push(`> **AGENT ATTITUDE** — ${attitude}`);
  lines.push('');

  // Part B: Curated Rules — Negative
  const negativeRules = rankedNodes.filter(n =>
    n.sentiment === 'negative' || n.type === 'anti-pattern'
  );
  if (negativeRules.length > 0) {
    lines.push('> [!CAUTION]');
    for (const rule of negativeRules.slice(0, 10)) {
      lines.push(`> **${rule.type.toUpperCase()}** — ${rule.ruleText}`);
    }
    lines.push('');
  }

  // Part B: Curated Rules — Positive
  const positiveRules = rankedNodes.filter(n =>
    n.sentiment === 'positive' && n.type !== 'anti-pattern'
  );
  if (positiveRules.length > 0) {
    lines.push('> [!TIP]');
    for (const rule of positiveRules.slice(0, 10)) {
      lines.push(`> **${rule.type.toUpperCase()}** — ${rule.ruleText}`);
    }
    lines.push('');
  }

  // Part B: Curated Rules — Corrective
  const correctiveRules = rankedNodes.filter(n => n.sentiment === 'corrective');
  if (correctiveRules.length > 0) {
    lines.push('> [!IMPORTANT]');
    for (const rule of correctiveRules.slice(0, 5)) {
      lines.push(`> **${rule.type.toUpperCase()}** — ${rule.ruleText}`);
    }
    lines.push('');
  }

  // Part C: Steering Queue
  if (steeredNodes.length > 0) {
    for (const steer of steeredNodes) {
      const alertType = steer.sentiment === 'negative' ? 'CAUTION' :
                       steer.sentiment === 'corrective' ? 'IMPORTANT' : 'TIP';
      lines.push(`> [!${alertType}]`);
      lines.push(`> **STEERED**: ${steer.ruleText}`);
    }
    lines.push('');
  }

  // Part D: Active Triggers
  lines.push('> [!IMPORTANT]');
  lines.push(`> **ACTIVE MEMORY TRIGGERS** — When any of these occur, log immediately via \`${triggerCommand}\`:`);
  lines.push('> - User frustration/anger → `critical-failure`');
  lines.push('> - Fix takes >3 attempts → `pattern`');
  lines.push('> - User corrects agent knowledge → `user-preference`');
  lines.push('> - User expresses satisfaction/praise → `user-preference` (POSITIVE)');
  lines.push('> - New architectural pattern → `wiki`');
  lines.push('> - Ghost file reference → `critical-failure`');
  lines.push('> - UI hallucination → `critical-failure`');

  const surface = lines.join('\n');

  return {
    surface,
    stats: {
      totalNodes: nodes.length,
      negativeRules: negativeRules.length,
      positiveRules: positiveRules.length,
      correctiveRules: correctiveRules.length,
      steeredNodes: steeredNodes.length,
    },
    nodes,
  };
}

// ─── WRITE SURFACE TO SYSTEM PROMPT ─────────────────────────────────────────────

/**
 * Replace the behavioral surface section in the system prompt file.
 *
 * @param {string} filePath - Path to system prompt file (e.g., INSTRUCTIONS.md)
 * @param {string} surface - The compiled surface text
 * @param {string} [sectionHeader] - Section header to find and replace
 * @returns {{ success: boolean, error?: string }}
 */
export function writeSurface(filePath, surface, sectionHeader = '## DISTILLED MEMORY (SUBJECT STATES)') {
  if (!fs.existsSync(filePath)) {
    return { success: false, error: `File not found: ${filePath}` };
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const sectionStart = content.indexOf(sectionHeader);

  if (sectionStart === -1) {
    return { success: false, error: `Section "${sectionHeader}" not found` };
  }

  const afterHeader = content.indexOf('\n', sectionStart);
  const nextSection = content.indexOf('\n## ', afterHeader + 1);
  const sectionEnd = nextSection !== -1 ? nextSection : content.length;

  const newContent = content.slice(0, sectionStart) + surface + '\n' + content.slice(sectionEnd);
  fs.writeFileSync(filePath, newContent);

  return { success: true };
}

/**
 * Write the behavioral surface to ALL configured system prompt files.
 * Supports multi-file injection for different IDEs.
 *
 * @param {string[]} filePaths - Array of absolute paths to inject into
 * @param {string} surface - The compiled surface text
 * @param {string} [sectionHeader] - Section header to find and replace
 * @returns {{ results: Array<{ file: string, success: boolean, error?: string }> }}
 */
export function writeSurfaceMulti(filePaths, surface, sectionHeader = '## DISTILLED MEMORY (SUBJECT STATES)') {
  const results = [];
  for (const filePath of filePaths) {
    const result = writeSurface(filePath, surface, sectionHeader);
    results.push({ file: filePath, ...result });
  }
  return { results };
}
