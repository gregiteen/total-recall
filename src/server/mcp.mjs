/**
 * Total Recall MCP Gateway — Streamable HTTP
 *
 * Exposes the SSSS memory vault, sandbox execution, and knowledge graph
 * to any MCP-compatible client (Claude Desktop, Cursor, ChatGPT, etc.)
 * via the Streamable HTTP transport (MCP spec 2025-06-18).
 *
 * PRD §5.3 — Capabilities: tools, resources, prompts
 *
 * Logging: stderr ONLY (console.error). No stdout pollution.
 */

import express from 'express';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { loadNodes, writeNode, createNodeFromMcpPayload, loadSkills } from '../core/vault.mjs';
import { compileSurface } from '../core/surface.mjs';
import { runInSandbox } from '../core/sandbox.mjs';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { registerGeneratedTools } from './mcp-generated.mjs';
import { resolveAgentDir } from '../cli/agent-dir.mjs';

// ─── Paths ──────────────────────────────────────────────────────────────────────

const AGENT_DIR = resolveAgentDir();
const VAULT_DIR = path.join(AGENT_DIR, 'memory-vault');
const SKILLS_DIR = path.join(AGENT_DIR, 'skills');
const DERIVED_DIR = path.join(AGENT_DIR, 'memory-derived');
const INSTRUCTIONS_FILE = path.join(AGENT_DIR, 'INSTRUCTIONS.md');

// ─── McpServer Factory ──────────────────────────────────────────────────────────

function createServer() {
  const server = new McpServer(
    { name: 'total-recall', version: '3.0.0' },
    { capabilities: { logging: {} } }
  );

  // ═══════════════════════════════════════════════════════════════════════════════
  // TOOLS — Remote agents can mutate and query the system
  // ═══════════════════════════════════════════════════════════════════════════════

  // ── read_memory ────────────────────────────────────────────────────────────────
  server.registerTool(
    'read_memory',
    {
      title: 'Read Memory',
      description: 'Reads a memory node from the SSSS Vault by its slug identifier.',
      inputSchema: {
        slug: z.string().describe('The exact slug (kebab-case filename) of the memory node')
      }
    },
    async ({ slug }) => {
      const nodes = loadNodes(VAULT_DIR);
      const node = nodes.find(n => n.slug === slug);

      if (!node) {
        console.error(`[MCP] read_memory: slug "${slug}" not found`);
        return {
          content: [{ type: 'text', text: `Memory node "${slug}" not found in the vault.` }],
          isError: true
        };
      }

      console.error(`[MCP] read_memory: read "${slug}"`);
      return {
        content: [{ type: 'text', text: JSON.stringify(node, null, 2) }]
      };
    }
  );

  // ── write_memory ───────────────────────────────────────────────────────────────
  server.registerTool(
    'write_memory',
    {
      title: 'Write Memory',
      description: 'Creates or updates a memory node in the SSSS Vault.',
      inputSchema: {
        slug: z.string().describe('Unique kebab-case slug for the node (also becomes the filename)'),
        title: z.string().describe('Human-readable title'),
        category: z.string().describe('One of: invariants, preferences, anti-patterns, patterns, decisions, concepts, facts, lore'),
        content: z.string().describe('Markdown body content of the memory node')
      }
    },
    async ({ slug, title, category, content }) => {
      try {
        const nodeData = createNodeFromMcpPayload({ slug, title, category, content });
        writeNode(nodeData, VAULT_DIR);
        console.error(`[MCP] write_memory: wrote "${slug}"`);
        return {
          content: [{ type: 'text', text: `Memory node "${slug}" written to ${category}/.` }]
        };
      } catch (e) {
        console.error(`[MCP] write_memory error: ${e.message}`);
        return {
          content: [{ type: 'text', text: `Failed to write node: ${e.message}` }],
          isError: true
        };
      }
    }
  );

  // ── search_memory ──────────────────────────────────────────────────────────────
  server.registerTool(
    'search_memory',
    {
      title: 'Search Memory',
      description: 'Full-text search across all active memory nodes. Returns matching slugs, titles, and excerpts.',
      inputSchema: {
        query: z.string().describe('Search query (matched against title, tags, and body)'),
        category: z.string().optional().describe('Optional category filter'),
        limit: z.number().optional().describe('Max results (default 20)')
      }
    },
    async ({ query, category, limit }) => {
      const max = limit ?? 20;
      const nodes = loadNodes(VAULT_DIR);
      const q = query.toLowerCase();

      const matches = nodes
        .filter(n => n.status === 'active')
        .filter(n => !category || n.category === category)
        .filter(n => {
          const haystack = [
            n.title, n.slug, (n.tags || []).join(' '), n.body || ''
          ].join(' ').toLowerCase();
          return haystack.includes(q);
        })
        .slice(0, max)
        .map(n => ({
          slug: n.slug,
          title: n.title,
          category: n.category,
          importance: n.importance,
          excerpt: (n.body || '').slice(0, 200)
        }));

      console.error(`[MCP] search_memory: "${query}" → ${matches.length} results`);
      return {
        content: [{ type: 'text', text: JSON.stringify(matches, null, 2) }]
      };
    }
  );

  // ── list_memory ────────────────────────────────────────────────────────────────
  server.registerTool(
    'list_memory',
    {
      title: 'List Memory Nodes',
      description: 'Lists all memory nodes in the vault, optionally filtered by category or status.',
      inputSchema: {
        category: z.string().optional().describe('Filter by category'),
        status: z.string().optional().describe('Filter by status (active, draft, superseded, deprecated)')
      }
    },
    async ({ category, status }) => {
      const nodes = loadNodes(VAULT_DIR);
      const filtered = nodes
        .filter(n => !category || n.category === category)
        .filter(n => !status || n.status === status)
        .map(n => ({
          slug: n.slug,
          title: n.title,
          category: n.category,
          status: n.status,
          importance: n.importance,
          modality: n.modality
        }));

      console.error(`[MCP] list_memory: ${filtered.length} nodes`);
      return {
        content: [{ type: 'text', text: JSON.stringify(filtered, null, 2) }]
      };
    }
  );

  // ── run_sandbox ────────────────────────────────────────────────────────────────
  server.registerTool(
    'run_sandbox',
    {
      title: 'Run Sandbox',
      description: 'Executes JavaScript code in an isolated Node.js sandbox. Returns stdout on success, stderr on failure.',
      inputSchema: {
        code: z.string().describe('JavaScript code to execute'),
        timeout_ms: z.number().optional().describe('Execution timeout in ms (default 5000)')
      },
      annotations: {
        readOnlyHint: false,
        openWorldHint: true
      }
    },
    async ({ code, timeout_ms }) => {
      const tmpPath = path.join(os.tmpdir(), `mcp-sandbox-${Date.now()}.mjs`);
      fs.writeFileSync(tmpPath, code);

      try {
        const result = await runInSandbox(tmpPath, timeout_ms ?? 5000);
        console.error(`[MCP] run_sandbox: ${result.success ? 'ok' : 'fail'}`);

        if (result.success) {
          return {
            content: [{ type: 'text', text: result.output || '(no output)' }]
          };
        }
        return {
          content: [{ type: 'text', text: `Execution failed (code ${result.code}):\n${result.output}` }],
          isError: true
        };
      } catch (e) {
        console.error(`[MCP] run_sandbox error: ${e.message}`);
        return {
          content: [{ type: 'text', text: `Sandbox error: ${e.message}` }],
          isError: true
        };
      } finally {
        try { fs.unlinkSync(tmpPath); } catch { /* ignore cleanup failure */ }
      }
    }
  );

  // ── recompile_surface ──────────────────────────────────────────────────────────
  server.registerTool(
    'recompile_surface',
    {
      title: 'Recompile Surface',
      description: 'Triggers a full surface recompilation — rebuilds skill injections, Tier 1 INSTRUCTIONS.md, and derived indexes.',
      inputSchema: {}
    },
    async () => {
      try {
        const stats = await compileSurface({
          vaultDir: VAULT_DIR,
          skillsDir: SKILLS_DIR,
          derivedDir: DERIVED_DIR,
          instructionsFile: INSTRUCTIONS_FILE
        });
        console.error(`[MCP] recompile_surface: ${stats.nodesProcessed} nodes, ${stats.skillsInjected} skills`);
        return {
          content: [{ type: 'text', text: `Surface recompiled: ${stats.nodesProcessed} nodes processed, ${stats.skillsInjected} skills injected.` }]
        };
      } catch (e) {
        console.error(`[MCP] recompile_surface error: ${e.message}`);
        return {
          content: [{ type: 'text', text: `Recompile failed: ${e.message}` }],
          isError: true
        };
      }
    }
  );

  // ═══════════════════════════════════════════════════════════════════════════════
  // RESOURCES — Read-only access to vault state
  // ═══════════════════════════════════════════════════════════════════════════════

  // ── Static: graph index ────────────────────────────────────────────────────────
  server.registerResource(
    'graph-index',
    'total-recall://derived/graph-index',
    {
      title: 'Memory Graph Index',
      description: 'JSONL index of all memory nodes (slug, title, category, status, confidence).',
      mimeType: 'application/jsonl'
    },
    async () => {
      const indexPath = path.join(DERIVED_DIR, 'graph-index.jsonl');
      let text = '';
      try { text = fs.readFileSync(indexPath, 'utf8'); } catch { text = '(index not yet compiled — run recompile_surface)'; }
      return { contents: [{ uri: 'total-recall://derived/graph-index', text }] };
    }
  );

  // ── Static: Tier 1 instructions ────────────────────────────────────────────────
  server.registerResource(
    'instructions',
    'total-recall://tier1/instructions',
    {
      title: 'Tier 1 Instructions',
      description: 'Compiled INSTRUCTIONS.md containing all priority:absolute behavioral invariants.',
      mimeType: 'text/markdown'
    },
    async () => {
      let text = '';
      try { text = fs.readFileSync(INSTRUCTIONS_FILE, 'utf8'); } catch { text = '(not yet compiled)'; }
      return { contents: [{ uri: 'total-recall://tier1/instructions', text }] };
    }
  );

  // ── Template: individual memory nodes ──────────────────────────────────────────
  server.registerResource(
    'memory-node',
    new ResourceTemplate('total-recall://vault/{category}/{slug}', { list: undefined }),
    {
      title: 'Memory Node',
      description: 'Read a specific memory node by category and slug.',
      mimeType: 'text/markdown'
    },
    async (uri, { category, slug }) => {
      const filePath = path.join(VAULT_DIR, category, `${slug}.md`);
      let text = '';
      try { text = fs.readFileSync(filePath, 'utf8'); } catch { text = `Node ${category}/${slug} not found.`; }
      return { contents: [{ uri: uri.href, text }] };
    }
  );

  // ═══════════════════════════════════════════════════════════════════════════════
  // PROMPTS — Canned prompt templates for common operations
  // ═══════════════════════════════════════════════════════════════════════════════

  server.registerPrompt(
    'analyze-memory',
    {
      title: 'Analyze Memory',
      description: 'Generates a prompt that asks the model to analyze a specific memory node for quality, conflicts, and improvement suggestions.',
      argsSchema: {
        slug: z.string().describe('Slug of the memory node to analyze')
      }
    },
    async ({ slug }) => {
      const nodes = loadNodes(VAULT_DIR);
      const node = nodes.find(n => n.slug === slug);
      const nodeText = node ? JSON.stringify(node, null, 2) : `Node "${slug}" not found.`;

      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Analyze the following SSSS memory node for quality, potential conflicts with other nodes, and improvement suggestions:\n\n${nodeText}`
            }
          }
        ]
      };
    }
  );

  server.registerPrompt(
    'summarize-vault',
    {
      title: 'Summarize Vault',
      description: 'Generates a prompt that asks for a summary of the current vault state — node counts by category, staleness, and health.'
    },
    async () => {
      const nodes = loadNodes(VAULT_DIR);
      const summary = {};
      for (const n of nodes) {
        summary[n.category] = (summary[n.category] || 0) + 1;
      }

      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Summarize the health of this SSSS memory vault.\n\nTotal nodes: ${nodes.length}\nBy category: ${JSON.stringify(summary, null, 2)}\n\nProvide insights on: category distribution, potential staleness, and recommendations.`
            }
          }
        ]
      };
    }
  );

  // Register generated API tools
  registerGeneratedTools(server);

  return server;
}

// ─── Express + Streamable HTTP Transport ────────────────────────────────────────

const app = express();
app.use(cors());
app.use(express.json());

/** @type {Record<string, StreamableHTTPServerTransport>} */
const transports = {};

class DirectTransport {
  constructor(res) {
    this.res = res;
    this.onmessage = undefined;
    this.onclose = undefined;
    this.onerror = undefined;
  }
  async start() {}
  async close() {}
  async send(message) {
    if (this.res && !this.res.headersSent) {
      this.res.json(message);
    }
  }
}

// POST /mcp — main message handler (initialize + all subsequent requests)
app.post('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'];

  try {
    // Stateless Sync RPC — for the dashboard frontend
    if (req.headers['x-sync-rpc'] === 'true') {
      const transport = new DirectTransport(res);
      const server = createServer();
      await server.connect(transport);
      if (transport.onmessage) {
        // Feed the request in, and transport.send() will reply inline
        await transport.onmessage(req.body);
      }
      return;
    }

    // Existing session — route to its transport
    if (sessionId && transports[sessionId]) {
      await transports[sessionId].handleRequest(req, res, req.body);
      return;
    }

    // New session — must be an initialize request
    if (!sessionId && req.body?.method === 'initialize') {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: sid => {
          console.error(`[MCP] Session initialized: ${sid}`);
          transports[sid] = transport;
        }
      });

      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid && transports[sid]) {
          console.error(`[MCP] Session closed: ${sid}`);
          delete transports[sid];
        }
      };

      const server = createServer();
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    }

    // Bad request — no session and not initializing
    res.status(400).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Bad Request: No valid session ID provided' },
      id: null
    });
  } catch (error) {
    console.error('[MCP] POST /mcp error:', error);
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
  const sessionId = req.headers['mcp-session-id'];
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send('Invalid or missing session ID');
    return;
  }

  try {
    await transports[sessionId].handleRequest(req, res);
  } catch (error) {
    console.error('[MCP] GET /mcp error:', error);
    if (!res.headersSent) {
      res.status(500).send('Error establishing stream');
    }
  }
});

// DELETE /mcp — session termination
app.delete('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'];
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send('Invalid or missing session ID');
    return;
  }

  try {
    await transports[sessionId].handleRequest(req, res);
  } catch (error) {
    console.error('[MCP] DELETE /mcp error:', error);
    if (!res.headersSent) {
      res.status(500).send('Error processing session termination');
    }
  }
});

// ─── Standalone execution ───────────────────────────────────────────────────────

const PORT = process.env.MCP_PORT || 3001;

import { fileURLToPath } from 'node:url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  app.listen(PORT, () => {
    console.error(`🌐 Total Recall MCP Gateway listening on port ${PORT}`);
    console.error(`   Endpoint: POST http://localhost:${PORT}/mcp`);
  });
}

/**
 * Mount the MCP gateway on a parent Express app.
 * Called by src/server/index.mjs as: mountMcp(parentApp)
 *
 * The internal routes already define /mcp paths, so we mount at root.
 */
export function mountMcp(parentApp) {
  parentApp.use(app);
  console.error('[MCP] Gateway mounted via mountMcp()');
}

export default app;
