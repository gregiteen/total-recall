/**
 * generic.mjs — Generic Conversation Watcher
 *
 * A config-driven watcher that works with ANY conversation file format.
 * The user specifies:
 *   - path: Path to the conversation file or directory to watch
 *   - format: 'jsonl' | 'markdown' | 'plaintext'
 *   - rolePattern: Regex to detect role boundaries (optional, for markdown/plaintext)
 *
 * Config example in totalrecall.config.mjs:
 *   watchers: [{ name: 'generic', path: '~/my-ide/chat.log', format: 'plaintext' }]
 *
 * This watcher can be used for:
 *   - Aider (.aider.chat.history.md)
 *   - Copilot CLI session files
 *   - Any IDE with a chat log file
 */

import fs from 'fs';
import path from 'path';

// ─── FORMAT PARSERS ─────────────────────────────────────────────────────────────

/**
 * Parse JSONL format — one JSON object per line with role/content fields.
 * @param {string} content - New content to parse
 * @returns {Array<{role: string, text: string}>}
 */
function parseJsonl(content) {
  const turns = [];
  const lines = content.split('\n').filter(l => l.trim());

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      // Try common field names
      const role = entry.role || entry.type || entry.sender || 'unknown';
      const normalizedRole = role === 'user' || role === 'human' ? 'user'
        : role === 'assistant' || role === 'model' || role === 'ai' ? 'model'
        : null;

      if (!normalizedRole) continue;

      const text = typeof entry.content === 'string' ? entry.content
        : typeof entry.message === 'string' ? entry.message
        : typeof entry.text === 'string' ? entry.text
        : '';

      if (text.trim()) {
        turns.push({ role: normalizedRole, text });
      }
    } catch {
      // Skip malformed lines
    }
  }
  return turns;
}

/**
 * Parse markdown format — role headers followed by content blocks.
 * Common patterns:
 *   # USER / # ASSISTANT
 *   ## User / ## Assistant
 *   **User:** / **Assistant:**
 *   > User: / > Assistant:
 *
 * @param {string} content - New content to parse
 * @param {RegExp} [rolePattern] - Custom regex for role detection
 * @returns {Array<{role: string, text: string}>}
 */
function parseMarkdown(content, rolePattern) {
  const pattern = rolePattern || /^(?:#{1,3}\s+|>\s*|\*\*)(user|human|assistant|ai|model|system)[\s:*]*/im;
  const turns = [];
  const lines = content.split('\n');
  let currentRole = null;
  let currentLines = [];

  for (const line of lines) {
    const match = line.match(pattern);
    if (match) {
      // Flush previous turn
      if (currentRole && currentLines.length > 0) {
        turns.push({ role: currentRole, text: currentLines.join('\n').trim() });
      }
      const rawRole = match[1].toLowerCase();
      currentRole = (rawRole === 'user' || rawRole === 'human') ? 'user' : 'model';
      currentLines = [];
    } else if (currentRole) {
      currentLines.push(line);
    }
  }

  // Flush last turn
  if (currentRole && currentLines.length > 0) {
    turns.push({ role: currentRole, text: currentLines.join('\n').trim() });
  }

  return turns;
}

/**
 * Parse plaintext format — simple line-based with role prefixes.
 * Patterns: [USER] text, [MODEL] text, User: text, AI: text
 *
 * @param {string} content - New content to parse
 * @returns {Array<{role: string, text: string}>}
 */
function parsePlaintext(content) {
  const turns = [];
  const lines = content.split('\n');
  let currentRole = null;
  let currentLines = [];

  for (const line of lines) {
    const match = line.match(/^\[?(USER|HUMAN|MODEL|ASSISTANT|AI|SYSTEM)\]?\s*:?\s*(.*)/i);
    if (match) {
      if (currentRole && currentLines.length > 0) {
        turns.push({ role: currentRole, text: currentLines.join('\n').trim() });
      }
      const rawRole = match[1].toLowerCase();
      currentRole = (rawRole === 'user' || rawRole === 'human') ? 'user' : 'model';
      currentLines = match[2] ? [match[2]] : [];
    } else if (currentRole) {
      currentLines.push(line);
    }
  }

  if (currentRole && currentLines.length > 0) {
    turns.push({ role: currentRole, text: currentLines.join('\n').trim() });
  }

  return turns;
}

// ─── FORMAT DISPATCH ────────────────────────────────────────────────────────────

const PARSERS = {
  jsonl: parseJsonl,
  markdown: parseMarkdown,
  plaintext: parsePlaintext,
};

/**
 * Parse new content from a file since last offset.
 *
 * @param {string} filePath - Path to conversation file
 * @param {number} lastOffset - Byte offset of last read
 * @param {string} format - 'jsonl' | 'markdown' | 'plaintext'
 * @param {RegExp} [rolePattern] - Custom role regex for markdown
 * @returns {{ turns: Array<{role: string, text: string}>, newOffset: number }}
 */
export function parseNewTurns(filePath, lastOffset, format, rolePattern) {
  const stat = fs.statSync(filePath);
  if (stat.size <= lastOffset) {
    return { turns: [], newOffset: lastOffset };
  }

  const fd = fs.openSync(filePath, 'r');
  const buffer = Buffer.alloc(stat.size - lastOffset);
  fs.readSync(fd, buffer, 0, buffer.length, lastOffset);
  fs.closeSync(fd);

  const content = buffer.toString('utf-8');
  const parser = PARSERS[format] || parsePlaintext;
  const turns = format === 'markdown' ? parser(content, rolePattern) : parser(content);

  return { turns, newOffset: stat.size };
}

// ─── CREATE WATCHER ─────────────────────────────────────────────────────────────

/**
 * Create a generic watcher for any conversation file.
 *
 * @param {Object} options
 * @param {Function} options.onNewTurns - Callback: (turns, conversationId) => void
 * @param {string} options.path - Path to conversation file to watch
 * @param {string} [options.format='plaintext'] - File format: jsonl|markdown|plaintext
 * @param {RegExp} [options.rolePattern] - Custom role detection regex (for markdown)
 * @param {string} [options.conversationId] - Override conversation ID (defaults to filename)
 * @returns {{ stop: Function, getStatus: Function }}
 */
export function createWatcher({ onNewTurns, path: watchPath, format = 'plaintext', rolePattern, conversationId }) {
  const resolvedPath = watchPath.replace(/^~/, process.env.HOME || '');
  const convId = conversationId || path.basename(resolvedPath, path.extname(resolvedPath));
  let watcher = null;
  let lastOffset = 0;
  let stopped = false;

  if (!fs.existsSync(resolvedPath)) {
    console.error(`⚠️  Generic watcher: file not found: ${resolvedPath}`);
    return {
      stop() { stopped = true; },
      getStatus() { return { type: 'generic', watching: null, error: 'File not found', stopped: true }; },
    };
  }

  // Start from current file size
  try {
    const stat = fs.statSync(resolvedPath);
    lastOffset = stat.size;
  } catch {
    lastOffset = 0;
  }

  watcher = fs.watch(resolvedPath, { persistent: false }, (eventType) => {
    if (eventType === 'change' && !stopped) {
      const { turns, newOffset } = parseNewTurns(resolvedPath, lastOffset, format, rolePattern);
      if (turns.length > 0) {
        lastOffset = newOffset;
        onNewTurns(turns, convId);
      }
    }
  });

  watcher.on('error', () => {
    watcher = null;
  });

  return {
    stop() {
      stopped = true;
      if (watcher) {
        watcher.close();
        watcher = null;
      }
    },
    getStatus() {
      return {
        type: 'generic',
        watching: convId,
        file: resolvedPath,
        format,
        offset: lastOffset,
        stopped,
      };
    },
  };
}
