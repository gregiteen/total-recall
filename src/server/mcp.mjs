import express from 'express';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { loadNodes, writeNode, createNodeFromMcpPayload } from '../core/vault.mjs';
import { executeCode } from './tools.mjs';

const TOOL_DEFS = [
  {
    name: 'read_memory',
    description: 'Read one SSSS memory node by slug.',
    inputSchema: {
      type: 'object',
      properties: { slug: { type: 'string' } },
      required: ['slug']
    }
  },
  {
    name: 'write_memory',
    description: 'Write a new SSSS memory node into the vault.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string' },
        title: { type: 'string' },
        category: { type: 'string' },
        content: { type: 'string' }
      },
      required: ['slug', 'title', 'category', 'content']
    }
  },
  {
    name: 'search_memory',
    description: 'Search SSSS memory nodes by title, tags, slug, or body text.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query']
    }
  },
  {
    name: 'list_memory',
    description: 'List SSSS memory node metadata.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'run_sandbox',
    description: 'Execute JavaScript in the configured Total Recall sandbox.',
    inputSchema: {
      type: 'object',
      properties: { code: { type: 'string' } },
      required: ['code']
    }
  },
  {
    name: 'recompile_surface',
    description: 'Rebuild SSSS derived indexes and injected surfaces.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'read_file',
    description: 'Read a file from the user\'s local filesystem. Returns the file contents as text. Paths must be within the user\'s home directory.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute or ~ path to the file' },
        max_bytes: { type: 'number', description: 'Maximum bytes to read (default 50000)' }
      },
      required: ['path']
    }
  },
  {
    name: 'list_directory',
    description: 'List files and subdirectories in a local directory. Returns names, types, and sizes.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute or ~ directory path' },
        recursive: { type: 'boolean', description: 'Include subdirectories (default false)' }
      },
      required: ['path']
    }
  },
  {
    name: 'search_files',
    description: 'Find files on the local filesystem matching a name pattern. Searches within a given directory.',
    inputSchema: {
      type: 'object',
      properties: {
        directory: { type: 'string', description: 'Root directory to search from' },
        pattern: { type: 'string', description: 'Filename pattern to match (e.g. "*.md", "README*")' },
        max_results: { type: 'number', description: 'Max files to return (default 50)' }
      },
      required: ['directory', 'pattern']
    }
  }
];

const sessions = new Set();

// ─── SSE Push Channel ────────────────────────────────────────────────────────────
// Connected IDE clients that have opened GET /mcp/events.
// When the daemon has new conclusions, it calls broadcastMcpNotification()
// which pushes a notifications/message event to all of them simultaneously.
const sseClients = new Set();

/**
 * Push a notification to all connected MCP clients via SSE.
 * Called by the daemon when System 2 conclusions or fast-path research manifests.
 *
 * @param {string} level  'info' | 'warning' | 'error'
 * @param {string} message  Human-readable summary
 * @param {object} [data]   Optional structured payload
 */
export function broadcastMcpNotification(level = 'info', message, data = {}) {
  if (sseClients.size === 0) return;
  const event = JSON.stringify({
    jsonrpc: '2.0',
    method: 'notifications/message',
    params: { level, message, data },
  });
  for (const res of sseClients) {
    try {
      res.write(`data: ${event}\n\n`);
    } catch {
      sseClients.delete(res);
    }
  }
}

function agentDir() {
  return process.env.AGENT_DIR || path.join(os.homedir(), '.agent');
}

function vaultDir() {
  return path.join(agentDir(), 'memory-vault');
}

function skillsDir() {
  return path.join(agentDir(), 'skills');
}

function derivedDir() {
  return path.join(agentDir(), 'memory-derived');
}

function textResource(uri, name, filePath, description) {
  return {
    uri,
    name,
    description,
    mimeType: 'text/markdown',
    filePath
  };
}

function jsonlResource(uri, name, filePath, description) {
  return {
    uri,
    name,
    description,
    mimeType: 'application/jsonl',
    filePath
  };
}

function referenceResources() {
  const refsDir = path.join(skillsDir(), 'ssss', 'references');
  if (!fs.existsSync(refsDir)) return [];
  return fs.readdirSync(refsDir)
    .filter(file => file.endsWith('.md'))
    .sort()
    .map(file => {
      const name = file.replace(/\.md$/, '');
      return textResource(
        `total-recall://ssss/references/${name}`,
        `ssss-reference-${name}`,
        path.join(refsDir, file),
        `SSSS reference document: ${name}`
      );
    });
}

function resourceCatalog() {
  return [
    textResource(
      'total-recall://instructions',
      'instructions',
      path.join(agentDir(), 'INSTRUCTIONS.md'),
      'Compiled Tier 1 Total Recall hot memory instructions.'
    ),
    textResource(
      'total-recall://ssss/skill',
      'ssss-skill',
      path.join(skillsDir(), 'ssss', 'SKILL.md'),
      'Total Recall SSSS implementation skill.'
    ),
    textResource(
      'total-recall://ssss/spec',
      'ssss-spec',
      path.join(skillsDir(), 'ssss', 'references', 'ssss-spec.md'),
      'Canonical SSSS specification.'
    ),
    ...referenceResources(),
    jsonlResource(
      'total-recall://memory/index',
      'memory-index',
      path.join(derivedDir(), 'graph-index.jsonl'),
      'Derived memory graph index.'
    ),
    jsonlResource(
      'total-recall://memory/layers',
      'memory-layers',
      path.join(derivedDir(), 'memory-layers.jsonl'),
      'Derived cognitive memory layer index.'
    )
  ];
}

function redactNode(node) {
  const { body, ...frontmatter } = node;
  return {
    ...frontmatter,
    content: body
  };
}

function jsonRpcResult(id, result) {
  return { jsonrpc: '2.0', id: id ?? null, result };
}

function jsonRpcError(id, code, message) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

function toolContent(value) {
  return {
    content: [
      {
        type: 'text',
        text: typeof value === 'string' ? value : JSON.stringify(value)
      }
    ]
  };
}

function resourceContents(resource) {
  if (!resource || !fs.existsSync(resource.filePath)) {
    throw new Error(`Resource not found: ${resource?.uri || 'unknown'}`);
  }
  return {
    contents: [
      {
        uri: resource.uri,
        mimeType: resource.mimeType,
        text: fs.readFileSync(resource.filePath, 'utf8')
      }
    ]
  };
}

async function callTool(name, args = {}) {
  const nodes = () => loadNodes(vaultDir());

  switch (name) {
    case 'list_memory':
      return toolContent(nodes().map(({ body, ...node }) => node));

    case 'read_memory': {
      const node = nodes().find((candidate) => candidate.slug === args.slug);
      if (!node) throw new Error(`Memory node not found: ${args.slug}`);
      return toolContent(redactNode(node));
    }

    case 'search_memory': {
      const query = String(args.query || '').toLowerCase();
      const results = nodes()
        .filter((node) => [
          node.slug,
          node.title,
          node.category,
          (node.tags || []).join(' '),
          node.body
        ].join(' ').toLowerCase().includes(query))
        .map(redactNode);
      return toolContent(results);
    }

    case 'write_memory': {
      const node = createNodeFromMcpPayload({
        slug: args.slug,
        title: args.title,
        category: args.category,
        content: args.content
      });
      writeNode(node, vaultDir());
      return toolContent({ slug: node.slug, written: true });
    }

    case 'run_sandbox':
      return toolContent(await executeCode(args.code || ''));

    case 'recompile_surface': {
      const { runRebuild } = await import('../cli/rebuild.mjs');
      const code = await runRebuild();
      return toolContent({ rebuilt: code === 0, exit_code: code });
    }

    case 'read_file': {
      const filePath = String(args.path || '').replace(/^~/, os.homedir());
      const home = os.homedir();
      if (!filePath.startsWith(home)) throw new Error('Access denied: path must be within home directory');
      if (!fs.existsSync(filePath)) throw new Error(`File not found: ${filePath}`);
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) throw new Error(`Path is a directory, not a file: ${filePath}`);
      const maxBytes = Number(args.max_bytes) || 50000;
      const content = fs.readFileSync(filePath, 'utf8').slice(0, maxBytes);
      return toolContent({ path: filePath, size: stat.size, content, truncated: stat.size > maxBytes });
    }

    case 'list_directory': {
      const dirPath = String(args.path || '').replace(/^~/, os.homedir());
      const home = os.homedir();
      if (!dirPath.startsWith(home)) throw new Error('Access denied: path must be within home directory');
      if (!fs.existsSync(dirPath)) throw new Error(`Directory not found: ${dirPath}`);
      const recursive = Boolean(args.recursive);
      const entries = [];
      function walk(dir, depth = 0) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const fullPath = path.join(dir, entry.name);
          const rel = path.relative(dirPath, fullPath);
          const item = { name: entry.name, path: rel, type: entry.isDirectory() ? 'dir' : 'file' };
          if (!entry.isDirectory()) item.size = fs.statSync(fullPath).size;
          entries.push(item);
          if (recursive && entry.isDirectory() && depth < 3) walk(fullPath, depth + 1);
        }
      }
      walk(dirPath);
      return toolContent({ path: dirPath, entries });
    }

    case 'search_files': {
      const rootDir = String(args.directory || '').replace(/^~/, os.homedir());
      const home = os.homedir();
      if (!rootDir.startsWith(home)) throw new Error('Access denied: path must be within home directory');
      const pattern = String(args.pattern || '*');
      const maxResults = Number(args.max_results) || 50;
      const regex = new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i');
      const results = [];
      function findFiles(dir, depth = 0) {
        if (results.length >= maxResults || depth > 5) return;
        try {
          for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (entry.name.startsWith('.') && depth > 0) continue; // skip hidden dirs
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) { findFiles(fullPath, depth + 1); }
            else if (regex.test(entry.name)) results.push(fullPath);
          }
        } catch { /* permission denied — skip */ }
      }
      findFiles(rootDir);
      return toolContent({ pattern, results: results.slice(0, maxResults), count: results.length });
    }

    default:
      throw new Error(`Unknown MCP tool: ${name}`);
  }
}

async function handleMcpPost(req, res) {
  const message = req.body || {};
  const method = message.method;

  try {
    if (method === 'initialize') {
      const sessionId = randomUUID();
      sessions.add(sessionId);
      res.set('mcp-session-id', sessionId);
      return res.json(jsonRpcResult(message.id, {
        protocolVersion: message.params?.protocolVersion || '2025-06-18',
        capabilities: {
          tools: { listChanged: false },
          resources: { subscribe: false, listChanged: false }
        },
        serverInfo: {
          name: 'total-recall',
          version: '3.0.0'
        }
      }));
    }

    if (!req.get('x-sync-rpc') && !sessions.has(req.get('mcp-session-id'))) {
      return res.status(400).json(jsonRpcError(message.id, -32000, 'Missing or invalid MCP session ID'));
    }

    if (method === 'tools/list') {
      return res.json(jsonRpcResult(message.id, { tools: TOOL_DEFS }));
    }

    if (method === 'tools/call') {
      const result = await callTool(message.params?.name, message.params?.arguments || {});
      return res.json(jsonRpcResult(message.id, result));
    }

    if (method === 'resources/list') {
      const resources = resourceCatalog()
        .filter(resource => fs.existsSync(resource.filePath))
        .map(({ filePath, ...resource }) => resource);
      return res.json(jsonRpcResult(message.id, { resources }));
    }

    if (method === 'resources/read') {
      const uri = message.params?.uri;
      const resource = resourceCatalog().find(candidate => candidate.uri === uri);
      return res.json(jsonRpcResult(message.id, resourceContents(resource)));
    }

    return res.status(404).json(jsonRpcError(message.id, -32601, `Method not found: ${method}`));
  } catch (err) {
    return res.status(500).json(jsonRpcError(message.id, -32000, err.message));
  }
}

export function mountMcp(app) {
  // SSE push channel — IDEs connect here to receive server-initiated notifications
  app.get('/mcp/events', (req, res) => {
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    // Send initial ping so the client knows the channel is live
    res.write(`data: ${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/message', params: { level: 'info', message: 'Total Recall SSE channel connected' } })}\n\n`);
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
  });

  app.post('/mcp', handleMcpPost);
  return app;
}

const app = express();
app.use(express.json({ limit: '1mb' }));
mountMcp(app);

export default app;
