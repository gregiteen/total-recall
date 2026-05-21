---
name: mcp-expert
description: "Use this skill when implementing, debugging, or extending any Model Context Protocol (MCP) server or client using the @modelcontextprotocol/sdk. MANDATORY: You MUST read the full SKILL.md file before executing."
---

# Model Context Protocol (MCP) — Definitive Implementation Guide

> **Skill Version:** 2.0.0 | **Last Verified SDK Version:** 1.29.0 | **Spec Version:** 2025-06-18
> **Last Updated:** 2026-05-11

## Quick Reference

| Item | Link |
|:---|:---|
| **Official Spec** | https://modelcontextprotocol.io/specification/2025-06-18 |
| **TypeScript SDK** | https://github.com/modelcontextprotocol/typescript-sdk |
| **npm Package** | `@modelcontextprotocol/sdk` |
| **Transport Spec** | https://modelcontextprotocol.io/docs/concepts/transports |
| **Tools Spec** | https://modelcontextprotocol.io/docs/concepts/tools |
| **Resources Spec** | https://modelcontextprotocol.io/docs/concepts/resources |
| **Prompts Spec** | https://modelcontextprotocol.io/docs/concepts/prompts |
| **SDK Changelog** | https://github.com/modelcontextprotocol/typescript-sdk/releases |
| **LLM Docs Index** | https://modelcontextprotocol.io/llms.txt |

---

## 1. Architecture Overview

MCP is an open protocol (Linux Foundation / Agentic AI Foundation) that standardizes how AI clients (Claude Desktop, Cursor, ChatGPT, Gemini, JetBrains IDEs) connect to external tools, data sources, and prompt templates.

```text
┌─────────────────────┐         ┌──────────────────────────────┐
│  MCP Client          │  HTTP   │  MCP Server                  │
│  (Claude, Cursor,    │◀──────▶│  (Your Express app)          │
│   ChatGPT, etc.)     │  POST   │                              │
│                      │  GET    │  ┌─ Tools (actions)          │
│                      │  DELETE │  ├─ Resources (read-only)    │
│                      │         │  └─ Prompts (templates)      │
└─────────────────────┘         └──────────────────────────────┘
```

### Three Capability Types

| Type | Purpose | Controlled By |
|:---|:---|:---|
| **Tools** | Actions the LLM can invoke (read/write memory, run code, search) | Model-controlled (LLM decides when to call) |
| **Resources** | Read-only data the client can attach to context | Application-controlled (user/client decides) |
| **Prompts** | Pre-built prompt templates with arguments | User-controlled (user selects from a menu) |

---

## 2. Transport: Streamable HTTP (REQUIRED)

### ⛔ CRITICAL: NEVER use SSEServerTransport

`SSEServerTransport` is the **deprecated** transport from protocol version `2024-11-05`. It requires two separate endpoints (`GET /sse` + `POST /messages`) and is NOT what modern clients expect.

**ALWAYS use `StreamableHTTPServerTransport`** — a single `/mcp` endpoint that handles POST (messages), GET (SSE streams), and DELETE (session termination).

### Imports

```javascript
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
```

### The Transport Architecture

The Streamable HTTP transport uses a **single endpoint** (conventionally `/mcp`) with three HTTP methods:

| Method | Purpose |
|:---|:---|
| `POST /mcp` | Client sends JSON-RPC messages (initialize, tool calls, etc.) |
| `GET /mcp` | Client opens an SSE stream for server-initiated messages |
| `DELETE /mcp` | Client terminates a session |

Session identity is carried via the `Mcp-Session-Id` header (NOT a query parameter, NOT a cookie).

---

## 3. Complete Stateful Server Implementation

This is the **canonical pattern** for a production MCP server. Copy this structure exactly.

```javascript
import express from 'express';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

// ─── McpServer Factory ─────────────────────────────────────────────────────
// Create a NEW McpServer per session. Do NOT share a single instance.
function createServer() {
  const server = new McpServer(
    { name: 'my-server', version: '1.0.0' },
    { capabilities: { logging: {} } }
  );

  // Register tools, resources, prompts here (see §4, §5, §6)

  return server;
}

// ─── Express App ────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());

/** @type {Record<string, StreamableHTTPServerTransport>} */
const transports = {};

// POST /mcp — handles initialize + all subsequent JSON-RPC messages
app.post('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'];

  try {
    // Case 1: Existing session — route to its transport
    if (sessionId && transports[sessionId]) {
      await transports[sessionId].handleRequest(req, res, req.body);
      return;
    }

    // Case 2: New session — must be an initialize request
    if (!sessionId && req.body?.method === 'initialize') {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
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

    // Case 3: Bad request
    res.status(400).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Bad Request: No valid session ID' },
      id: null
    });
  } catch (error) {
    console.error('[MCP] POST error:', error);
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
  await transports[sessionId].handleRequest(req, res);
});

// DELETE /mcp — session termination
app.delete('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'];
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send('Invalid or missing session ID');
    return;
  }
  await transports[sessionId].handleRequest(req, res);
});

app.listen(3001, () => {
  console.error('MCP Server listening on port 3001');
});
```

---

## 4. Registering Tools

### ⛔ NEVER use `server.tool()` — it is DEPRECATED

Always use `server.registerTool(name, config, handler)`.

### Pattern: Tool with Zod input schema

```javascript
import { z } from 'zod';

server.registerTool(
  'read_memory',                           // tool name (kebab-case)
  {
    title: 'Read Memory',                  // human-readable display name
    description: 'Reads a memory node.',   // LLM sees this to decide when to call
    inputSchema: {                         // Zod shape (NOT z.object() — just the raw shape)
      slug: z.string().describe('The slug of the memory node')
    }
  },
  async ({ slug }) => {                    // handler receives validated args
    // ... your logic ...
    return {
      content: [{ type: 'text', text: 'result here' }]
    };
  }
);
```

### Pattern: Tool with annotations

```javascript
server.registerTool(
  'run_sandbox',
  {
    title: 'Run Sandbox',
    description: 'Executes JavaScript in an isolated sandbox.',
    inputSchema: {
      code: z.string().describe('JavaScript code to execute'),
      timeout_ms: z.number().optional().describe('Timeout in ms')
    },
    annotations: {
      readOnlyHint: false,   // this tool has side effects
      openWorldHint: true    // can access external resources
    }
  },
  async ({ code, timeout_ms }) => {
    // ...
  }
);
```

### Pattern: Zero-argument tool

```javascript
server.registerTool(
  'recompile_surface',
  {
    title: 'Recompile Surface',
    description: 'Rebuilds all derived indexes.',
    inputSchema: {}      // empty object — no arguments
  },
  async () => {
    // ...
    return { content: [{ type: 'text', text: 'Done.' }] };
  }
);
```

### Tool Return Values

Tools return `CallToolResult`:

```javascript
// ✅ Success
return {
  content: [{ type: 'text', text: 'result data' }]
};

// ✅ Error
return {
  content: [{ type: 'text', text: 'Something went wrong' }],
  isError: true
};

// ✅ Multiple content items
return {
  content: [
    { type: 'text', text: 'Here is your data:' },
    { type: 'text', text: JSON.stringify(data, null, 2) }
  ]
};
```

**Content types:** `text`, `image` (base64), `resource_link` (URI reference to a resource).

---

## 5. Registering Resources

Resources are **read-only data** that clients can attach to context.

### Pattern: Static resource (fixed URI)

```javascript
server.registerResource(
  'graph-index',                             // resource name
  'myapp://derived/graph-index',             // fixed URI
  {
    title: 'Memory Graph Index',
    description: 'JSONL index of all nodes.',
    mimeType: 'application/jsonl'
  },
  async () => {
    const text = fs.readFileSync(indexPath, 'utf8');
    return {
      contents: [{ uri: 'myapp://derived/graph-index', text }]
    };
  }
);
```

### Pattern: Template resource (dynamic URI)

```javascript
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';

server.registerResource(
  'memory-node',
  new ResourceTemplate('myapp://vault/{category}/{slug}', { list: undefined }),
  {
    title: 'Memory Node',
    description: 'Read a specific memory node.',
    mimeType: 'text/markdown'
  },
  async (uri, { category, slug }) => {
    const text = fs.readFileSync(`vault/${category}/${slug}.md`, 'utf8');
    return {
      contents: [{ uri: uri.href, text }]
    };
  }
);
```

The second argument to `ResourceTemplate` requires `{ list: ... }`. Set to `undefined` if you don't support enumeration, or provide a callback that returns `{ resources: [...] }`.

---

## 6. Registering Prompts

Prompts are **user-selectable templates** that generate prefilled messages.

### Pattern: Prompt with args

```javascript
server.registerPrompt(
  'analyze-memory',
  {
    title: 'Analyze Memory',
    description: 'Analyze a memory node for quality.',
    argsSchema: {
      slug: z.string().describe('Slug of the node to analyze')
    }
  },
  async ({ slug }) => {
    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Analyze this memory node: ${slug}`
          }
        }
      ]
    };
  }
);
```

### Pattern: Prompt with no args

```javascript
server.registerPrompt(
  'summarize-vault',
  {
    title: 'Summarize Vault',
    description: 'Summarize the vault state.'
  },
  async () => {
    return {
      messages: [
        {
          role: 'user',
          content: { type: 'text', text: 'Summarize the vault health.' }
        }
      ]
    };
  }
);
```

---

## 7. Common Pitfalls (MUST READ)

### ❌ Pitfall 1: Using SSEServerTransport
```javascript
// ❌ WRONG — deprecated transport from 2024-11-05
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
```
```javascript
// ✅ CORRECT — current spec 2025-06-18
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
```

### ❌ Pitfall 2: Using deprecated .tool() method
```javascript
// ❌ WRONG — .tool() is deprecated
server.tool('my_tool', 'description', { name: z.string() }, async ({ name }) => { ... });
```
```javascript
// ✅ CORRECT — .registerTool() is the current API
server.registerTool('my_tool', {
  description: 'description',
  inputSchema: { name: z.string() }
}, async ({ name }) => { ... });
```

### ❌ Pitfall 3: Wrapping inputSchema in z.object()
```javascript
// ❌ WRONG — do NOT wrap in z.object()
inputSchema: z.object({ slug: z.string() })
```
```javascript
// ✅ CORRECT — pass the raw shape object
inputSchema: { slug: z.string() }
```

### ❌ Pitfall 4: Using console.log() instead of console.error()
The MCP spec reserves **stdout** for protocol messages (in stdio transport). Even for HTTP transports, always use `console.error()` for logging to maintain compatibility and avoid accidentally corrupting protocol output.

### ❌ Pitfall 5: Using createMcpExpressApp() for custom routing
`createMcpExpressApp()` is a convenience wrapper from the SDK. For custom Express apps with additional routes, use a standard `express()` app with `express.json()` middleware and manually wire the three endpoints (POST, GET, DELETE).

### ❌ Pitfall 6: Sharing a single McpServer across sessions
Each client session needs its own `McpServer` instance. Create the server inside a factory function and call it per session initialization.

### ❌ Pitfall 7: Forgetting the Accept header requirement
MCP Streamable HTTP clients MUST send `Accept: application/json, text/event-stream`. If you're testing with curl, include both:
```bash
curl -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{...},"id":1}'
```

### ❌ Pitfall 8: Session ID in query params instead of header
```javascript
// ❌ WRONG
const sessionId = req.query.sessionId;
```
```javascript
// ✅ CORRECT — Streamable HTTP uses the header
const sessionId = req.headers['mcp-session-id'];
```

### ❌ Pitfall 9: Returning structuredContent without outputSchema
If you declare an `outputSchema`, you MUST return `structuredContent` that matches it. If you don't need structured output validation, simply omit `outputSchema` entirely and return `content` only.

---

## 8. Testing with curl

### Initialize a session
```bash
curl -si -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}},"id":1}'
```
Look for `Mcp-Session-Id` in the response headers.

### List tools
```bash
curl -s -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Mcp-Session-Id: YOUR_SESSION_ID" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":2}'
```

### Call a tool
```bash
curl -s -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Mcp-Session-Id: YOUR_SESSION_ID" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"read_memory","arguments":{"slug":"my-node"}},"id":3}'
```

---

## 9. Reference Implementation

The canonical implementation for this project lives at:

**`src/server/mcp.mjs`**

It implements all three capabilities (tools, resources, prompts) using the Streamable HTTP transport. Use it as the authoritative reference for any MCP work in this repository.

---

## 10. Spec Watcher

This skill includes an automated watcher (`scripts/watch.mjs`) that runs daily via the OS daemon's cron system. It polls the GitHub releases API for `@modelcontextprotocol/sdk` and, if a new version is detected, triggers the local kernel to update this skill file with any breaking changes.

**Monitored repositories:**
- https://github.com/modelcontextprotocol/typescript-sdk (SDK releases)
- https://github.com/modelcontextprotocol/specification (Spec changes)

---

## Changelog

### v2.0.0 (2026-05-11)
- **BREAKING**: Complete rewrite. Removed all deprecated patterns.
- Switched from `server.tool()` to `server.registerTool()`.
- Switched from SSEServerTransport to StreamableHTTPServerTransport.
- Added Resources (§5) and Prompts (§6) documentation.
- Added 9 common pitfalls with correct/incorrect code examples.
- Added curl testing guide.
- Added reference to canonical `src/server/mcp.mjs` implementation.
- Added spec watcher for automated staleness detection.
- Fixed frontmatter to use `name`/`description` format for IDE discovery.

### v1.0.0 (2026-05-10)
- Initial skill created by previous agent. Used incorrect frontmatter format (`type`/`slug`/`category` instead of `name`/`description`), preventing IDE discovery. Contained deprecated `server.tool()` API and incomplete transport guidance.


<!-- BEGIN INJECTED MEMORY: do not edit by hand; rebuilt by total-recall surface -->
<!-- @route: tfidf, generated_at: 2026-05-21T08:13:53.299Z -->

<!-- END INJECTED MEMORY -->
