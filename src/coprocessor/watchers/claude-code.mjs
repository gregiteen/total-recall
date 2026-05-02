/**
 * claude-code.mjs — Claude Code Conversation Watcher
 *
 * Watches Claude Code JSONL session files for new conversation turns.
 * Path pattern: ~/.claude/projects/{project-slug}/{session-id}.jsonl
 *                    or subagents/{agent-id}.jsonl
 *
 * Claude Code JSONL format (one JSON object per line):
 *   { type: 'user'|'assistant', message: { role, content }, timestamp, sessionId }
 *   - User content is a string
 *   - Assistant content is an array of { type: 'text'|'tool_use'|'tool_result', text? }
 *
 * Session index: ~/.claude/projects/{project-slug}/sessions-index.json
 */

import fs from 'fs';
import path from 'path';

// ─── CONSTANTS ──────────────────────────────────────────────────────────────────

const CLAUDE_DIR = path.join(process.env.HOME || '', '.claude');
const PROJECTS_DIR = path.join(CLAUDE_DIR, 'projects');

// ─── FIND ACTIVE SESSION ────────────────────────────────────────────────────────

/**
 * Find all project directories that contain session indexes.
 * @returns {Array<{ projectSlug: string, indexPath: string }>}
 */
function findProjectDirs() {
  if (!fs.existsSync(PROJECTS_DIR)) return [];

  const results = [];
  const entries = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const indexPath = path.join(PROJECTS_DIR, entry.name, 'sessions-index.json');
    if (fs.existsSync(indexPath)) {
      results.push({ projectSlug: entry.name, indexPath });
    }
  }
  return results;
}

/**
 * Find the most recently modified JSONL session file across all projects.
 * @returns {{ sessionId: string, filePath: string, projectSlug: string, mtime: Date } | null}
 */
export function findLatestSession() {
  const projectDirs = findProjectDirs();
  let latest = null;

  for (const { projectSlug, indexPath } of projectDirs) {
    try {
      const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
      if (!index.entries || !Array.isArray(index.entries)) continue;

      for (const entry of index.entries) {
        if (!entry.fullPath || !fs.existsSync(entry.fullPath)) continue;
        const stat = fs.statSync(entry.fullPath);
        if (!latest || stat.mtime > latest.mtime) {
          latest = {
            sessionId: entry.sessionId,
            filePath: entry.fullPath,
            projectSlug,
            mtime: stat.mtime,
          };
        }
      }
    } catch {
      // Skip corrupt index files
    }
  }

  return latest;
}

// ─── PARSE JSONL TURNS ──────────────────────────────────────────────────────────

/**
 * Extract text content from a Claude Code message object.
 * @param {Object} message - The message field from a JSONL line
 * @returns {string}
 */
function extractText(message) {
  if (!message) return '';

  // User messages: content is a string
  if (typeof message.content === 'string') return message.content;

  // Assistant messages: content is an array of blocks
  if (Array.isArray(message.content)) {
    return message.content
      .filter(block => block.type === 'text' && block.text)
      .map(block => block.text)
      .join('\n');
  }

  return '';
}

/**
 * Parse new JSONL lines from a session file since a given byte offset.
 *
 * @param {string} filePath - Path to the .jsonl session file
 * @param {number} lastOffset - Byte offset of last read position
 * @returns {{ turns: Array<{role: string, text: string}>, newOffset: number }}
 */
export function parseNewTurns(filePath, lastOffset = 0) {
  const stat = fs.statSync(filePath);
  if (stat.size <= lastOffset) {
    return { turns: [], newOffset: lastOffset };
  }

  // Read only the new bytes
  const fd = fs.openSync(filePath, 'r');
  const buffer = Buffer.alloc(stat.size - lastOffset);
  fs.readSync(fd, buffer, 0, buffer.length, lastOffset);
  fs.closeSync(fd);

  const newContent = buffer.toString('utf-8');
  const lines = newContent.split('\n').filter(l => l.trim());
  const turns = [];

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      const role = entry.type === 'user' ? 'user'
        : entry.type === 'assistant' ? 'model'
        : null;

      if (!role) continue;

      const text = extractText(entry.message);
      if (text.trim()) {
        turns.push({ role, text });
      }
    } catch {
      // Skip malformed lines
    }
  }

  return { turns, newOffset: stat.size };
}

// ─── CREATE WATCHER ─────────────────────────────────────────────────────────────

/**
 * Create a watcher that monitors the most recent Claude Code session.
 *
 * @param {Object} options
 * @param {Function} options.onNewTurns - Callback: (turns, conversationId) => void
 * @param {number} [options.pollIntervalMs=5000] - How often to check for new sessions
 * @returns {{ stop: Function, getStatus: Function }}
 */
export function createWatcher({ onNewTurns, pollIntervalMs = 5000 }) {
  let activeWatcher = null;
  let activeSessionId = null;
  let activeFilePath = null;
  let lastOffset = 0;
  let pollTimer = null;
  let stopped = false;

  function watchSession(sessionId, filePath) {
    // Clean up previous watcher
    if (activeWatcher) {
      activeWatcher.close();
    }

    activeSessionId = sessionId;
    activeFilePath = filePath;

    // Start from current file size (don't replay history)
    try {
      const stat = fs.statSync(filePath);
      lastOffset = stat.size;
    } catch {
      lastOffset = 0;
    }

    // Watch for changes
    activeWatcher = fs.watch(filePath, { persistent: false }, (eventType) => {
      if (eventType === 'change' && !stopped) {
        const { turns, newOffset } = parseNewTurns(filePath, lastOffset);
        if (turns.length > 0) {
          lastOffset = newOffset;
          onNewTurns(turns, sessionId);
        }
      }
    });

    activeWatcher.on('error', () => {
      activeWatcher = null;
    });
  }

  function pollForNewSession() {
    if (stopped) return;

    const latest = findLatestSession();
    if (latest && latest.sessionId !== activeSessionId) {
      watchSession(latest.sessionId, latest.filePath);
    }

    pollTimer = setTimeout(pollForNewSession, pollIntervalMs);
  }

  // Start polling
  pollForNewSession();

  return {
    stop() {
      stopped = true;
      if (activeWatcher) {
        activeWatcher.close();
        activeWatcher = null;
      }
      if (pollTimer) {
        clearTimeout(pollTimer);
        pollTimer = null;
      }
    },
    getStatus() {
      return {
        type: 'claude-code',
        watching: activeSessionId,
        file: activeFilePath,
        offset: lastOffset,
        stopped,
      };
    },
  };
}
