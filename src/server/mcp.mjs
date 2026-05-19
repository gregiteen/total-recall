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
  }
];

const sessions = new Set();

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
      try {
        const code = await runRebuild();
        return toolContent({ rebuilt: code === 0, exit_code: code });
      } catch (err) {
        return toolContent({ rebuilt: false, exit_code: 1, error: { code: err.code, repair: err.repair, message: err.message, context: err.context ?? {} } });
      }
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
  app.post('/mcp', handleMcpPost);
  return app;
}

const app = express();
app.use(express.json({ limit: '1mb' }));
mountMcp(app);

export default app;
