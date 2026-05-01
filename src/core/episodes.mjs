/**
 * episodes.mjs — Episode Archive (Total Recall Layer 1)
 *
 * Stub for Phase 3. Archives full session context as structured
 * episode .md files with YAML frontmatter.
 *
 * Storage: .agent/memory/episodes/YYYY/MM/DD/session-{id}.md
 */

import fs from 'fs';
import path from 'path';

/**
 * Create an episode archive entry.
 *
 * @param {Object} options
 * @param {string} options.episodesDir - Path to episodes directory
 * @param {string} options.sessionId - Conversation/session ID
 * @param {string} options.content - Full session content or summary
 * @param {Object} [options.metadata] - Additional metadata
 * @param {string[]} [options.metadata.filesModified] - Files changed in session
 * @param {string[]} [options.metadata.decisions] - Decisions made
 * @param {string} [options.metadata.userMood] - Detected user mood
 * @returns {{ filePath: string, date: string }}
 */
export function archiveEpisode({
  episodesDir,
  sessionId,
  content,
  metadata = {},
}) {
  const now = new Date();
  const date = now.toISOString().split('T')[0];
  const [year, month, day] = date.split('-');
  const shortId = sessionId.slice(0, 8);

  const dir = path.join(episodesDir, year, month, day);
  fs.mkdirSync(dir, { recursive: true });

  const filePath = path.join(dir, `session-${shortId}.md`);

  const filesModified = metadata.filesModified || [];
  const decisions = metadata.decisions || [];
  const userMood = metadata.userMood || 'neutral';

  const frontmatter = `---
session_id: ${shortId}
date: ${date}
agent: ${metadata.agent || 'unknown'}
duration: ${metadata.duration || 'unknown'}
files_modified:
${filesModified.map(f => `  - ${f}`).join('\n') || '  []'}
decisions:
${decisions.map(d => `  - "${d}"`).join('\n') || '  []'}
user_mood: ${userMood}
---`;

  const episodeContent = `${frontmatter}\n\n${content}`;
  fs.writeFileSync(filePath, episodeContent);

  return { filePath, date };
}

/**
 * List all episodes in the archive.
 *
 * @param {string} episodesDir - Path to episodes directory
 * @returns {string[]} Array of episode file paths
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
