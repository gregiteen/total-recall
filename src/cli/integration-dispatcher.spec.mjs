import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import matter from 'gray-matter';
import dispatchIntegrationCommand from './integration-dispatcher.mjs';

let tmpAgentDir;
let origAgentDir;
let origEnv;

beforeEach(() => {
  tmpAgentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-dispatcher-test-'));
  origAgentDir = process.env.AGENT_DIR;
  origEnv = { ...process.env };
  process.env.AGENT_DIR = tmpAgentDir;

  // Setup mock integrations folder
  const integrationsDir = path.join(tmpAgentDir, 'skills', 'total-recall', 'integrations');
  fs.mkdirSync(integrationsDir, { recursive: true });

  // 1. Mock GitHub SSSS Integration Node
  const githubContent = `---
type: integration
slug: github
name: "GitHub"
api_base_url: "https://api.github.com"
auth_type: "Bearer Token"
env_vars:
  - MOCK_GITHUB_TOKEN
headers:
  Accept: "application/vnd.github+json"
  Authorization: "Bearer <GITHUB_TOKEN>"
endpoints:
  list_issues: "GET /repos/{owner}/{repo}/issues"
  create_issue: "POST /repos/{owner}/{repo}/issues"
schema_version: 2
---
`;
  fs.writeFileSync(path.join(integrationsDir, 'github.md'), githubContent, 'utf8');
});

afterEach(() => {
  if (origAgentDir === undefined) delete process.env.AGENT_DIR;
  else process.env.AGENT_DIR = origAgentDir;
  process.env = origEnv;
  fs.rmSync(tmpAgentDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('Dynamic Integration Dispatcher', () => {
  it('correctly parses, binds, and executes GET requests with placeholders', async () => {
    process.env.MOCK_GITHUB_TOKEN = 'test-token-123';

    // Mock global.fetch to inspect request parameters
    const origFetch = global.fetch;
    let requestedUrl = '';
    let requestedOpts = {};
    global.fetch = vi.fn().mockImplementation(async (url, opts) => {
      requestedUrl = url;
      requestedOpts = opts;
      return {
        ok: true,
        text: async () => JSON.stringify([{ id: 1, title: 'Test Issue' }])
      };
    });

    const result = await dispatchIntegrationCommand('github', 'list_issues', {
      owner: 'example-org',
      repo: 'total-recall',
      state: 'open'
    });

    global.fetch = origFetch;

    // Check placeholder replacements & query params
    expect(requestedUrl).toBe('https://api.github.com/repos/example-org/total-recall/issues?state=open');
    expect(requestedOpts.method).toBe('GET');
    
    // Check authentication token injection
    expect(requestedOpts.headers['Authorization']).toBe('Bearer test-token-123');
    expect(requestedOpts.headers['Accept']).toBe('application/vnd.github+json');

    // Check parsed JSON return value
    expect(result).toBeInstanceOf(Array);
    expect(result[0].title).toBe('Test Issue');
  });

  it('correctly executes POST requests with JSON body parameters', async () => {
    process.env.MOCK_GITHUB_TOKEN = 'test-token-456';

    const origFetch = global.fetch;
    let requestedUrl = '';
    let requestedOpts = {};
    global.fetch = vi.fn().mockImplementation(async (url, opts) => {
      requestedUrl = url;
      requestedOpts = opts;
      return {
        ok: true,
        text: async () => JSON.stringify({ id: 99, success: true })
      };
    });

    const result = await dispatchIntegrationCommand('github', 'create_issue', {
      owner: 'greg',
      repo: 'recall',
      title: 'Bug report',
      body: 'Something failed'
    });

    global.fetch = origFetch;

    expect(requestedUrl).toBe('https://api.github.com/repos/greg/recall/issues');
    expect(requestedOpts.method).toBe('POST');
    expect(requestedOpts.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(requestedOpts.body)).toEqual({
      title: 'Bug report',
      body: 'Something failed'
    });
    expect(result.id).toBe(99);
  });

  it('throws an error if a required path placeholder is missing', async () => {
    await expect(
      dispatchIntegrationCommand('github', 'list_issues', { owner: 'example-org' })
    ).rejects.toThrow('Missing required path variable: --repo');
  });
});
