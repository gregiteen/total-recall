import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import path from "path";
import fs from "fs";
import { bm25Query } from "../core/surface.mjs";
import { writeNode } from "../core/vault.mjs";
import Database from "better-sqlite3";

const server = new Server(
  {
    name: "total-recall-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// We need to resolve the vault dir from the directory where the MCP server was launched
const root = process.cwd();
const dataDir = path.join(root, ".agent");
const vaultDir = path.join(dataDir, "memory-vault");
const derivedDir = path.join(dataDir, "memory-derived");
const ftsDbPath = path.join(derivedDir, "fts5.db");

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "search_memory",
        description: "Search the local Total Recall memory vault using BM25 semantic scoring. Use this to retrieve lore, facts, constraints, and architecture decisions.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "The search query (e.g. 'How do we deploy?' or 'User preferences')",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "write_memory",
        description: "Write a new permanent memory node to the Total Recall vault.",
        inputSchema: {
          type: "object",
          properties: {
            slug: { type: "string", description: "Unique kebab-case identifier" },
            category: { type: "string", enum: ["invariants", "preferences", "facts", "lore", "concepts", "patterns", "anti-patterns", "decisions"] },
            title: { type: "string" },
            body: { type: "string" },
            modality: { type: "string", enum: ["must", "must_not", "should", "should_not", "descriptive", "preference"] },
          },
          required: ["slug", "category", "title", "body", "modality"],
        },
      }
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    if (request.params.name === "search_memory") {
      const { query } = request.params.arguments;
      if (!fs.existsSync(ftsDbPath)) {
        return { content: [{ type: "text", text: "FTS database not found. Please run 'total-recall compile' first." }] };
      }
      
      const db = new Database(ftsDbPath, { readonly: true });
      const results = bm25Query(db, query, 5);
      db.close();

      if (results.length === 0) {
        return { content: [{ type: "text", text: "No matching memory nodes found." }] };
      }

      return {
        content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
      };
    }

    if (request.params.name === "write_memory") {
      const args = request.params.arguments;
      const node = {
        type: "memory",
        schema_version: 2,
        status: "active",
        importance: 3,
        priority: "normal",
        ...args
      };
      
      const filePath = writeNode(node, vaultDir);
      
      // Trigger async compilation via child process
      import("child_process").then(({ spawn }) => {
        spawn("npx", ["total-recall", "compile"], { stdio: "ignore", detached: true }).unref();
      });

      return {
        content: [{ type: "text", text: `Memory successfully written to ${filePath} and background compilation started.` }],
      };
    }

    throw new Error("Tool not found");
  } catch (error) {
    return {
      content: [{ type: "text", text: `Error: ${error.message}` }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
server.connect(transport).catch(console.error);
