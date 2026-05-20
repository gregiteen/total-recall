import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { mountMcp } from './mcp.mjs';

const app = express();
app.use(express.json());
mountMcp(app);

let tempAgentDir;
let oldAgentDir;

beforeEach(() => {
  oldAgentDir = process.env.AGENT_DIR;
  tempAgentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'total-recall-mcp-'));
  process.env.AGENT_DIR = tempAgentDir;

  fs.mkdirSync(path.join(tempAgentDir, 'skills', 'ssss', 'references'), { recursive: true });
  fs.mkdirSync(path.join(tempAgentDir, 'memory-derived'), { recursive: true });
  fs.writeFileSync(path.join(tempAgentDir, 'INSTRUCTIONS.md'), '# Instructions\n\nMCP_INSTRUCTIONS_FIXTURE\n');
  fs.writeFileSync(path.join(tempAgentDir, 'skills', 'ssss', 'SKILL.md'), '# SSSS Skill\n\nMCP_SKILL_FIXTURE\n');
  fs.writeFileSync(path.join(tempAgentDir, 'skills', 'ssss', 'references', 'ssss-spec.md'), '# SSSS Spec\n\nMCP_SPEC_FIXTURE\n');
  fs.writeFileSync(path.join(tempAgentDir, 'memory-derived', 'graph-index.jsonl'), '{"slug":"example"}\n');
  fs.writeFileSync(path.join(tempAgentDir, 'memory-derived', 'memory-layers.jsonl'), '{"slug":"example","memory_layer":"conscious"}\n');
});

afterEach(() => {
  if (oldAgentDir === undefined) delete process.env.AGENT_DIR;
  else process.env.AGENT_DIR = oldAgentDir;
  fs.rmSync(tempAgentDir, { recursive: true, force: true });
});

describe('MCP Gateway', () => {
  it('rejects POST /mcp without session ID for non-initialize', async () => {
    const res = await request(app)
      .post('/mcp')
      .send({ method: 'some_method' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('handshake: initialize → returns session id and server capabilities', async () => {
    const res = await request(app)
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .set('Content-Type', 'application/json')
      .send({
        jsonrpc: '2.0',
        id: 0,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'vitest-client', version: '0.0.1' }
        }
      });

    expect(res.status).toBe(200);
    expect(res.headers['mcp-session-id']).toBeTruthy();

    // StreamableHTTP responds either as JSON or as an SSE event.
    // Parse the InitializeResult out of whichever form arrived.
    const raw = typeof res.text === 'string' && res.text.length ? res.text : JSON.stringify(res.body);
    const ssePayload = (() => {
      const dataLine = raw.split('\n').find(l => l.startsWith('data:'));
      return dataLine ? dataLine.slice(5).trim() : raw;
    })();
    const parsed = JSON.parse(ssePayload);
    expect(parsed.jsonrpc).toBe('2.0');
    expect(parsed.result).toBeDefined();
    expect(parsed.result.serverInfo?.name).toBe('total-recall');
    expect(parsed.result.protocolVersion).toBeDefined();
  });

  it('tool call (sync-rpc): tools/list returns the registered Total Recall tools', async () => {
    const res = await request(app)
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .set('Content-Type', 'application/json')
      .set('x-sync-rpc', 'true')
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {}
      });

    expect(res.status).toBe(200);
    expect(res.body.jsonrpc).toBe('2.0');
    expect(res.body.result?.tools).toBeInstanceOf(Array);
    const names = res.body.result.tools.map(t => t.name);
    // The core SSSS tools must always be exposed.
    expect(names).toEqual(expect.arrayContaining([
      'read_memory', 'write_memory', 'search_memory', 'list_memory',
      'run_sandbox', 'recompile_surface'
    ]));
  });

  it('tool call (sync-rpc): list_memory executes and returns a JSON content payload', async () => {
    const res = await request(app)
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .set('Content-Type', 'application/json')
      .set('x-sync-rpc', 'true')
      .send({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'list_memory', arguments: {} }
      });

    expect(res.status).toBe(200);
    expect(res.body.result?.content).toBeInstanceOf(Array);
    const text = res.body.result.content[0]?.text;
    expect(typeof text).toBe('string');
    // The tool returns a JSON-serialized array; either empty or populated, but valid JSON.
    expect(() => JSON.parse(text)).not.toThrow();
    expect(Array.isArray(JSON.parse(text))).toBe(true);
  });

  it('resource calls (sync-rpc): resources/list exposes SSSS and derived resources', async () => {
    const res = await request(app)
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .set('Content-Type', 'application/json')
      .set('x-sync-rpc', 'true')
      .send({
        jsonrpc: '2.0',
        id: 3,
        method: 'resources/list',
        params: {}
      });

    expect(res.status).toBe(200);
    const uris = res.body.result.resources.map(resource => resource.uri);
    expect(uris).toEqual(expect.arrayContaining([
      'total-recall://instructions',
      'total-recall://ssss/skill',
      'total-recall://ssss/spec',
      'total-recall://memory/index',
      'total-recall://memory/layers'
    ]));
  });

  it('resource calls (sync-rpc): resources/read returns resource contents', async () => {
    const res = await request(app)
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .set('Content-Type', 'application/json')
      .set('x-sync-rpc', 'true')
      .send({
        jsonrpc: '2.0',
        id: 4,
        method: 'resources/read',
        params: { uri: 'total-recall://ssss/spec' }
      });

    expect(res.status).toBe(200);
    expect(res.body.result.contents[0].uri).toBe('total-recall://ssss/spec');
    expect(res.body.result.contents[0].mimeType).toBe('text/markdown');
    expect(res.body.result.contents[0].text).toContain('MCP_SPEC_FIXTURE');
  });
});
