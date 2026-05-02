/**
 * episodes.mjs — Episode Archive (Total Recall Layer 1)
 *
 * Archives full session context as structured episode .md files with
 * YAML frontmatter. Each episode represents a single conversation session.
 *
 * Storage: .agent/memory/episodes/YYYY/MM/DD/session-{id}.md
 *
 * Episode structure:
 *   - YAML frontmatter: session_id, date, agent, duration, files_modified,
 *     decisions, user_mood, objective, skills_used
 *   - Markdown body: session overview/summary + key events
 */

import fs from 'fs';
import path from 'path';
import { parseFrontmatter, slugify } from './utils.mjs';

// ─── ARCHIVE AN EPISODE ─────────────────────────────────────────────────────────

/**
 * Create an episode archive entry from a session.
 *
 * @param {Object} options
 * @param {string} options.episodesDir - Path to episodes directory
 * @param {string} options.sessionId - Conversation/session ID
 * @param {string} options.content - Full session content or summary
 * @param {Object} [options.metadata] - Additional metadata
 * @param {string[]} [options.metadata.filesModified] - Files changed
 * @param {string[]} [options.metadata.decisions] - Decisions made
 * @param {string} [options.metadata.userMood] - Detected user mood
 * @param {string} [options.metadata.agent] - Agent that ran the session
 * @param {string} [options.metadata.duration] - Session duration
 * @param {string} [options.metadata.objective] - Session objective/goal
 * @param {string[]} [options.metadata.skillsUsed] - Skills invoked
 * @param {string} [options.metadata.project] - Project scope
 * @param {string} [options.date] - Override date (ISO format)
 * @returns {{ filePath: string, date: string, isNew: boolean }}
 */
export function archiveEpisode({
  episodesDir,
  sessionId,
  content,
  metadata = {},
  date: overrideDate,
}) {
  const now = new Date();
  const date = overrideDate || now.toISOString().split('T')[0];
  const [year, month, day] = date.split('-');
  const shortId = sessionId.slice(0, 8);

  const dir = path.join(episodesDir, year, month, day);
  fs.mkdirSync(dir, { recursive: true });

  const filePath = path.join(dir, `session-${shortId}.md`);
  const isNew = !fs.existsSync(filePath);

  const filesModified = metadata.filesModified || [];
  const decisions = metadata.decisions || [];
  const skillsUsed = metadata.skillsUsed || [];
  const userMood = metadata.userMood || 'neutral';
  const objective = metadata.objective || '';
  const project = metadata.project || '';

  const fmFilesModified = filesModified.length > 0
    ? '\n' + filesModified.map(f => `  - "${f}"`).join('\n')
    : ' []';

  const fmDecisions = decisions.length > 0
    ? '\n' + decisions.map(d => `  - "${d}"`).join('\n')
    : ' []';

  const fmSkillsUsed = skillsUsed.length > 0
    ? '\n' + skillsUsed.map(s => `  - "${s}"`).join('\n')
    : ' []';

  const frontmatter = `---
type: episode
session_id: "${sessionId}"
short_id: "${shortId}"
date: ${date}
agent: ${metadata.agent || 'antigravity'}
duration: ${metadata.duration || 'unknown'}
user_mood: ${userMood}
objective: "${objective.replace(/"/g, '\\"')}"
project: "${project}"
files_modified:${fmFilesModified}
decisions:${fmDecisions}
skills_used:${fmSkillsUsed}
---`;

  const episodeContent = `${frontmatter}\n\n${content}`;
  fs.writeFileSync(filePath, episodeContent);

  return { filePath, date, isNew };
}

// ─── PARSE OVERVIEW.TXT INTO EPISODE ────────────────────────────────────────────

/**
 * Parse a conversation overview.txt into structured episode data.
 *
 * @param {string} overviewPath - Path to overview.txt
 * @param {string} sessionId - Conversation ID
 * @returns {{ content: string, metadata: Object }}
 */
export function parseOverviewToEpisode(overviewPath, sessionId) {
  if (!fs.existsSync(overviewPath)) {
    return { content: '', metadata: {} };
  }

  const raw = fs.readFileSync(overviewPath, 'utf-8');
  const lines = raw.split('\n');

  // Extract key signals from the overview
  const filesModified = new Set();
  const decisions = [];
  const skillsUsed = new Set();
  let objective = '';
  let userMoodSignals = { positive: 0, negative: 0 };
  let agent = 'antigravity';

  // Track content for summary
  const userMessages = [];
  const modelActions = [];

  for (const line of lines) {
    // Parse JSON step lines
    try {
      const step = JSON.parse(line);

      // Extract user messages
      if (step.source === 'USER' && step.content) {
        userMessages.push(step.content.slice(0, 200));
      }

      // Extract model actions
      if (step.source === 'MODEL' && step.content) {
        modelActions.push(step.content.slice(0, 150));
      }

      // Detect file modifications from tool calls
      if (step.tool_calls) {
        for (const tc of step.tool_calls) {
          const args = tc.args || {};
          if (args.TargetFile) filesModified.add(args.TargetFile);
          if (args.AbsolutePath) filesModified.add(args.AbsolutePath);
        }
      }

      // Detect skills
      if (step.content) {
        const skillMatch = step.content.match(/utilizing the \*\*(\w[\w-]+)\*\* skill/i);
        if (skillMatch) skillsUsed.add(skillMatch[1]);
      }

      // Detect mood signals
      if (step.source === 'USER' && step.content) {
        const text = step.content;
        if (/\b(great|awesome|perfect|love|excellent|amazing)\b/i.test(text)) {
          userMoodSignals.positive++;
        }
        if (/\b(wrong|bad|broken|fix|frustrated|annoying)\b/i.test(text)) {
          userMoodSignals.negative++;
        }
      }
    } catch {
      // Non-JSON line — might be raw text
      if (line.trim().length > 0) {
        modelActions.push(line.trim().slice(0, 150));
      }
    }
  }

  // Determine mood
  const userMood = userMoodSignals.negative > userMoodSignals.positive * 2
    ? 'frustrated'
    : userMoodSignals.positive > userMoodSignals.negative * 2
      ? 'positive'
      : 'neutral';

  // Extract objective from first user message
  if (userMessages.length > 0) {
    objective = userMessages[0].replace(/\n/g, ' ').slice(0, 200);
  }

  // Build summary content
  const summaryParts = [];
  summaryParts.push(`# Session ${sessionId.slice(0, 8)}\n`);

  if (objective) {
    summaryParts.push(`## Objective\n${objective}\n`);
  }

  if (userMessages.length > 0) {
    summaryParts.push(`## Key Interactions\n`);
    summaryParts.push(`- **${userMessages.length}** user messages`);
    summaryParts.push(`- **${modelActions.length}** model actions`);
    summaryParts.push(`- **${filesModified.size}** files modified\n`);
  }

  if (filesModified.size > 0) {
    summaryParts.push(`## Files Modified`);
    for (const f of [...filesModified].slice(0, 20)) {
      summaryParts.push(`- ${f}`);
    }
    summaryParts.push('');
  }

  if (decisions.length > 0) {
    summaryParts.push(`## Decisions`);
    for (const d of decisions) {
      summaryParts.push(`- ${d}`);
    }
    summaryParts.push('');
  }

  return {
    content: summaryParts.join('\n'),
    metadata: {
      agent,
      filesModified: [...filesModified].slice(0, 50),
      decisions,
      skillsUsed: [...skillsUsed],
      userMood,
      objective: objective.slice(0, 200),
    },
  };
}

// ─── BACKFILL FROM HANDOFF ARCHIVES ─────────────────────────────────────────────

/**
 * Convert a handoff archive .md file into an episode.
 *
 * @param {string} handoffPath - Path to the handoff .md file
 * @param {string} episodesDir - Path to episodes directory
 * @returns {{ filePath: string, date: string }|null}
 */
export function archiveFromHandoff(handoffPath, episodesDir) {
  if (!fs.existsSync(handoffPath)) return null;

  const content = fs.readFileSync(handoffPath, 'utf-8');
  const filename = path.basename(handoffPath, '.md');

  // Extract date from filename: handoff-YYYYMMDD-HHMMSS-*
  const dateMatch = filename.match(/(\d{4})(\d{2})(\d{2})/);
  const date = dateMatch ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}` : new Date().toISOString().split('T')[0];

  // Generate a session ID from the filename
  const sessionId = slugify(filename).slice(0, 36) || `handoff-${Date.now()}`;

  // Extract metadata from the handoff content
  const { body, meta } = parseFrontmatter(content);

  // Extract objective from first heading
  const titleMatch = body.match(/^#\s+(.+)/m);
  const objective = titleMatch ? titleMatch[1].trim() : filename;

  return archiveEpisode({
    episodesDir,
    sessionId,
    content: body || content,
    date,
    metadata: {
      agent: meta.agent || 'antigravity',
      objective,
      userMood: 'neutral',
      filesModified: [],
      decisions: [],
      project: meta.project || '',
    },
  });
}

// ─── BATCH BACKFILL FROM BRAIN DIRECTORY ────────────────────────────────────────

/**
 * Backfill episodes from Antigravity brain conversation directories.
 *
 * @param {string} brainDir - Path to ~/.gemini/antigravity/brain/
 * @param {string} episodesDir - Path to episodes directory
 * @param {Object} [options]
 * @param {number} [options.limit] - Max conversations to process (0 = all)
 * @param {boolean} [options.skipExisting] - Skip conversations that already have episodes
 * @returns {{ total: number, created: number, skipped: number, errors: number }}
 */
export function backfillFromBrain(brainDir, episodesDir, { limit = 0, skipExisting = true } = {}) {
  if (!fs.existsSync(brainDir)) {
    return { total: 0, created: 0, skipped: 0, errors: 0 };
  }

  const stats = { total: 0, created: 0, skipped: 0, errors: 0 };

  const entries = fs.readdirSync(brainDir, { withFileTypes: true })
    .filter(e => e.isDirectory() && /^[0-9a-f-]+$/.test(e.name))
    .map(e => e.name);

  const toProcess = limit > 0 ? entries.slice(0, limit) : entries;
  stats.total = toProcess.length;

  for (const conversationId of toProcess) {
    try {
      const overviewPath = path.join(brainDir, conversationId, '.system_generated', 'logs', 'overview.txt');
      if (!fs.existsSync(overviewPath)) {
        stats.skipped++;
        continue;
      }

      // Check if already archived
      if (skipExisting) {
        const shortId = conversationId.slice(0, 8);
        const existing = findEpisodeByShortId(episodesDir, shortId);
        if (existing) {
          stats.skipped++;
          continue;
        }
      }

      // Get file modification date for episode dating
      const fileStat = fs.statSync(overviewPath);
      const date = fileStat.mtime.toISOString().split('T')[0];

      // Parse and archive
      const { content, metadata } = parseOverviewToEpisode(overviewPath, conversationId);
      if (!content.trim()) {
        stats.skipped++;
        continue;
      }

      archiveEpisode({
        episodesDir,
        sessionId: conversationId,
        content,
        metadata,
        date,
      });

      stats.created++;
    } catch {
      stats.errors++;
    }
  }

  return stats;
}

/**
 * Batch backfill from handoff archive directory.
 *
 * @param {string} handoffsSourceDir - Path to .agent/handoffs/
 * @param {string} episodesDir - Path to episodes directory
 * @returns {{ total: number, created: number, skipped: number, errors: number }}
 */
export function backfillFromHandoffs(handoffsSourceDir, episodesDir, { skipExisting = true } = {}) {
  if (!fs.existsSync(handoffsSourceDir)) {
    return { total: 0, created: 0, skipped: 0, errors: 0 };
  }

  const stats = { total: 0, created: 0, skipped: 0, errors: 0 };

  const files = fs.readdirSync(handoffsSourceDir)
    .filter(f => f.endsWith('.md') && f.startsWith('handoff-'));

  stats.total = files.length;

  for (const file of files) {
    try {
      const filePath = path.join(handoffsSourceDir, file);

      // Check if already exists
      if (skipExisting) {
        const slug = slugify(file.replace('.md', '')).slice(0, 36);
        const existing = findEpisodeByShortId(episodesDir, slug.slice(0, 8));
        if (existing) {
          stats.skipped++;
          continue;
        }
      }

      const result = archiveFromHandoff(filePath, episodesDir);
      if (result) {
        stats.created++;
      } else {
        stats.skipped++;
      }
    } catch {
      stats.errors++;
    }
  }

  return stats;
}

// ─── QUERY EPISODES ─────────────────────────────────────────────────────────────

/**
 * List all episodes in the archive.
 *
 * @param {string} episodesDir - Path to episodes directory
 * @returns {string[]} Array of episode file paths, sorted chronologically
 */
export function listEpisodes(episodesDir) {
  if (!fs.existsSync(episodesDir)) return [];

  const results = [];
  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.name.endsWith('.md')) {
        results.push(fullPath);
      }
    }
  }
  walk(episodesDir);
  return results.sort();
}

/**
 * Find an episode by short session ID prefix.
 *
 * @param {string} episodesDir
 * @param {string} shortId - First 8 chars of session ID
 * @returns {string|null} Path to episode file, or null
 */
export function findEpisodeByShortId(episodesDir, shortId) {
  if (!fs.existsSync(episodesDir)) return null;

  const allEpisodes = listEpisodes(episodesDir);
  for (const ep of allEpisodes) {
    if (path.basename(ep).includes(shortId)) return ep;
  }
  return null;
}

/**
 * Get episode archive statistics.
 *
 * @param {string} episodesDir
 * @returns {{ total: number, byMonth: Object<string, number>, oldestDate: string|null, newestDate: string|null }}
 */
export function getEpisodeStats(episodesDir) {
  const episodes = listEpisodes(episodesDir);
  const byMonth = {};
  let oldest = null;
  let newest = null;

  for (const ep of episodes) {
    // Extract date from path: .../YYYY/MM/DD/session-*.md
    const parts = ep.split(path.sep);
    const dayIdx = parts.findIndex(p => /^\d{2}$/.test(p) && parts[parts.indexOf(p) - 1]?.match(/^\d{2}$/));
    if (dayIdx >= 2) {
      const year = parts[dayIdx - 2];
      const month = parts[dayIdx - 1];
      const day = parts[dayIdx];
      const date = `${year}-${month}-${day}`;
      const monthKey = `${year}-${month}`;

      byMonth[monthKey] = (byMonth[monthKey] || 0) + 1;

      if (!oldest || date < oldest) oldest = date;
      if (!newest || date > newest) newest = date;
    }
  }

  return {
    total: episodes.length,
    byMonth,
    oldestDate: oldest,
    newestDate: newest,
  };
}
