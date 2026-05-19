import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let auth;
let keys;
let tempAgentDir;
let oldAgentDir;

function req(headers = {}, ip = '127.0.0.1', remoteAddress = '127.0.0.1') {
  return {
    headers,
    ip,
    socket: { remoteAddress },
    cookies: {}
  };
}

function res() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

describe('server auth request locality', () => {
  beforeEach(async () => {
    oldAgentDir = process.env.AGENT_DIR;
    tempAgentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'total-recall-auth-'));
    process.env.AGENT_DIR = tempAgentDir;
    vi.resetModules();
    auth = await import('./auth.mjs');
    keys = await import('./keys.mjs');
  });

  afterEach(() => {
    if (oldAgentDir === undefined) delete process.env.AGENT_DIR;
    else process.env.AGENT_DIR = oldAgentDir;
    fs.rmSync(tempAgentDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('allows a direct localhost request to use the health bypass', () => {
    expect(auth.isLocalRequest(req())).toBe(true);
  });

  it('does not treat proxied public traffic as local just because Caddy connects from localhost', () => {
    const proxied = req({ 'x-forwarded-for': '203.0.113.10' });
    expect(auth.isLocalRequest(proxied)).toBe(false);
  });

  it('only treats forwarded traffic as local when all forwarded clients are loopback', () => {
    expect(auth.isLocalRequest(req({ 'x-forwarded-for': '127.0.0.1, ::1' }))).toBe(true);
    expect(auth.isLocalRequest(req({ forwarded: 'for=203.0.113.10;proto=https' }))).toBe(false);
  });

  it('requires auth for proxied public health requests when public health is disabled', () => {
    const response = res();
    const next = vi.fn();

    auth.requireAuthOrLocal(req({ 'x-forwarded-for': '203.0.113.10' }), response, next);

    expect(next).not.toHaveBeenCalled();
    expect(response.statusCode).toBe(401);
  });

  it('attaches PAT scopes and allows matching required scopes', () => {
    const issued = keys.issueKey('readonly', { scopes: ['memory:read'] });
    const request = req({ authorization: `Bearer ${issued.token}` });
    const response = res();
    const next = vi.fn();

    auth.requireAuth(request, response, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(request.auth.scopes).toEqual(['memory:read']);

    const scopeNext = vi.fn();
    auth.requireScope('memory:read')(request, response, scopeNext);
    expect(scopeNext).toHaveBeenCalledTimes(1);
  });

  it('rejects requests when the PAT lacks a required scope', () => {
    const issued = keys.issueKey('readonly', { scopes: ['memory:read'] });
    const request = req({ authorization: `Bearer ${issued.token}` });
    const response = res();

    auth.requireAuth(request, response, vi.fn());
    auth.requireScope('memory:write')(request, response, vi.fn());

    expect(response.statusCode).toBe(403);
    expect(response.body.required_scopes).toEqual(['memory:write']);
  });

  it('treats dashboard sessions as full-scope for route guards', () => {
    const request = { ...req(), auth: { type: 'dashboard_session', scopes: [] } };
    const response = res();
    const next = vi.fn();

    auth.requireScope('keys:write')(request, response, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(response.statusCode).toBe(200);
  });
});
