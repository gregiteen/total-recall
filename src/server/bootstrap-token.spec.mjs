/**
 * Bootstrap token validity, end to end through `requireAuth`.
 *
 * The zero-config bootstrap in `init.mjs` writes a PAT into each brain's
 * `config/brain.json`. That token is only useful if the running server can
 * *find* it, and the server authenticates every request against exactly one
 * key store: the store under `brainDir`, which `core/config.mjs` derives from
 * `AGENT_DIR` (the GLOBAL brain when a server process is started by launchd).
 *
 * `init.mjs` used to call `issueKey` after an earlier step had already set
 * `process.env.AGENT_DIR` to the project root, so the key was minted into
 * `<project>/.agent/.../keys.jsonl` while `brain.json` was read by a server
 * authenticating against `~/.agent/.../keys.jsonl`. The bootstrap succeeded,
 * reported "pre-authorized", and every request with that token then answered
 * 401 — which surfaced as `startup check` reporting `brain failed`
 * (`instructions-http-401`) and overall readiness false, on every project.
 *
 * This spec pins the contract that must hold, whatever the caller's
 * environment says: a token issued from a project root is accepted by the
 * server's auth middleware.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PluginStateStore } from '../core/plugin-state-store.mjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let savedAgentDir;
let serverAgentDir;
let projectDir;

function mockRequest(headers = {}) {
  return {
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    headers,
    path: '/api/instructions',
    method: 'GET',
    cookies: {},
    once: vi.fn(),
  };
}

function mockResponse() {
  const response = {
    statusCode: 200,
    body: null,
    headers: {},
    set: vi.fn(),
    status(code) { response.statusCode = code; return response; },
    json(payload) { response.body = payload; return response; },
    send(payload) { response.body = payload; return response; },
    once: vi.fn(),
  };
  return response;
}

async function loadServerAuth() {
  vi.resetModules();
  return import('./auth.mjs');
}

async function loadKeys() {
  vi.resetModules();
  return import('./keys.mjs');
}

beforeEach(() => {
  savedAgentDir = process.env.AGENT_DIR;
  serverAgentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-server-agent-'));
  projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-project-'));
  // The server process authenticates against this store, and only this store.
  process.env.AGENT_DIR = serverAgentDir;
});

afterEach(() => {
  if (savedAgentDir === undefined) delete process.env.AGENT_DIR;
  else process.env.AGENT_DIR = savedAgentDir;
  fs.rmSync(serverAgentDir, { recursive: true, force: true });
  fs.rmSync(projectDir, { recursive: true, force: true });
});

describe('bootstrap token authentication', () => {
  it('accepts a token minted for a project brain at the server key store', async () => {
    const keys = await loadKeys();
    const issued = keys.issueKey('Default Local Developer Key', { scopes: ['*'] });

    const auth = await loadServerAuth();
    const request = mockRequest({ authorization: `Bearer ${issued.token}` });
    const response = mockResponse();
    const next = vi.fn();

    auth.requireAuth(request, response, next);

    expect(response.statusCode).toBe(200);
    expect(next).toHaveBeenCalledTimes(1);
    expect(request.auth.key_id).toBe(issued.id);
  });

  it('mints the bootstrap key into the store the server reads, not the project root', async () => {
    // Reproduce the bootstrap ordering that broke: a project brain exists and
    // is where the caller would resolve by default, but the server has a fixed
    // store and only that store can validate the token it hands out.
    const projectBrainConfig = path.join(projectDir, '.agent', 'skills', 'total-recall', 'config');
    fs.mkdirSync(projectBrainConfig, { recursive: true });

    const keys = await loadKeys();
    const issued = keys.issueKey('Default Local Developer Key', { scopes: ['*'] });
    const brainJsonPath = path.join(projectBrainConfig, 'brain.json');
    fs.writeFileSync(brainJsonPath, JSON.stringify({ url: 'http://localhost:3000', token: issued.token }, null, 2));

    // The issued token must never be persisted, only its hash.
    const stored = new PluginStateStore(
      path.join(serverAgentDir, 'skills', 'total-recall', 'config', 'keys.jsonl'),
      'auth',
    ).read([]);
    expect(JSON.stringify(stored)).not.toContain(issued.token);
    expect(stored.some(entry => entry.id === issued.id)).toBe(true);

    // Nothing was minted into the project's own store, which the server never reads.
    expect(new PluginStateStore(
      path.join(projectDir, '.agent', 'skills', 'total-recall', 'config', 'keys.jsonl'),
      'auth',
    ).read([])).toEqual([]);

    // ...and the token in brain.json is the one the server accepts.
    const brainToken = JSON.parse(fs.readFileSync(brainJsonPath, 'utf8')).token;
    const auth = await loadServerAuth();
    const response = mockResponse();
    const next = vi.fn();
    auth.requireAuth(mockRequest({ authorization: `Bearer ${brainToken}` }), response, next);
    expect(response.statusCode).toBe(200);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('rejects a brain.json token that is absent from the server key store', async () => {
    const auth = await loadServerAuth();
    const response = mockResponse();
    const next = vi.fn();

    auth.requireAuth(mockRequest({ authorization: 'Bearer tr_notInThisStore000000000000000000000000' }), response, next);

    expect(response.statusCode).toBe(401);
    expect(response.body.error).toBe('Invalid PAT');
    expect(next).not.toHaveBeenCalled();
  });
});
