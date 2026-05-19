import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { atomicWrite } from './vault.mjs';
import { logger } from './logger.mjs';

/**
 * Total Recall Session Watcher
 *
 * Watches known IDE agent conversation log directories for new files,
 * parses them through source-specific adapters, and writes unified
 * SSSS session JSONL to .agent/sessions/.
 *
 * Supported sources:
 *   - Claude Code   (~/.claude/projects/)           JSONL
 *   - OpenAI Codex  (~/.codex/sessions/)             JSONL
 *   - Gemini CLI    (~/.gemini/tmp/)                  JSON
 *   - Antigravity   (~/.gemini/antigravity/brain/)    plaintext overview.txt
 *   - Cursor        (~/.cursor/projects/)             JSONL
 */

// ─── Source Definitions ─────────────────────────────────────────────────────────

const HOME = os.homedir();

/**
 * Each source specifies a root directory to watch, a glob/filter for relevant
 * files, and an adapter function that converts the source format to an array
 * of unified SSSS session entries.
 */
const SOURCES = [
  {
    name: 'claude-code',
    root: path.join(HOME, '.claude', 'projects'),
    filter: (filename) => filename.endsWith('.jsonl'),
    adapter: parseClaudeCode,
  },
  {
    name: 'codex',
    root: path.join(HOME, '.codex', 'sessions'),
    filter: (filename) => filename.endsWith('.jsonl'),
    adapter: parseCodex,
  },
  {
    name: 'gemini-cli',
    root: path.join(HOME, '.gemini', 'tmp'),
    filter: (filename) => filename.endsWith('.json'),
    adapter: parseGeminiCli,
  },
  {
    name: 'antigravity',
    root: path.join(HOME, '.gemini', 'antigravity', 'brain'),
    filter: (filename) => filename === 'overview.txt',
    adapter: parseAntigravity,
  },
  {
    name: 'cursor',
    root: path.join(HOME, '.cursor', 'projects'),
    filter: (filename) => filename.endsWith('.jsonl'),
    adapter: parseCursor,
  },
];

// ─── Unified Session Entry Format ───────────────────────────────────────────────

/**
 * Create a unified SSSS session entry.
 *
 * @param {object} opts
 * @param {string} opts.id         Unique entry ID
 * @param {string|null} opts.parentId  Parent entry ID (null for root)
 * @param {string} opts.type       Entry type: task | tool_call | observation | branch_summary
 * @param {string} opts.ts         ISO 8601 timestamp
 * @param {string} opts.content    The text content
 * @param {string} opts.role       Original role: user | assistant | system | tool
 * @param {string} opts.source     Source adapter name
 * @returns {object}
 */
export function createSessionEntry({
  id,
  parentId = null,
  type = 'observation',
  ts,
  content,
  role = 'assistant',
  source = 'unknown',
}) {
  return {
    id: id || crypto.randomBytes(4).toString('hex'),
    parentId,
    type,
    ts: ts || new Date().toISOString(),
    content: content || '',
    role,
    source,
  };
}

// ─── Adapters ───────────────────────────────────────────────────────────────────

/**
 * Claude Code adapter.
 * Claude Code writes JSONL to ~/.claude/projects/<project>/<session-id>.jsonl
 * Each line is a JSON object with role, content, and optional tool_use fields.
 */
export function parseClaudeCode(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split('\n').filter(Boolean);
  const entries = [];
  let prevId = null;

  for (const line of lines) {
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue; // skip malformed lines
    }

    const id = crypto.randomBytes(4).toString('hex');
    const role = parsed.role || 'assistant';

    // Map Claude roles to SSSS entry types
    let type = 'observation';
    if (role === 'user') type = 'task';
    else if (role === 'assistant' && parsed.tool_use) type = 'tool_call';
    else if (role === 'tool') type = 'tool_call';

    // Extract content — Claude may nest it in content blocks
    let content = '';
    if (typeof parsed.content === 'string') {
      content = parsed.content;
    } else if (Array.isArray(parsed.content)) {
      content = parsed.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('\n');
    }
    if (parsed.tool_use) {
      content = `[tool: ${parsed.tool_use.name}] ${content}`;
    }

    entries.push(
      createSessionEntry({
        id,
        parentId: prevId,
        type,
        ts: parsed.timestamp || new Date().toISOString(),
        content: content.slice(0, 5000), // cap individual entries
        role,
        source: 'claude-code',
      }),
    );
    prevId = id;
  }

  return entries;
}

/**
 * OpenAI Codex adapter.
 * Codex writes JSONL to ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl
 * Each line has type, content, and tool call results.
 */
export function parseCodex(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split('\n').filter(Boolean);
  const entries = [];
  let prevId = null;

  for (const line of lines) {
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }

    const id = crypto.randomBytes(4).toString('hex');
    const role = parsed.role || 'assistant';

    let type = 'observation';
    if (role === 'user') type = 'task';
    else if (parsed.type === 'tool_call' || parsed.tool_calls) type = 'tool_call';

    let content = '';
    if (typeof parsed.content === 'string') {
      content = parsed.content;
    } else if (parsed.message) {
      content = typeof parsed.message === 'string' ? parsed.message : JSON.stringify(parsed.message);
    }
    if (parsed.tool_calls) {
      const toolNames = parsed.tool_calls.map((tc) => tc.function?.name || 'unknown').join(', ');
      content = `[tools: ${toolNames}] ${content}`;
    }

    entries.push(
      createSessionEntry({
        id,
        parentId: prevId,
        type,
        ts: parsed.timestamp || parsed.ts || new Date().toISOString(),
        content: content.slice(0, 5000),
        role,
        source: 'codex',
      }),
    );
    prevId = id;
  }

  return entries;
}

/**
 * Gemini CLI adapter.
 * Gemini CLI saves chat sessions as JSON in ~/.gemini/tmp/<hash>/chats/
 * The JSON contains a messages[] array.
 */
export function parseGeminiCli(filePath) {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return [];
  }

  const messages = data.messages || data.history || [];
  if (!Array.isArray(messages)) return [];

  const entries = [];
  let prevId = null;

  for (const msg of messages) {
    const id = crypto.randomBytes(4).toString('hex');
    const role = msg.role || 'model';
    const type = role === 'user' ? 'task' : 'observation';

    let content = '';
    if (typeof msg.parts === 'string') {
      content = msg.parts;
    } else if (Array.isArray(msg.parts)) {
      content = msg.parts
        .filter((p) => typeof p === 'string' || p.text)
        .map((p) => (typeof p === 'string' ? p : p.text))
        .join('\n');
    } else if (typeof msg.content === 'string') {
      content = msg.content;
    }

    entries.push(
      createSessionEntry({
        id,
        parentId: prevId,
        type,
        ts: msg.timestamp || msg.create_time || new Date().toISOString(),
        content: content.slice(0, 5000),
        role: role === 'model' ? 'assistant' : role,
        source: 'gemini-cli',
      }),
    );
    prevId = id;
  }

  return entries;
}

/**
 * Antigravity adapter.
 * Antigravity stores conversation artifacts at:
 * ~/.gemini/antigravity/brain/<conversation-id>/.system_generated/logs/overview.txt
 * These are plaintext transcripts that we parse heuristically.
 */
export function parseAntigravity(filePath) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch {
    return [];
  }

  // overview.txt is a line-by-line action log
  // Each line typically starts with a role indicator or action description
  const lines = raw.split('\n').filter(Boolean);
  const entries = [];
  let prevId = null;

  for (const line of lines) {
    const id = crypto.randomBytes(4).toString('hex');
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Heuristic: detect role from line patterns
    let role = 'assistant';
    let type = 'observation';

    if (trimmed.startsWith('USER:') || trimmed.startsWith('User:') || trimmed.startsWith('[user]')) {
      role = 'user';
      type = 'task';
    } else if (trimmed.startsWith('TOOL:') || trimmed.startsWith('[tool]') || trimmed.includes('tool_call')) {
      role = 'tool';
      type = 'tool_call';
    }

    entries.push(
      createSessionEntry({
        id,
        parentId: prevId,
        type,
        content: trimmed.slice(0, 5000),
        role,
        source: 'antigravity',
      }),
    );
    prevId = id;
  }

  return entries;
}

/**
 * Cursor adapter.
 * Newer Cursor versions write JSONL transcripts to ~/.cursor/projects/
 * Format is similar to Claude Code.
 */
export function parseCursor(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split('\n').filter(Boolean);
  const entries = [];
  let prevId = null;

  for (const line of lines) {
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }

    const id = crypto.randomBytes(4).toString('hex');
    const role = parsed.role || 'assistant';

    let type = 'observation';
    if (role === 'user') type = 'task';
    else if (parsed.type === 'tool_call') type = 'tool_call';

    const content = typeof parsed.content === 'string'
      ? parsed.content
      : JSON.stringify(parsed.content || '');

    entries.push(
      createSessionEntry({
        id,
        parentId: prevId,
        type,
        ts: parsed.timestamp || parsed.ts || new Date().toISOString(),
        content: content.slice(0, 5000),
        role,
        source: 'cursor',
      }),
    );
    prevId = id;
  }

  return entries;
}

// ─── Session Writer ─────────────────────────────────────────────────────────────

// ─── Content-Hash Deduplication ─────────────────────────────────────────────────

const CONTENT_HASH_INDEX = 'content-hashes.jsonl';

/**
 * SHA-256 fingerprint of an entry's content field.
 * Two entries with identical content get the same fingerprint regardless of
 * source, timestamp, or id — so the same fact from two IDE sources collapses.
 */
export function contentFingerprint(entry) {
  return crypto.createHash('sha256').update(String(entry.content || '')).digest('hex');
}

/**
 * Load the set of already-seen content hashes from the derived index.
 * Returns a Set<string>.
 */
export function loadSeenHashes(derivedDir) {
  const indexFile = path.join(derivedDir, CONTENT_HASH_INDEX);
  if (!fs.existsSync(indexFile)) return new Set();
  const seen = new Set();
  for (const line of fs.readFileSync(indexFile, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { seen.add(JSON.parse(line).sha256); } catch { /* corrupt line */ }
  }
  return seen;
}

/**
 * Filter `entries` to remove those whose content hash is already in `seen`.
 * Appends new hashes to the derived index file and returns the unique entries.
 *
 * @param {object[]} entries   Session entries to deduplicate
 * @param {string}   derivedDir  Path to .agent/memory-derived/
 * @param {string}   [source]    Source name for index provenance
 * @returns {{ unique: object[], duplicates: number }}
 */
export function deduplicateByContent(entries, derivedDir, source = 'unknown') {
  if (!derivedDir) return { unique: entries, duplicates: 0 };
  const seen = loadSeenHashes(derivedDir);
  const unique = [];
  const newLines = [];

  for (const entry of entries) {
    const sha256 = contentFingerprint(entry);
    if (seen.has(sha256)) continue;
    seen.add(sha256);
    unique.push(entry);
    newLines.push(JSON.stringify({ sha256, source, ts: new Date().toISOString() }));
  }

  if (newLines.length) {
    if (!fs.existsSync(derivedDir)) fs.mkdirSync(derivedDir, { recursive: true });
    fs.appendFileSync(path.join(derivedDir, CONTENT_HASH_INDEX), newLines.join('\n') + '\n', 'utf8');
  }

  return { unique, duplicates: entries.length - unique.length };
}

/**
 * Write parsed session entries to the sessions directory as JSONL.
 *
 * @param {object[]} entries  Array of unified session entries
 * @param {string} sessionsDir  Path to .agent/sessions/
 * @param {string} sourceFile   Original source file path (used for dedup)
 * @returns {string} Path to the written session file
 */
export function writeSession(entries, sessionsDir, sourceFile) {
  if (!entries.length) return null;
  if (!fs.existsSync(sessionsDir)) {
    fs.mkdirSync(sessionsDir, { recursive: true });
  }

  // Generate a deterministic session ID from the source file path
  // so re-ingesting the same file doesn't create duplicates
  const sourceHash = crypto.createHash('sha256').update(sourceFile).digest('hex').slice(0, 12);
  const sessionFile = path.join(sessionsDir, `${sourceHash}.jsonl`);

  // Skip if already ingested
  if (fs.existsSync(sessionFile)) {
    return null;
  }

  const jsonl = entries.map((e) => JSON.stringify(e)).join('\n') + '\n';
  atomicWrite(sessionFile, jsonl);

  logger.info({
    subsystem: 'session-watcher',
    message: `Ingested ${entries.length} entries from ${path.basename(sourceFile)} → ${path.basename(sessionFile)}`,
  });

  return sessionFile;
}

// ─── File Discovery ─────────────────────────────────────────────────────────────

/**
 * Recursively find files matching a filter under a root directory.
 * Limits depth to 5 levels to avoid runaway scans.
 */
function findFiles(root, filter, maxDepth = 5) {
  const results = [];
  if (!fs.existsSync(root)) return results;

  function walk(dir, depth) {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // permission denied, etc.
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath, depth + 1);
      } else if (entry.isFile() && filter(entry.name)) {
        results.push(fullPath);
      }
    }
  }

  walk(root, 0);
  return results;
}

// ─── Scan & Ingest ──────────────────────────────────────────────────────────────

/**
 * Scan all known IDE sources and ingest any new conversation files.
 *
 * @param {string} sessionsDir  Path to .agent/sessions/
 * @param {object} [opts]
 * @param {string[]} [opts.enabledSources]  Only scan these sources (default: all)
 * @returns {{ ingested: number, sources: object[] }}
 */
export function scanAndIngest(sessionsDir, opts = {}) {
  const enabledSources = opts.enabledSources || SOURCES.map((s) => s.name);
  const derivedDir = opts.derivedDir || null;
  const results = [];
  let totalIngested = 0;
  let totalDuplicates = 0;

  for (const source of SOURCES) {
    if (!enabledSources.includes(source.name)) continue;
    if (!fs.existsSync(source.root)) {
      results.push({ name: source.name, status: 'not-found', files: 0 });
      continue;
    }

    const files = findFiles(source.root, source.filter);
    let ingested = 0;

    for (const file of files) {
      try {
        let entries = source.adapter(file);
        if (entries.length > 0) {
          // Content-hash dedup: collapse identical facts from multiple sources
          if (derivedDir) {
            const { unique, duplicates } = deduplicateByContent(entries, derivedDir, source.name);
            totalDuplicates += duplicates;
            entries = unique;
          }
          if (entries.length > 0) {
            const written = writeSession(entries, sessionsDir, file);
            if (written) {
              ingested++;
              totalIngested++;
            }
          }
        }
      } catch (err) {
        logger.info({
          subsystem: 'session-watcher',
          message: `Failed to ingest ${file}: ${err.message}`,
        });
      }
    }

    results.push({ name: source.name, status: 'scanned', files: ingested });
  }

  return { ingested: totalIngested, duplicates: totalDuplicates, sources: results };
}

// ─── File Watcher (Daemon Mode) ─────────────────────────────────────────────────

/**
 * Start watching all known IDE source directories for new conversation files.
 * Returns a cleanup function to stop all watchers.
 *
 * @param {string} sessionsDir  Path to .agent/sessions/
 * @param {object} [opts]
 * @param {string[]} [opts.enabledSources]  Only watch these sources (default: all)
 * @returns {{ stop: () => void }}
 */
export function startWatching(sessionsDir, opts = {}) {
  const enabledSources = opts.enabledSources || SOURCES.map((s) => s.name);
  const watchers = [];

  for (const source of SOURCES) {
    if (!enabledSources.includes(source.name)) continue;
    if (!fs.existsSync(source.root)) continue;

    try {
      const watcher = fs.watch(source.root, { recursive: true }, (eventType, filename) => {
        if (!filename || !source.filter(path.basename(filename))) return;

        const fullPath = path.join(source.root, filename);
        if (!fs.existsSync(fullPath)) return; // deleted

        // Small delay to let the file finish writing
        setTimeout(() => {
          try {
            const entries = source.adapter(fullPath);
            if (entries.length > 0) {
              writeSession(entries, sessionsDir, fullPath);
            }
          } catch (err) {
            logger.info({
              subsystem: 'session-watcher',
              message: `Watch handler error for ${filename}: ${err.message}`,
            });
          }
        }, 500);
      });

      watchers.push(watcher);
      logger.info({
        subsystem: 'session-watcher',
        message: `Watching ${source.name}: ${source.root}`,
      });
    } catch (err) {
      logger.info({
        subsystem: 'session-watcher',
        message: `Cannot watch ${source.name} (${source.root}): ${err.message}`,
      });
    }
  }

  return {
    stop() {
      for (const w of watchers) {
        try { w.close(); } catch { /* ignore */ }
      }
      logger.info({
        subsystem: 'session-watcher',
        message: `Stopped ${watchers.length} watchers.`,
      });
    },
  };
}
