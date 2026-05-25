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
 * SSSS session JSONL to .agent/skills/total-recall/sessions/.
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
    filter: (filename) => filename === 'overview.txt' || filename === 'transcript.jsonl',
    adapter: parseAntigravity,
  },
  {
    name: 'cursor',
    root: path.join(HOME, '.cursor', 'projects'),
    filter: (filename) => filename.endsWith('.jsonl'),
    adapter: parseCursor,
  },
  {
    name: 'vscode',
    // VS Code Copilot Chat stores sessions per workspace under globalStorage
    root: (() => {
      if (process.platform === 'darwin') {
        return path.join(HOME, 'Library', 'Application Support', 'Code', 'User', 'workspaceStorage');
      } else if (process.platform === 'win32') {
        return path.join(HOME, 'AppData', 'Roaming', 'Code', 'User', 'workspaceStorage');
      } else {
        return path.join(HOME, '.config', 'Code', 'User', 'workspaceStorage');
      }
    })(),
    filter: (filename) => filename.endsWith('.jsonl'),
    // Only descend into chatSessions subdirs, ignore everything else
    dirFilter: (dirName) => dirName === 'chatSessions',
    adapter: parseVSCode,
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
 *
 * Claude Code JSONL format (actual, verified from ~/.claude/projects/):
 *   { parentUuid, uuid, timestamp, type, message: { role, content }, sessionId, cwd, ... }
 *
 * The content field inside message follows the Anthropic API format:
 *   - string  (user messages)
 *   - array of content blocks: [{ type: 'text', text: '...' }, { type: 'tool_use', ... }]
 *
 * Legacy lines may have role/content at the top level — we fall back gracefully.
 */
export function parseClaudeCode(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split('\n').filter(Boolean);
  const entries = [];
  // Build uuid→id map so we can preserve the real parent DAG
  const uuidToId = new Map();

  for (const line of lines) {
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue; // skip malformed lines
    }

    const id = crypto.randomBytes(4).toString('hex');

    // ── Resolve parent ──────────────────────────────────────────────────────
    const parentUuid = parsed.parentUuid || null;
    let parentId = parentUuid ? (uuidToId.get(parentUuid) ?? null) : null;
    if (!parentId && entries.length > 0) {
      parentId = entries[entries.length - 1].id;
    }
    if (parsed.uuid) uuidToId.set(parsed.uuid, id);

    // ── Extract role & content ───────────────────────────────────────────────
    // Real Claude Code format: role/content inside parsed.message
    // Legacy/fallback: role/content at top level
    const msgObj   = parsed.message || parsed;
    const role     = msgObj.role || parsed.type || 'assistant';
    const rawContent = msgObj.content ?? '';

    let content = '';
    if (typeof rawContent === 'string') {
      content = rawContent;
    } else if (Array.isArray(rawContent)) {
      content = rawContent
        .map((block) => {
          if (block.type === 'text') return block.text || '';
          if (block.type === 'tool_use') return `[tool_use: ${block.name}]`;
          if (block.type === 'tool_result') {
            const c = block.content;
            if (typeof c === 'string') return `[tool_result] ${c}`;
            if (Array.isArray(c)) return c.filter(b => b.type === 'text').map(b => b.text).join(' ');
          }
          return '';
        })
        .filter(Boolean)
        .join('\n');
    }

    // Inspect tool_use or tool_calls payloads
    const toolUse = msgObj.tool_use || parsed.tool_use || null;
    const toolCalls = msgObj.tool_calls || parsed.tool_calls || null;

    if (toolUse && toolUse.name) {
      const toolSig = `[tool: ${toolUse.name}]`;
      if (!content.includes(toolSig)) {
        content = content ? `${toolSig} ${content}` : toolSig;
      }
    }

    if (Array.isArray(toolCalls)) {
      for (const tc of toolCalls) {
        const name = tc.function?.name || tc.name;
        if (name) {
          const toolSig = `[tool: ${name}]`;
          if (!content.includes(toolSig)) {
            content = content ? `${toolSig} ${content}` : toolSig;
          }
        }
      }
    } else if (toolCalls && typeof toolCalls === 'object') {
      const name = toolCalls.function?.name || toolCalls.name;
      if (name) {
        const toolSig = `[tool: ${name}]`;
        if (!content.includes(toolSig)) {
          content = content ? `${toolSig} ${content}` : toolSig;
        }
      }
    }

    // ── Map role → SSSS entry type ───────────────────────────────────────────
    let type = 'observation';
    if (role === 'user') {
      type = 'task';
    } else if (role === 'tool' || role === 'tool_result' || toolUse || toolCalls || (role === 'assistant' && (content.includes('[tool_use:') || content.includes('[tool:')))) {
      type = 'tool_call';
    }

    if (!content.trim()) continue; // skip empty lines (sidechain warmups, etc.)

    entries.push(
      createSessionEntry({
        id,
        parentId,
        type,
        ts: parsed.timestamp || msgObj.timestamp || new Date().toISOString(),
        content: content.slice(0, 5000), // cap individual entries
        role,
        source: 'claude-code',
      }),
    );
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

  if (path.basename(filePath) === 'transcript.jsonl') {
    const lines = raw.split('\n').filter(Boolean);
    const entries = [];
    let prevId = null;

    for (const line of lines) {
      let data;
      try {
        data = JSON.parse(line);
      } catch {
        continue;
      }

      if (data.type === 'USER_INPUT') {
        const id = crypto.randomBytes(4).toString('hex');
        let cleanContent = data.content || '';
        if (cleanContent.includes('<USER_REQUEST>')) {
          const match = cleanContent.match(/<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/);
          if (match) {
            cleanContent = match[1].trim();
          }
        }
        if (!cleanContent.trim()) continue;

        entries.push(
          createSessionEntry({
            id,
            parentId: prevId,
            type: 'task',
            ts: data.timestamp || new Date().toISOString(),
            content: cleanContent.slice(0, 5000),
            role: 'user',
            source: 'antigravity',
          })
        );
        prevId = id;
      } else if (
        data.source === 'MODEL' &&
        (data.type === 'PLANNER_RESPONSE' || data.type === 'RESPONSE' || data.type === 'model_response')
      ) {
        let content = data.content || '';
        if (!content.trim()) continue;

        const id = crypto.randomBytes(4).toString('hex');
        entries.push(
          createSessionEntry({
            id,
            parentId: prevId,
            type: 'observation',
            ts: data.timestamp || new Date().toISOString(),
            content: content.slice(0, 5000),
            role: 'assistant',
            source: 'antigravity',
          })
        );
        prevId = id;
      }
    }
    return entries;
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

/**
 * VS Code Copilot Chat adapter.
 * Stores sessions as JSONL under:
 *   ~/Library/Application Support/Code/User/workspaceStorage/<id>/chatSessions/<session>.jsonl
 *
 * Each file is a sequence of delta records:
 *   kind:0 — session header (initialises the session object)
 *   kind:1 — patch (key/value updates to session state)
 *   kind:2 — requests array update (the actual chat turns)
 */
export function parseVSCode(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split('\n').filter(Boolean);
  const entries = [];
  let sessionTitle = '';
  let prevId = null;

  // Reconstruct the full requests list by replaying kind:2 patches
  const requests = [];
  for (const line of lines) {
    let rec;
    try { rec = JSON.parse(line); } catch { continue; }

    if (rec.kind === 1 && Array.isArray(rec.k) && rec.k.includes('customTitle')) {
      sessionTitle = rec.v || '';
    }
    if (rec.kind === 2 && Array.isArray(rec.k) && rec.k.includes('requests')) {
      // Merge into requests array
      const incoming = Array.isArray(rec.v) ? rec.v : [];
      for (const req of incoming) {
        if (!requests.find((r) => r.requestId === req.requestId)) {
          requests.push(req);
        }
      }
    }
  }

  for (const req of requests) {
    const ts = req.timestamp ? new Date(req.timestamp).toISOString() : new Date().toISOString();

    // User turn
    const userText = typeof req.message?.text === 'string' ? req.message.text : '';
    if (userText) {
      const id = crypto.randomBytes(4).toString('hex');
      entries.push(createSessionEntry({
        id, parentId: prevId, type: 'task', ts,
        content: userText.slice(0, 5000), role: 'user', source: 'vscode',
      }));
      prevId = id;
    }

    // Assistant response(s)
    const responseText = req.response?.response?.value || req.response?.value || '';
    if (responseText) {
      const id = crypto.randomBytes(4).toString('hex');
      entries.push(createSessionEntry({
        id, parentId: prevId, type: 'observation', ts,
        content: responseText.slice(0, 5000), role: 'assistant', source: 'vscode',
      }));
      prevId = id;
    }
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
 * @param {string}   derivedDir  Path to .agent/skills/total-recall/memory-derived/
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
 * @param {string} sessionsDir  Path to .agent/skills/total-recall/sessions/
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

  const jsonl = entries.map((e) => JSON.stringify(e)).join('\n') + '\n';

  // Skip if already ingested and unchanged
  if (fs.existsSync(sessionFile)) {
    try {
      if (fs.readFileSync(sessionFile, 'utf8') === jsonl) {
        return null;
      }
    } catch { /* ignore */ }
  }

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
function findFiles(root, filter, maxDepth = 5, dirFilter = null) {
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
        // If a dirFilter is set, only recurse into matching dirs (or any dir at depth 0)
        if (!dirFilter || depth === 0 || dirFilter(entry.name)) {
          walk(fullPath, depth + 1);
        }
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
 * @param {string} sessionsDir  Path to .agent/skills/total-recall/sessions/
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

    const files = findFiles(source.root, source.filter, 5, source.dirFilter || null);
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
 * @param {string} sessionsDir  Path to .agent/skills/total-recall/sessions/
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
      let watchOpts = {};
      if (process.platform === 'darwin' || process.platform === 'win32') {
        watchOpts.recursive = true;
      }

      let watcher;
      const callback = (eventType, filename) => {
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
      };

      try {
        watcher = fs.watch(source.root, watchOpts, callback);
      } catch (watchErr) {
        logger.info({
          subsystem: 'session-watcher',
          message: `Recursive watch fallback on ${process.platform}: ${watchErr.message}`,
        });
        watcher = fs.watch(source.root, {}, callback);
      }

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
