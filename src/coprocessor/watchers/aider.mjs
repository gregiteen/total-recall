/**
 * aider.mjs — Aider Conversation Watcher
 *
 * Watches Aider's chat history markdown file for new conversation turns.
 * Default path: .aider.chat.history.md (in project root)
 *
 * Aider format uses markdown role headers:
 *   #### USER
 *   message content
 *
 *   #### ASSISTANT
 *   response content
 */

import fs from 'fs';
import path from 'path';

// ─── PARSE TURNS ────────────────────────────────────────────────────────────────

const ROLE_REGEX = /^####\s+(USER|ASSISTANT|SYSTEM)\s*$/im;

/**
 * Parse new turns from Aider's markdown chat history.
 *
 * @param {string} filePath - Path to .aider.chat.history.md
 * @param {number} lastOffset - Byte offset of last read
 * @returns {{ turns: Array<{role: string, text: string}>, newOffset: number }}
 */
export function parseNewTurns(filePath, lastOffset = 0) {
  const stat = fs.statSync(filePath);
  if (stat.size <= lastOffset) {
    return { turns: [], newOffset: lastOffset };
  }

  const fd = fs.openSync(filePath, 'r');
  const buffer = Buffer.alloc(stat.size - lastOffset);
  fs.readSync(fd, buffer, 0, buffer.length, lastOffset);
  fs.closeSync(fd);

  const content = buffer.toString('utf-8');
  const turns = [];
  const lines = content.split('\n');
  let currentRole = null;
  let currentLines = [];

  for (const line of lines) {
    const match = line.match(ROLE_REGEX);
    if (match) {
      // Flush previous turn
      if (currentRole && currentLines.length > 0) {
        const text = currentLines.join('\n').trim();
        if (text) turns.push({ role: currentRole, text });
      }
      currentRole = match[1].toUpperCase() === 'USER' ? 'user' : 'model';
      currentLines = [];
    } else if (currentRole) {
      currentLines.push(line);
    }
  }

  // Flush last turn
  if (currentRole && currentLines.length > 0) {
    const text = currentLines.join('\n').trim();
    if (text) turns.push({ role: currentRole, text });
  }

  return { turns, newOffset: stat.size };
}

// ─── CREATE WATCHER ─────────────────────────────────────────────────────────────

/**
 * Create a watcher for Aider's chat history file.
 *
 * @param {Object} options
 * @param {Function} options.onNewTurns - Callback: (turns, conversationId) => void
 * @param {string} [options.historyFile] - Override path (default: .aider.chat.history.md in cwd)
 * @returns {{ stop: Function, getStatus: Function }}
 */
export function createWatcher({ onNewTurns, historyFile }) {
  const filePath = historyFile || path.join(process.cwd(), '.aider.chat.history.md');
  let watcher = null;
  let lastOffset = 0;
  let stopped = false;

  if (!fs.existsSync(filePath)) {
    // File may not exist yet — watch the directory for its creation
    const dir = path.dirname(filePath);
    const basename = path.basename(filePath);

    const dirWatcher = fs.watch(dir, { persistent: false }, (_, filename) => {
      if (filename === basename && fs.existsSync(filePath) && !watcher) {
        startFileWatch();
        dirWatcher.close();
      }
    });

    return {
      stop() {
        stopped = true;
        dirWatcher.close();
        if (watcher) { watcher.close(); watcher = null; }
      },
      getStatus() {
        return { type: 'aider', watching: null, waiting: filePath, stopped };
      },
    };
  }

  function startFileWatch() {
    try {
      const stat = fs.statSync(filePath);
      lastOffset = stat.size;
    } catch {
      lastOffset = 0;
    }

    watcher = fs.watch(filePath, { persistent: false }, (eventType) => {
      if (eventType === 'change' && !stopped) {
        const { turns, newOffset } = parseNewTurns(filePath, lastOffset);
        if (turns.length > 0) {
          lastOffset = newOffset;
          onNewTurns(turns, 'aider');
        }
      }
    });

    watcher.on('error', () => { watcher = null; });
  }

  startFileWatch();

  return {
    stop() {
      stopped = true;
      if (watcher) { watcher.close(); watcher = null; }
    },
    getStatus() {
      return {
        type: 'aider',
        watching: 'aider',
        file: filePath,
        offset: lastOffset,
        stopped,
      };
    },
  };
}
