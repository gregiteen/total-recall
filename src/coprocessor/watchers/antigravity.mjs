/**
 * antigravity.mjs -- Antigravity IDE Conversation Watcher
 *
 * Watches Antigravity brain directories for overview.txt changes.
 * Path pattern: ~/.gemini/antigravity/brain/{id}/.system_generated/logs/overview.txt
 *
 * Detects new conversation turns by tracking file sizes and diffing
 * appended content. This is an adapter -- the only IDE-specific
 * coupling point in the entire Total Recall engine.
 */

import fs from 'fs';
import path from 'path';

// ─── FIND ACTIVE CONVERSATIONS ──────────────────────────────────────────────────

const BRAIN_DIR = path.join(process.env.HOME || '', '.gemini/antigravity/brain');

/**
 * Find all conversation directories with overview.txt files.
 * Returns the most recently modified conversations first.
 *
 * @param {string} [brainDir] - Override brain directory path
 * @returns {Array<{id: string, overviewPath: string, mtime: Date}>}
 */
export function findConversations(brainDir = BRAIN_DIR) {
  if (!fs.existsSync(brainDir)) return [];

  const entries = fs.readdirSync(brainDir, { withFileTypes: true });
  const conversations = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const overviewPath = path.join(
      brainDir, entry.name, '.system_generated', 'logs', 'overview.txt'
    );

    if (fs.existsSync(overviewPath)) {
      const stat = fs.statSync(overviewPath);
      conversations.push({
        id: entry.name,
        overviewPath,
        mtime: stat.mtime,
      });
    }
  }

  // Most recently modified first
  conversations.sort((a, b) => b.mtime - a.mtime);
  return conversations;
}

// ─── PARSE NEW TURNS ────────────────────────────────────────────────────────────

/**
 * Extract new content appended to an overview.txt since last known offset.
 *
 * @param {string} filePath - Path to overview.txt
 * @param {number} lastOffset - Byte offset of last read position
 * @returns {{ content: string, newOffset: number, turns: Array<{role: string, text: string}> }}
 */
export function parseNewTurns(filePath, lastOffset = 0) {
  const stat = fs.statSync(filePath);
  if (stat.size <= lastOffset) {
    return { content: '', newOffset: lastOffset, turns: [] };
  }

  // Read only the new bytes
  const fd = fs.openSync(filePath, 'r');
  const buffer = Buffer.alloc(stat.size - lastOffset);
  fs.readSync(fd, buffer, 0, buffer.length, lastOffset);
  fs.closeSync(fd);

  const content = buffer.toString('utf-8');
  const turns = parseTurnsFromText(content);

  return {
    content,
    newOffset: stat.size,
    turns,
  };
}

/**
 * Parse turn boundaries from overview.txt content.
 * Antigravity format uses lines like:
 *   [USER] message text
 *   [MODEL] response text
 *   [TOOL_CALL] tool invocation
 *   [TOOL_RESULT] tool output
 *
 * We care about USER turns (for steering/sentiment) and MODEL turns (for fact-checking).
 *
 * @param {string} text - Raw text to parse
 * @returns {Array<{role: string, text: string}>}
 */
export function parseTurnsFromText(text) {
  const turns = [];
  const lines = text.split('\n');
  let currentRole = null;
  let currentLines = [];

  for (const line of lines) {
    // Detect role boundaries — overview.txt uses various formats
    const roleMatch = line.match(/^\[(USER|MODEL|TOOL_CALL|TOOL_RESULT)\]\s*(.*)/);

    if (roleMatch) {
      // Flush previous turn
      if (currentRole && currentLines.length > 0) {
        turns.push({
          role: currentRole.toLowerCase(),
          text: currentLines.join('\n').trim(),
        });
      }
      currentRole = roleMatch[1];
      currentLines = roleMatch[2] ? [roleMatch[2]] : [];
    } else if (currentRole) {
      currentLines.push(line);
    }
  }

  // Flush last turn
  if (currentRole && currentLines.length > 0) {
    turns.push({
      role: currentRole.toLowerCase(),
      text: currentLines.join('\n').trim(),
    });
  }

  return turns;
}

// ─── CREATE WATCHER ─────────────────────────────────────────────────────────────

/**
 * Create a watcher that monitors the most recent conversation's overview.txt.
 *
 * @param {Object} options
 * @param {Function} options.onNewTurns - Callback: (turns, conversationId) => void
 * @param {string} [options.brainDir] - Override brain directory
 * @param {number} [options.pollIntervalMs=5000] - How often to check for new conversations
 * @returns {{ stop: Function, getStatus: Function }}
 */
export function createWatcher({ onNewTurns, brainDir = BRAIN_DIR, pollIntervalMs = 5000 }) {
  let activeWatcher = null;
  let activeConversationId = null;
  let lastOffset = 0;
  let pollTimer = null;
  let stopped = false;

  function watchConversation(conversationId, overviewPath) {
    // Clean up previous watcher
    if (activeWatcher) {
      activeWatcher.close();
    }

    activeConversationId = conversationId;

    // Start from current file size (don't replay history)
    try {
      const stat = fs.statSync(overviewPath);
      lastOffset = stat.size;
    } catch {
      lastOffset = 0;
    }

    // Use fs.watch (macOS FSEvents — native, efficient)
    activeWatcher = fs.watch(overviewPath, { persistent: false }, (eventType) => {
      if (eventType === 'change' && !stopped) {
        const { turns, newOffset } = parseNewTurns(overviewPath, lastOffset);
        if (turns.length > 0) {
          lastOffset = newOffset;
          onNewTurns(turns, conversationId);
        }
      }
    });

    activeWatcher.on('error', () => {
      // File may have been deleted or moved — poll will pick up next conversation
      activeWatcher = null;
    });
  }

  function pollForNewConversation() {
    if (stopped) return;

    const conversations = findConversations(brainDir);
    if (conversations.length === 0) return;

    const newest = conversations[0];
    if (newest.id !== activeConversationId) {
      watchConversation(newest.id, newest.overviewPath);
    }

    pollTimer = setTimeout(pollForNewConversation, pollIntervalMs);
  }

  // Start polling
  pollForNewConversation();

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
        watching: activeConversationId,
        offset: lastOffset,
        stopped,
      };
    },
  };
}
