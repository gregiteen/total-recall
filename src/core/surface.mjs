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
import path from 'path';
import { loadNodes } from './wiki.mjs';
import { rankNodes } from './ranking.mjs';
import { walkMarkdown, parseFrontmatter } from './utils.mjs';

// ─── TEMPORAL CONTEXT ───────────────────────────────────────────────────────────

function getTimeOfDayLabel(hour) {
  if (hour < 6) return 'late night';
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  if (hour < 21) return 'evening';
  return 'night';
}

/**
 * Build a human-readable temporal context string using the local system timezone.
 * @param {string} [tz] - Optional IANA timezone override
 * @returns {string}
 */
export function buildTemporalContext(tz) {
  const now = new Date();
  const timezone = tz || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  let localHour, localDateStr, dayContext;

  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    });
    const parts = formatter.formatToParts(now);
    localHour = parseInt(parts.find(p => p.type === 'hour')?.value || '12', 10);
    const weekday = parts.find(p => p.type === 'weekday')?.value || '';
    const month = parts.find(p => p.type === 'month')?.value || '';
    const day = parts.find(p => p.type === 'day')?.value || '';
    const isWeekend = ['Saturday', 'Sunday'].includes(weekday);
    dayContext = `${weekday}${isWeekend ? ' (weekend)' : ''}`;
    localDateStr = `${month} ${day}`;
  } catch {
    localHour = now.getHours();
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    dayContext = days[now.getDay()];
    localDateStr = now.toISOString().slice(0, 10);
  }

  const timeLabel = getTimeOfDayLabel(localHour);
  return `Current time: ${localDateStr}, ${dayContext}, ${timeLabel} (${localHour}:00 ${timezone})`;
}

/**
 * Load recent episodes from the episodes directory.
 * @param {string} episodesDir
 * @param {number} [limit=3]
 * @returns {Array<{date: string, objective: string, mood: string}>}
 */
export function loadRecentEpisodes(episodesDir, limit = 3) {
  if (!episodesDir || !fs.existsSync(episodesDir)) return [];

  const files = walkMarkdown(episodesDir).sort().reverse();
  const episodes = [];

  for (const fp of files.slice(0, limit * 2)) { // Read extra to account for parsing failures
    try {
      const content = fs.readFileSync(fp, 'utf-8');
      const { meta, body } = parseFrontmatter(content);
      const titleMatch = body.match(/^#\s+(.+)/m);
      episodes.push({
        date: meta.date || meta.session_date || path.basename(fp, '.md'),
        objective: meta.objective || titleMatch?.[1]?.trim() || body.slice(0, 100),
        mood: meta.user_mood || '',
      });
      if (episodes.length >= limit) break;
    } catch { continue; }
  }

  return episodes;
}

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
 * @param {boolean} [options.includeTemporalContext] - Inject time-of-day + recent episodes
 * @param {string} [options.timezone] - IANA timezone override
 * @param {string} [options.episodesDir] - Path to episodes directory for recent session summaries
 * @param {string} [options.triggerCommand] - Command for active triggers
 * @returns {Object|null} { surface, stats, nodes } or null if no nodes
 */
export function compileSurface({
  wikiDir,
  root,
  ranking = {},
  includeTemporalContext = false,
  timezone,
  episodesDir,
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

  // Temporal context (injected during heartbeat cycles)
  if (includeTemporalContext) {
    lines.push(`> **TEMPORAL CONTEXT** — ${buildTemporalContext(timezone)}`);
    lines.push(`> Last compiled: ${new Date().toISOString()} | Nodes: ${nodes.length}`);
    lines.push('');

    // Recent episodes
    const episodes = episodesDir ? loadRecentEpisodes(episodesDir) : [];
    if (episodes.length > 0) {
      lines.push('> [!NOTE]');
      lines.push('> **RECENT SESSIONS**');
      for (const ep of episodes) {
        const mood = ep.mood ? ` [mood: ${ep.mood}]` : '';
        lines.push(`> - ${ep.date}: ${ep.objective.slice(0, 120)}${mood}`);
      }
      lines.push('');
    }
  }

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

// ─── PHASE 19: GRAPH COMPILER (TWO-TIER) ────────────────────────────────────────

/**
 * Compile the behavioral surface using the Instruction Graph.
 * Implements Two-Tier Injection: STATIC (absolute-invariants) + DYNAMIC (conditional).
 * 
 * @param {object} db - SQLite database connection
 * @param {string} mode - The classified prompt mode (e.g., 'answer', 'execute')
 * @param {object} options - Compilation options
 * @returns {object} { surface, stats }
 */
export function compileSurfaceFromGraph(db, mode = 'discuss', options = {}) {
  const { includeTemporalContext = false, timezone, episodesDir } = options;
  const budget = options.tokenBudget || 2000;

  // 1. TIER 1: STATIC SURFACE
  const staticNodes = db.prepare(`
    SELECT * FROM graph_nodes 
    WHERE node_type = 'absolute-invariant' 
    ORDER BY priority DESC
  `).all();
  
  // Create an attitude paragraph from the highest priority nodes
  const attitudeNodes = [...staticNodes].sort((a, b) => b.weight - a.weight).slice(0, 8);
  const attitude = generateAttitudeParagraph(attitudeNodes.map(n => ({
    title: n.meaning.slice(0, 50),
    sentiment: n.action_type === 'suppress' ? 'negative' : 'positive'
  })));

  // 2. TIER 2: DYNAMIC SURFACE
  const rawConditionalNodes = db.prepare(`
    SELECT * FROM graph_nodes 
    WHERE node_type = 'conditional'
  `).all();

  // Filter based on condition matching the current mode
  const filteredCandidates = rawConditionalNodes.filter(node => {
    try {
      const condition = JSON.parse(node.condition || '{}');
      if (!condition.mode || condition.mode.length === 0) return true; // applies to all modes
      return condition.mode.includes(mode);
    } catch {
      return true; // Malformed JSON assumes it applies
    }
  });

  // Resolve conflicts based on priority
  // If Node A conflicts with Node B, drop the one with lower priority
  // (In a real implementation, we'd walk the 'conflicts-with' edges via a DB query)
  // For now, we simulate conflict resolution by grouping and filtering
  const resolvedNodes = [...filteredCandidates].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return b.weight - a.weight;
  });

  // Enforce token budget
  const dynamicNodes = [];
  let currentTokens = 0;
  for (const node of resolvedNodes) {
    const estimatedTokens = node.meaning.length / 4;
    if (currentTokens + estimatedTokens > budget) break;
    dynamicNodes.push(node);
    currentTokens += estimatedTokens;
  }

  // 3. ASSEMBLE OUTPUT
  const lines = [];
  lines.push('## DISTILLED MEMORY (SUBJECT STATES)');

  // Temporal Context
  if (includeTemporalContext) {
    lines.push(`> **TEMPORAL CONTEXT** — ${buildTemporalContext(timezone)}`);
    lines.push(`> Graph Compilation Mode: \`${mode}\` | Nodes: ${staticNodes.length + dynamicNodes.length}`);
    lines.push('');
  }

  // Static Invariants & Attitude
  lines.push('> [!NOTE]');
  lines.push(`> **AGENT ATTITUDE** — ${attitude}`);
  lines.push('');

  if (staticNodes.length > 0) {
    lines.push('> [!IMPORTANT]');
    lines.push('> **ABSOLUTE INVARIANTS** (Always active):');
    for (const rule of staticNodes) {
      lines.push(`> - ${rule.meaning}`);
    }
    lines.push('');
  }

  // Dynamic Context
  if (dynamicNodes.length > 0) {
    lines.push('> [!TIP]');
    lines.push(`> **ACTIVE CONTEXT** (Mode: ${mode}):`);
    for (const rule of dynamicNodes) {
      const prefix = rule.action_type === 'suppress' ? '🛑 AVOID: ' : '✅ DO: ';
      lines.push(`> - ${prefix}${rule.meaning}`);
    }
    lines.push('');
  }

  return {
    surface: lines.join('\n'),
    stats: {
      staticNodes: staticNodes.length,
      dynamicNodes: dynamicNodes.length,
      mode
    }
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

/**
 * Remove the behavioral surface section entirely from the system prompt file.
 *
 * @param {string} filePath - Path to system prompt file
 * @param {string} [sectionHeader] - Section header to find and remove
 * @returns {{ success: boolean, error?: string }}
 */
export function clearSurface(filePath, sectionHeader = '## DISTILLED MEMORY (SUBJECT STATES)') {
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

  const newContent = content.slice(0, sectionStart).trimEnd() + '\n\n' + content.slice(sectionEnd).trimStart();
  fs.writeFileSync(filePath, newContent);

  return { success: true };
}

/**
 * Remove the behavioral surface from ALL configured system prompt files.
 *
 * @param {string[]} filePaths - Array of absolute paths
 * @param {string} [sectionHeader]
 * @returns {{ results: Array<{ file: string, success: boolean, error?: string }> }}
 */
export function clearSurfaceMulti(filePaths, sectionHeader) {
  const results = [];
  for (const fp of filePaths) {
    results.push({ file: fp, ...clearSurface(fp, sectionHeader) });
  }
  return { results };
}
