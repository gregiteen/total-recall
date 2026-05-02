/**
 * cursor.mjs — Cursor IDE Conversation Watcher
 *
 * Watches Cursor's workspace storage for conversation updates.
 * Path pattern: ~/Library/Application Support/Cursor/User/workspaceStorage/{hash}/
 *
 * Cursor stores conversations in a SQLite database (state.vscdb) and/or
 * JSONL transcript files. This watcher supports both formats.
 *
 * Since Cursor's internal storage is complex and varies by version,
 * this watcher uses a directory polling approach to detect changes
 * and parses the most recent conversation files.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

// ─── CONSTANTS ──────────────────────────────────────────────────────────────────

const CURSOR_STORAGE = path.join(
  os.homedir(),
  'Library', 'Application Support', 'Cursor', 'User', 'workspaceStorage'
);

// ─── FIND ACTIVE WORKSPACE ─────────────────────────────────────────────────────

/**
 * Find the most recently modified Cursor workspace storage directory.
 * @returns {{ workspaceDir: string, hash: string } | null}
 */
function findActiveWorkspace() {
  if (!fs.existsSync(CURSOR_STORAGE)) return null;

  const entries = fs.readdirSync(CURSOR_STORAGE, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => {
      const dirPath = path.join(CURSOR_STORAGE, d.name);
      try {
        return { hash: d.name, dir: dirPath, mtime: fs.statSync(dirPath).mtimeMs };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.mtime - a.mtime);

  return entries.length > 0 ? { workspaceDir: entries[0].dir, hash: entries[0].hash } : null;
}

/**
 * Find conversation-related files in a workspace directory.
 * Cursor uses various file patterns depending on version.
 * @param {string} workspaceDir
 * @returns {string[]} Sorted by mtime (newest first)
 */
function findConversationFiles(workspaceDir) {
  const candidates = [];

  // Look for JSONL/JSON conversation files
  try {
    const walk = (dir, depth = 0) => {
      if (depth > 3) return; // Don't recurse too deep
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath, depth + 1);
        } else if (
          entry.name.endsWith('.jsonl') ||
          entry.name.includes('chat') ||
          entry.name.includes('conversation') ||
          entry.name.includes('composer')
        ) {
          try {
            candidates.push({ path: fullPath, mtime: fs.statSync(fullPath).mtimeMs });
          } catch { /* skip */ }
        }
      }
    };
    walk(workspaceDir);
  } catch { /* skip */ }

  return candidates.sort((a, b) => b.mtime - a.mtime).map(c => c.path);
}

// ─── PARSE JSONL TURNS ──────────────────────────────────────────────────────────

/**
 * Parse new JSONL turns from a Cursor conversation file.
 * Cursor JSONL varies by version but commonly has role/content fields.
 *
 * @param {string} filePath
 * @param {number} lastOffset
 * @returns {{ turns: Array<{role: string, text: string}>, newOffset: number }}
 */
export function parseNewTurns(filePath, lastOffset = 0) {
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return { turns: [], newOffset: lastOffset };
  }

  if (stat.size <= lastOffset) {
    return { turns: [], newOffset: lastOffset };
  }

  const fd = fs.openSync(filePath, 'r');
  const buffer = Buffer.alloc(stat.size - lastOffset);
  fs.readSync(fd, buffer, 0, buffer.length, lastOffset);
  fs.closeSync(fd);

  const content = buffer.toString('utf-8');
  const lines = content.split('\n').filter(l => l.trim());
  const turns = [];

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      const role = entry.role || entry.type || entry.sender;
      const normalizedRole = (role === 'user' || role === 'human') ? 'user'
        : (role === 'assistant' || role === 'model' || role === 'ai') ? 'model'
        : null;

      if (!normalizedRole) continue;

      const text = typeof entry.content === 'string' ? entry.content
        : typeof entry.message === 'string' ? entry.message
        : Array.isArray(entry.content) ? entry.content.filter(b => b.type === 'text').map(b => b.text).join('\n')
        : '';

      if (text.trim()) {
        turns.push({ role: normalizedRole, text });
      }
    } catch {
      // Skip non-JSON lines
    }
  }

  return { turns, newOffset: stat.size };
}

// ─── CREATE WATCHER ─────────────────────────────────────────────────────────────

/**
 * Create a watcher for Cursor IDE conversations.
 *
 * @param {Object} options
 * @param {Function} options.onNewTurns - Callback: (turns, conversationId) => void
 * @param {number} [options.pollIntervalMs=5000] - How often to scan for changes
 * @returns {{ stop: Function, getStatus: Function }}
 */
export function createWatcher({ onNewTurns, pollIntervalMs = 5000 }) {
  let activeFile = null;
  let lastOffset = 0;
  let fileWatcher = null;
  let pollTimer = null;
  let stopped = false;

  function watchFile(filePath) {
    if (fileWatcher) {
      fileWatcher.close();
    }

    activeFile = filePath;

    try {
      const stat = fs.statSync(filePath);
      lastOffset = stat.size;
    } catch {
      lastOffset = 0;
    }

    fileWatcher = fs.watch(filePath, { persistent: false }, (eventType) => {
      if (eventType === 'change' && !stopped) {
        const { turns, newOffset } = parseNewTurns(filePath, lastOffset);
        if (turns.length > 0) {
          lastOffset = newOffset;
          const convId = path.basename(filePath, path.extname(filePath));
          onNewTurns(turns, `cursor-${convId}`);
        }
      }
    });

    fileWatcher.on('error', () => { fileWatcher = null; });
  }

  function poll() {
    if (stopped) return;

    const workspace = findActiveWorkspace();
    if (workspace) {
      const convFiles = findConversationFiles(workspace.workspaceDir);
      if (convFiles.length > 0 && convFiles[0] !== activeFile) {
        watchFile(convFiles[0]);
      }
    }

    pollTimer = setTimeout(poll, pollIntervalMs);
  }

  // Check if Cursor storage exists at all
  if (!fs.existsSync(CURSOR_STORAGE)) {
    return {
      stop() { stopped = true; },
      getStatus() { return { type: 'cursor', watching: null, error: 'Cursor not installed', stopped: true }; },
    };
  }

  poll();

  return {
    stop() {
      stopped = true;
      if (fileWatcher) { fileWatcher.close(); fileWatcher = null; }
      if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
    },
    getStatus() {
      return {
        type: 'cursor',
        watching: activeFile ? path.basename(activeFile) : null,
        file: activeFile,
        offset: lastOffset,
        stopped,
      };
    },
  };
}
