# Streamable HTTP Transport — Key Spec Excerpts

> Source: https://modelcontextprotocol.io/docs/concepts/transports
> Source: https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
> SDK: https://github.com/modelcontextprotocol/typescript-sdk

## Transport Summary

Streamable HTTP replaces the deprecated HTTP+SSE transport (2024-11-05). It uses a **single endpoint** (e.g., `/mcp`) with three HTTP methods:

| Method | Purpose |
|:---|:---|
| `POST` | Client sends JSON-RPC messages (initialize, tool calls, notifications) |
| `GET` | Client opens SSE stream for server-initiated messages |
| `DELETE` | Client terminates a session |

## Session Management

- Server MAY assign a session ID via `Mcp-Session-Id` response header during `InitializeResult`
- Client MUST include `Mcp-Session-Id` header on all subsequent requests
- Session ID MUST be cryptographically secure (UUID, JWT, or crypto hash)
- Session ID MUST only contain visible ASCII (0x21–0x7E)

## POST Rules

1. Body MUST be a single JSON-RPC request, notification, or response
2. Client MUST include `Accept: application/json, text/event-stream`
3. For notifications/responses: server returns `202 Accepted` (no body)
4. For requests: server returns either `Content-Type: application/json` OR `Content-Type: text/event-stream`

## Security

1. Servers MUST validate the `Origin` header on all incoming connections
2. When running locally, servers SHOULD bind to `127.0.0.1` (not `0.0.0.0`)
3. Servers SHOULD implement proper authentication

## SDK Classes

### StreamableHTTPServerTransport

```javascript
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

const transport = new StreamableHTTPServerTransport({
  sessionIdGenerator: () => randomUUID(),        // or undefined for stateless
  onsessioninitialized: (sessionId) => { ... }   // called after initialize handshake
});

// Handle any HTTP request (POST, GET, DELETE)
await transport.handleRequest(req, res, body);

// Session ID (available after initialization)
transport.sessionId;

// Close callback
transport.onclose = () => { ... };
```

### McpServer

```javascript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const server = new McpServer(
  { name: 'server-name', version: '1.0.0' },  // Implementation info
  { capabilities: { logging: {} } }            // Server options
);

// Connect to a transport
await server.connect(transport);

// Register capabilities (see SKILL.md §4, §5, §6)
server.registerTool(name, config, handler);
server.registerResource(name, uriOrTemplate, config, handler);
server.registerPrompt(name, config, handler);
```

## Deprecated Classes (DO NOT USE)

| Class | Status | Replacement |
|:---|:---|:---|
| `SSEServerTransport` | Deprecated (2024-11-05 spec) | `StreamableHTTPServerTransport` |
| `server.tool()` | Deprecated | `server.registerTool()` |
| `server.resource()` | Deprecated | `server.registerResource()` |
| `server.prompt()` | Deprecated | `server.registerPrompt()` |
