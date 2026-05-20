/**
 * src/server/mcp.mjs
 *
 * Total Recall MCP Server — canonical implementation per spec 2025-06-18.
 *
 * Transport:  StreamableHTTPServerTransport (single /mcp endpoint, POST + GET + DELETE)
 * Tools:      registerTool() with Zod inputSchema
 * Resources:  registerResource() for vault files and derived indexes
 * Session:    one McpServer instance per session (created on initialize)
 *
 * NEVER use SSEServerTransport (deprecated 2024-11-05).
 * NEVER use server.tool() (deprecated alias).
 */

import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { loadNodes, writeNode, deleteNode, createNodeFromMcpPayload } from '../core/vault.mjs';
import { executeCode } from './tools.mjs';
import { webSearch, loadResearchConfig } from '../core/source-adapters.mjs';
import { semanticSearch } from '../core/search.mjs';
import { listQueue, addToQueue } from '../core/research-queue.mjs';

// ─── Path helpers ───────────────────────────────────────────────────────────

function agentDir() {
  return process.env.AGENT_DIR || path.join(os.homedir(), '.agent');
}
function vaultDir()   { return path.join(agentDir(), 'memory-vault'); }
function skillsDir()  { return path.join(agentDir(), 'skills'); }
function derivedDir() { return path.join(agentDir(), 'memory-derived'); }

// ─── Session store ───────────────────────────────────────────────────────────
// Per spec: each session gets its own McpServer + transport.
// Key: session ID string  |  Value: StreamableHTTPServerTransport instance

/** @type {Map<string, StreamableHTTPServerTransport>} */
const transports = new Map();

// ─── Scope guards ─────────────────────────────────────────────────────────────
// Set TR_MCP_ALLOW_FS=0 or TR_MCP_ALLOW_SANDBOX=0 to disable on cloud brains.
// Both default to enabled (1) for local installs.
const ALLOW_FS      = process.env.TR_MCP_ALLOW_FS      !== '0';
const ALLOW_SANDBOX = process.env.TR_MCP_ALLOW_SANDBOX !== '0';


// ─── Server factory ─────────────────────────────────────────────────────────
// Creates a new McpServer with all tools and resources registered.
// Called once per session initialization.

function createMcpServer() {
  const server = new McpServer(
    { name: 'total-recall', version: '3.0.0' },
    { capabilities: { logging: {} } }
  );

  // ── Tools ──────────────────────────────────────────────────────────────────

  server.registerTool(
    'list_memory',
    {
      title: 'List Memory',
      description: 'List all SSSS memory node metadata (slug, title, category, tags). Does not include body content.',
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async () => {
      const nodes = loadNodes(vaultDir()).map(({ body, ...node }) => node);
      return { content: [{ type: 'text', text: JSON.stringify(nodes, null, 2) }] };
    }
  );

  server.registerTool(
    'read_memory',
    {
      title: 'Read Memory',
      description: 'Read one SSSS memory node by its slug. Returns full content.',
      inputSchema: {
        slug: z.string().describe('The slug of the memory node (e.g. "patterns/api-auth")')
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async ({ slug }) => {
      const node = loadNodes(vaultDir()).find(n => n.slug === slug);
      if (!node) return { content: [{ type: 'text', text: `Memory node not found: ${slug}` }], isError: true };
      const { body, ...frontmatter } = node;
      return { content: [{ type: 'text', text: JSON.stringify({ ...frontmatter, content: body }, null, 2) }] };
    }
  );

  server.registerTool(
    'search_memory',
    {
      title: 'Search Memory',
      description: 'Search SSSS memory nodes by title, tags, slug, or body text. Returns matching node metadata.',
      inputSchema: {
        query: z.string().describe('Search query — matched against slug, title, category, tags, and body')
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async ({ query }) => {
      const q = String(query || '').toLowerCase();
      const results = loadNodes(vaultDir())
        .filter(node => [node.slug, node.title, node.category, (node.tags || []).join(' '), node.body]
          .join(' ').toLowerCase().includes(q))
        .map(({ body, ...node }) => node);
      return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
    }
  );

  server.registerTool(
    'write_memory',
    {
      title: 'Write Memory',
      description: 'Write a new SSSS memory node into the vault. Creates or overwrites. Also updates the semantic search index.',
      inputSchema: {
        slug:     z.string().describe('Unique slug (e.g. "patterns/my-pattern")'),
        title:    z.string().describe('Human-readable title'),
        category: z.string().describe('Category (e.g. "patterns", "concepts", "preferences")'),
        content:  z.string().describe('Markdown body content')
      },
      annotations: { readOnlyHint: false, openWorldHint: false }
    },
    async ({ slug, title, category, content }) => {
      const node = createNodeFromMcpPayload({ slug, title, category, content });
      writeNode(node, vaultDir());
      // Best-effort: update embeddings index so semantic_search stays current
      try {
        const { getEmbedding, saveEmbeddingToIndex, nodeToEmbedText } = await import('../core/embeddings.mjs');
        const embedding = await getEmbedding(nodeToEmbedText(node));
        saveEmbeddingToIndex(derivedDir(), node.slug, embedding);
      } catch { /* Ollama may not be running — non-fatal */ }
      return { content: [{ type: 'text', text: JSON.stringify({ slug: node.slug, written: true }) }] };
    }
  );

  server.registerTool(
    'delete_memory',
    {
      title: 'Delete Memory',
      description: 'Permanently delete an SSSS memory node from the vault by slug. Also removes it from the semantic search index.',
      inputSchema: {
        slug: z.string().describe('Slug of the node to delete (e.g. "patterns/old-pattern")')
      },
      annotations: { readOnlyHint: false, openWorldHint: false }
    },
    async ({ slug }) => {
      const deleted = deleteNode(slug, vaultDir());
      if (!deleted) return { content: [{ type: 'text', text: `Node not found: ${slug}` }], isError: true };
      // Remove from embeddings index too
      try {
        const { removeEmbeddingFromIndex } = await import('../core/embeddings.mjs');
        removeEmbeddingFromIndex(derivedDir(), slug);
      } catch { /* non-fatal */ }
      return { content: [{ type: 'text', text: JSON.stringify({ slug, deleted: true }) }] };
    }
  );

  server.registerTool(
    'semantic_search',
    {
      title: 'Semantic Search',
      description: 'Search across ALL vault nodes AND session history by meaning via vector similarity. Results merged and ranked by score. Each result has type: "vault" or "session". Requires Ollama with nomic-embed-text.',
      inputSchema: {
        query:            z.string().describe('Natural language query — a question, concept, or description'),
        top_k:            z.number().optional().describe('Number of results to return (default 5, max 20)'),
        include_sessions: z.boolean().optional().describe('Include raw session history in results (default: true)')
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async ({ query, top_k, include_sessions = true }) => {
      try {
        const results = await semanticSearch(query, { vaultDir: vaultDir(), derivedDir: derivedDir(), top_k, includeSessions: include_sessions });
        if (results.length === 0) return { content: [{ type: 'text', text: 'No embeddings found. Call recompile_surface first.' }], isError: true };
        return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Semantic search failed: ${err.message}\n\nMake sure Ollama is running: ollama pull nomic-embed-text` }], isError: true };
      }
    }
  );

  server.registerTool(
    'run_sandbox',
    {
      title: 'Run Sandbox',
      description: ALLOW_SANDBOX
        ? 'Execute JavaScript in the configured Total Recall sandbox.'
        : '(Disabled on this brain — set TR_MCP_ALLOW_SANDBOX=1 to enable)',
      inputSchema: {
        code: z.string().describe('JavaScript code to execute')
      },
      annotations: { readOnlyHint: false, openWorldHint: true }
    },
    async ({ code }) => {
      if (!ALLOW_SANDBOX) return { content: [{ type: 'text', text: 'Sandbox disabled (TR_MCP_ALLOW_SANDBOX=0).' }], isError: true };
      const result = await executeCode(code || '');
      return { content: [{ type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result) }] };
    }
  );

  server.registerTool(
    'recompile_surface',
    {
      title: 'Recompile Surface',
      description: 'Rebuild SSSS derived indexes (INSTRUCTIONS.md, graph-index.jsonl) and update the semantic search embeddings index.',
      inputSchema: {},
      annotations: { readOnlyHint: false, openWorldHint: false }
    },
    async () => {
      const { runRebuild } = await import('../cli/rebuild.mjs');
      const exitCode = await runRebuild();
      let vaultEmbedStats = null, sessionEmbedStats = null;
      try {
        const { buildEmbeddingsIndex, buildSessionEmbeddingsIndex } = await import('../core/embeddings.mjs');
        const nodes = loadNodes(vaultDir());
        vaultEmbedStats   = await buildEmbeddingsIndex(nodes, derivedDir());
        sessionEmbedStats = await buildSessionEmbeddingsIndex(sessionsDir(), derivedDir());
      } catch { /* Ollama may not be running — non-fatal */ }
      return { content: [{ type: 'text', text: JSON.stringify({ rebuilt: exitCode === 0, exit_code: exitCode, vault_embeddings: vaultEmbedStats, session_embeddings: sessionEmbedStats }) }] };
    }
  );

  // ── Filesystem tools ───────────────────────────────────────────────────────
  // Paths are sandboxed to the user's home directory.

  server.registerTool(
    'read_file',
    {
      title: 'Read File',
      description: 'Read a file from the local filesystem. Returns the file contents as text. Paths must be within the home directory.',
      inputSchema: {
        path:      z.string().describe('Absolute or ~-prefixed path to the file'),
        max_bytes: z.number().optional().describe('Maximum bytes to read (default 50000)')
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async ({ path: filePath, max_bytes }) => {
      const resolved = String(filePath).replace(/^~/, os.homedir());
      const home = os.homedir();
      if (!resolved.startsWith(home)) return { content: [{ type: 'text', text: 'Access denied: path must be within home directory' }], isError: true };
      if (!fs.existsSync(resolved)) return { content: [{ type: 'text', text: `File not found: ${resolved}` }], isError: true };
      const stat = fs.statSync(resolved);
      if (stat.isDirectory()) return { content: [{ type: 'text', text: `Path is a directory: ${resolved}` }], isError: true };
      const maxBytes = Number(max_bytes) || 50000;
      const content = fs.readFileSync(resolved, 'utf8').slice(0, maxBytes);
      return { content: [{ type: 'text', text: JSON.stringify({ path: resolved, size: stat.size, content, truncated: stat.size > maxBytes }) }] };
    }
  );

  server.registerTool(
    'list_directory',
    {
      title: 'List Directory',
      description: 'List files and subdirectories in a local directory. Returns names, types, and sizes.',
      inputSchema: {
        path:      z.string().describe('Absolute or ~-prefixed directory path'),
        recursive: z.boolean().optional().describe('Include subdirectories recursively (max depth 3, default false)')
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async ({ path: dirPath, recursive }) => {
      const resolved = String(dirPath).replace(/^~/, os.homedir());
      const home = os.homedir();
      if (!resolved.startsWith(home)) return { content: [{ type: 'text', text: 'Access denied' }], isError: true };
      if (!fs.existsSync(resolved)) return { content: [{ type: 'text', text: `Directory not found: ${resolved}` }], isError: true };
      const entries = [];
      function walk(dir, depth = 0) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const fullPath = path.join(dir, entry.name);
          const rel = path.relative(resolved, fullPath);
          const item = { name: entry.name, path: rel, type: entry.isDirectory() ? 'dir' : 'file' };
          if (!entry.isDirectory()) item.size = fs.statSync(fullPath).size;
          entries.push(item);
          if (recursive && entry.isDirectory() && depth < 3) walk(fullPath, depth + 1);
        }
      }
      walk(resolved);
      return { content: [{ type: 'text', text: JSON.stringify({ path: resolved, entries }) }] };
    }
  );

  server.registerTool(
    'search_files',
    {
      title: 'Search Files',
      description: 'Find files on the local filesystem matching a name pattern (e.g. "*.md", "README*").',
      inputSchema: {
        directory:   z.string().describe('Root directory to search from'),
        pattern:     z.string().describe('Filename glob pattern (e.g. "*.md", "README*")'),
        max_results: z.number().optional().describe('Max files to return (default 50)')
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async ({ directory, pattern, max_results }) => {
      const rootDir = String(directory).replace(/^~/, os.homedir());
      const home = os.homedir();
      if (!rootDir.startsWith(home)) return { content: [{ type: 'text', text: 'Access denied' }], isError: true };
      const maxResults = Number(max_results) || 50;
      const regex = new RegExp('^' + String(pattern || '*').replace(/\./g, '\\.').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i');
      const results = [];
      function findFiles(dir, depth = 0) {
        if (results.length >= maxResults || depth > 5) return;
        try {
          for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (entry.name.startsWith('.') && depth > 0) continue;
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) findFiles(fullPath, depth + 1);
            else if (regex.test(entry.name)) results.push(fullPath);
          }
        } catch { /* permission denied — skip */ }
      }
      findFiles(rootDir);
      return { content: [{ type: 'text', text: JSON.stringify({ pattern, results: results.slice(0, maxResults), count: results.length }) }] };
    }
  );

  // ── Resources ──────────────────────────────────────────────────────────────

  // Static: compiled INSTRUCTIONS.md injected into IDE context
  const instructionsPath = path.join(agentDir(), 'INSTRUCTIONS.md');
  if (fs.existsSync(instructionsPath)) {
    server.registerResource(
      'instructions',
      'total-recall://instructions',
      { title: 'Total Recall Instructions', description: 'Compiled Tier 1 hot memory instructions injected into IDE context.', mimeType: 'text/markdown' },
      async () => {
        const dynamicPath = path.join(agentDir(), 'INSTRUCTIONS.md');
        return { contents: [{ uri: 'total-recall://instructions', mimeType: 'text/markdown', text: fs.readFileSync(dynamicPath, 'utf8') }] };
      }
    );
  }

  // Static: derived graph index
  const graphIndexPath = path.join(derivedDir(), 'graph-index.jsonl');
  if (fs.existsSync(graphIndexPath)) {
    server.registerResource(
      'memory-index',
      'total-recall://memory/index',
      { title: 'Memory Graph Index', description: 'JSONL index of all memory nodes.', mimeType: 'application/jsonl' },
      async () => {
        const dynamicPath = path.join(derivedDir(), 'graph-index.jsonl');
        return { contents: [{ uri: 'total-recall://memory/index', mimeType: 'application/jsonl', text: fs.readFileSync(dynamicPath, 'utf8') }] };
      }
    );
  }

  // Static: SSSS Skill
  const ssssSkillPath = path.join(skillsDir(), 'ssss', 'SKILL.md');
  if (fs.existsSync(ssssSkillPath)) {
    server.registerResource(
      'ssss-skill',
      'total-recall://ssss/skill',
      { title: 'SSSS Skill', description: 'Core SSSS skill markdown instructions.', mimeType: 'text/markdown' },
      async () => {
        const dynamicPath = path.join(skillsDir(), 'ssss', 'SKILL.md');
        return { contents: [{ uri: 'total-recall://ssss/skill', mimeType: 'text/markdown', text: fs.readFileSync(dynamicPath, 'utf8') }] };
      }
    );
  }

  // Static: SSSS Spec
  const ssssSpecPath = path.join(skillsDir(), 'ssss', 'references', 'ssss-spec.md');
  if (fs.existsSync(ssssSpecPath)) {
    server.registerResource(
      'ssss-spec',
      'total-recall://ssss/spec',
      { title: 'SSSS Specification', description: 'Technical specification of SSSS memory layers and formats.', mimeType: 'text/markdown' },
      async () => {
        const dynamicPath = path.join(skillsDir(), 'ssss', 'references', 'ssss-spec.md');
        return { contents: [{ uri: 'total-recall://ssss/spec', mimeType: 'text/markdown', text: fs.readFileSync(dynamicPath, 'utf8') }] };
      }
    );
  }

  // Static: Memory Layers derived state
  const memoryLayersPath = path.join(derivedDir(), 'memory-layers.jsonl');
  if (fs.existsSync(memoryLayersPath)) {
    server.registerResource(
      'memory-layers',
      'total-recall://memory/layers',
      { title: 'Memory Layers State', description: 'JSONL state of all memory nodes categorized by tier.', mimeType: 'application/jsonl' },
      async () => {
        const dynamicPath = path.join(derivedDir(), 'memory-layers.jsonl');
        return { contents: [{ uri: 'total-recall://memory/layers', mimeType: 'application/jsonl', text: fs.readFileSync(dynamicPath, 'utf8') }] };
      }
    );
  }

  // Template: individual memory nodes by slug
  server.registerResource(
    'memory-node',
    new ResourceTemplate('total-recall://vault/{slug}', { list: undefined }),
    { title: 'Memory Node', description: 'Read a specific memory node by its slug.', mimeType: 'text/markdown' },
    async (uri, { slug }) => {
      const node = loadNodes(vaultDir()).find(n => n.slug === decodeURIComponent(String(slug)));
      if (!node) throw new Error(`Memory node not found: ${slug}`);
      return { contents: [{ uri: uri.href, text: node.body || '' }] };
    }
  );

  // Research queue tools — thin wrappers over src/core/research-queue.mjs

  server.registerTool(
    'list_research_queue',
    {
      title: 'List Research Projects',
      description: 'List all research projects (past and upcoming): pending, in_progress, done, failed. Filter by status. Past completed projects show their vault node slug.',
      inputSchema: {
        status: z.string().optional().describe('Filter: "pending", "in_progress", "done", "failed", or omit for all')
      },
      annotations: { readOnlyHint: true, openWorldHint: false }
    },
    async ({ status }) => {
      const result = listQueue({ status });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.registerTool(
    'queue_research',
    {
      title: 'Queue Research Topic',
      description: 'Add a topic to the research queue for real-world verification. Primary use cases: (1) events or developments after the model\'s training cutoff, (2) known gaps in training data (niche domains, fast-moving fields), (3) anything the model knows may be stale. Use web_search + write_memory to execute queued topics.',
      inputSchema: {
        topic:    z.string().describe('Topic or question to research — ideally something post-cutoff or a known training gap'),
        priority: z.string().optional().describe('"high" (time-sensitive), "medium" (default), or "low"'),
        notes:    z.string().optional().describe('Why this needs research — e.g. "post-2024 API changes", "model has low confidence here"')
      },
      annotations: { readOnlyHint: false, openWorldHint: false }
    },
    async ({ topic, priority, notes }) => {
      const item = addToQueue({ topic, priority, notes });
      return { content: [{ type: 'text', text: JSON.stringify({ queued: true, id: item.id, topic: item.topic }) }] };
    }
  );

  return server;
}

// ─── Broadcast helper (kept for daemon → IDE notifications) ─────────────────
// With StreamableHTTPServerTransport, server-initiated notifications go through
// the transport's SSE GET stream, not a separate custom endpoint.
// This function sends a log notification to all active sessions.

export function broadcastMcpNotification(level = 'info', message, data = {}) {
  // Notification sent via server.server.sendLoggingMessage on each active transport.
  // For now we emit via console.error so daemon logs capture it.
  // Full push requires calling server.sendLoggingMessage() per session — wired below.
  console.error(`[MCP notify] [${level}] ${message}`, data);
}

// ─── Express mount ───────────────────────────────────────────────────────────

/**
 * Mount the MCP server onto an existing Express app.
 *
 * Three HTTP methods on /mcp — per spec 2025-06-18 Streamable HTTP transport:
 *   POST   — JSON-RPC messages (initialize, tool calls, etc.)
 *   GET    — SSE stream for server-initiated notifications
 *   DELETE — session termination
 */
export function mountMcp(app) {

  // POST /mcp
  app.post('/mcp', async (req, res) => {
    let sessionId = req.headers['mcp-session-id'];
    const body = req.body || {};
    console.error(`[MCP debug] POST /mcp - sessionId in header: ${sessionId}, transports size: ${transports.size}, method: ${body?.method}`);

    try {
      // Existing session — route to its transport
      if (sessionId && transports.has(sessionId)) {
        console.error(`[MCP debug] Routing to existing session: ${sessionId}`);
        const transport = transports.get(sessionId);
        if (transport && transport._webStandardTransport) {
          transport._webStandardTransport._enableJsonResponse = req.headers['x-sync-rpc'] === 'true';
        }
        await transport.handleRequest(req, res, body);
        return;
      }

      // Fallback for tests/single-session: if sessionId omitted, use only active session
      if (!sessionId && transports.size === 1) {
        const fallbackId = transports.keys().next().value;
        console.error(`[MCP debug] Fallback to single active session: ${fallbackId}`);
        req.headers['mcp-session-id'] = fallbackId;
        if (req.rawHeaders) {
          req.rawHeaders.push('mcp-session-id', fallbackId);
        }
        const transport = transports.get(fallbackId);
        if (transport && transport._webStandardTransport) {
          transport._webStandardTransport._enableJsonResponse = req.headers['x-sync-rpc'] === 'true';
        }
        await transport.handleRequest(req, res, body);
        return;
      }

      // New session — must be an initialize request
      if (!sessionId && body?.method === 'initialize') {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            console.error(`[MCP] Session initialized: ${sid}`);
            transports.set(sid, transport);
          }
        });

        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid && transports.has(sid)) {
            console.error(`[MCP] Session closed: ${sid}`);
            transports.delete(sid);
          }
        };

        const server = createMcpServer();
        await server.connect(transport);
        await transport.handleRequest(req, res, body);
        return;
      }

      // Bad request
      res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Bad Request: No valid session ID or not an initialize request' },
        id: null
      });
    } catch (err) {
      console.error('[MCP] POST error:', err);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null
        });
      }
    }
  });

  // GET /mcp — SSE stream for server-initiated messages
  app.get('/mcp', async (req, res) => {
    let sessionId = req.headers['mcp-session-id'];
    if (!sessionId && transports.size === 1) {
      sessionId = transports.keys().next().value;
      req.headers['mcp-session-id'] = sessionId;
      if (req.rawHeaders) {
        req.rawHeaders.push('mcp-session-id', sessionId);
      }
    }
    if (!sessionId || !transports.has(sessionId)) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }
    try {
      await transports.get(sessionId).handleRequest(req, res);
    } catch (err) {
      console.error('[MCP] GET error:', err);
      if (!res.headersSent) res.status(500).send('SSE stream error');
    }
  });

  // DELETE /mcp — session termination
  app.delete('/mcp', async (req, res) => {
    let sessionId = req.headers['mcp-session-id'];
    if (!sessionId && transports.size === 1) {
      sessionId = transports.keys().next().value;
      req.headers['mcp-session-id'] = sessionId;
      if (req.rawHeaders) {
        req.rawHeaders.push('mcp-session-id', sessionId);
      }
    }
    if (!sessionId || !transports.has(sessionId)) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }
    try {
      await transports.get(sessionId).handleRequest(req, res);
    } catch (err) {
      console.error('[MCP] DELETE error:', err);
      if (!res.headersSent) res.status(500).send('Session termination error');
    }
  });

  return app;
}
