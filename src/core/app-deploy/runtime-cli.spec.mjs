import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import {
  normalizeAppCliSpec,
  validateAppCliSpec,
  generateAppCli,
  languageForAdapter,
  AppCliSpecError,
} from './runtime-cli.mjs';
import { validatePluginManifest } from '../plugin-loader.mjs';
import { run as runAppCli } from '../../cli/app/index.mjs';

const SPEC = {
  name: 'notes',
  description: 'Notes app CLI',
  api: { base_url_env: 'NOTES_API_URL', default_base_url: 'http://127.0.0.1:3900/api/' },
  auth: { type: 'bearer', token_env: 'NOTES_TOKEN' },
  commands: [
    {
      name: 'list', method: 'GET', path: '/notes', description: 'List notes',
      args: [
        { name: 'limit', type: 'integer', default: 20 },
        { name: 'done', type: 'boolean' },
        { name: 'tag', type: 'string', choices: ['home', 'work'] },
      ],
    },
    { name: 'get', method: 'GET', path: '/notes/{id}', args: [{ name: 'id', type: 'string', positional: true }] },
    {
      name: 'add', method: 'POST', path: '/notes',
      args: [
        { name: 'title', type: 'string', positional: true },
        { name: 'priority', type: 'integer', choices: [1, 2, 3], required: true },
        { name: 'weight', type: 'number' },
        { name: 'urgent', type: 'boolean' },
      ],
    },
    { name: 'remove', method: 'DELETE', path: '/notes/{id}', args: [{ name: 'id', type: 'string', required: true }] },
  ],
};

function withSpec(mutate) {
  const copy = structuredClone(SPEC);
  mutate(copy);
  return copy;
}

describe('app_cli spec validation', () => {
  it('normalizes a valid spec: defaults filled, trailing slash dropped, flags made explicit', () => {
    const spec = normalizeAppCliSpec(SPEC);
    expect(spec.api).toEqual({ timeout_seconds: 30, base_url_env: 'NOTES_API_URL', default_base_url: 'http://127.0.0.1:3900/api' });
    expect(spec.commands[1].args[0]).toEqual({ name: 'id', type: 'string', positional: true, required: true });
    expect(validateAppCliSpec(SPEC)).toEqual([]);
  });

  it.each([
    ['a non-loopback default URL', (s) => { s.api.default_base_url = 'https://api.example.com'; }, /loopback/],
    ['credentials in the default URL', (s) => { s.api.default_base_url = 'http://user:pw@127.0.0.1:1'; }, /loopback/],
    ['an unknown field', (s) => { s.commands[0].shell = 'rm -rf /'; }, /unknown field 'shell'/],
    ['a placeholder without an arg', (s) => { s.commands[1].path = '/notes/{slug}'; }, /\{slug\} has no matching arg/],
    ['a placeholder on an optional arg', (s) => { s.commands[3].args[0].required = false; }, /must be a required or positional/],
    ['a traversing path', (s) => { s.commands[0].path = '/notes/../admin'; }, /without '\.\.'/],
    ['a query string in the path', (s) => { s.commands[0].path = '/notes?all=1'; }, /must start with/],
    ['a positional boolean', (s) => { s.commands[0].args[1].positional = true; }, /boolean cannot be positional/],
    ['a reserved arg name', (s) => { s.commands[0].args.push({ name: 'json', type: 'boolean' }); }, /reserved/],
    ['a default outside its choices', (s) => { s.commands[0].args[2].default = 'garden'; }, /one of its choices/],
    ['a default of the wrong type', (s) => { s.commands[0].args[0].default = '20'; }, /default must be a integer/],
    ['duplicate commands', (s) => { s.commands.push(structuredClone(s.commands[0])); }, /duplicate names/],
    ['an unknown method', (s) => { s.commands[0].method = 'TRACE'; }, /method must be one of/],
    ['a lowercase env name', (s) => { s.api.base_url_env = 'notes_url'; }, /base_url_env/],
  ])('rejects %s', (_label, mutate, pattern) => {
    expect(() => normalizeAppCliSpec(withSpec(mutate))).toThrow(AppCliSpecError);
    expect(validateAppCliSpec(withSpec(mutate)).join('\n')).toMatch(pattern);
  });

  it('makes the plugin manifest invalid when app_cli is invalid', () => {
    const manifest = { id: 'notes', name: 'Notes', version: '1.0.0', description: 'Notes capability', app_cli: withSpec((s) => { s.commands = []; }) };
    const result = validatePluginManifest(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors.join('\n')).toMatch(/commands must be a non-empty array/);
    expect(validatePluginManifest({ ...manifest, app_cli: SPEC }).valid).toBe(true);
  });

  it('maps adapters to languages and refuses unknown ones', () => {
    expect(languageForAdapter('flask')).toBe('python');
    expect(languageForAdapter('nextjs')).toBe('node');
    expect(() => languageForAdapter('rails')).toThrow(/No app CLI language/);
  });
});

describe('app CLI generation', () => {
  it('is deterministic and self-contained', () => {
    for (const language of ['node', 'python']) {
      const a = generateAppCli(SPEC, { language, source: { id: 'notes', version: '1.0.0' } });
      const b = generateAppCli(structuredClone(SPEC), { language, source: { id: 'notes', version: '1.0.0' } });
      expect(a.content).toBe(b.content);
      expect(a.sha256).toBe(b.sha256);
      expect(a.content).toContain('from plugin notes@1.0.0');
      expect(a.content).not.toMatch(/__SPEC__|__HEADER__/);
      expect(a.content).not.toMatch(/total-recall\/|\.agent\/|skills\/total-recall/);
    }
    expect(generateAppCli(SPEC, { language: 'node' }).path).toBe('bin/notes.mjs');
    expect(generateAppCli(withSpec((s) => { s.name = 'notes-cli'; }), { language: 'python' }).path).toBe('notes_cli.py');
    // The Node file imports nothing; the Python file imports only the standard library.
    expect(generateAppCli(SPEC, { language: 'node' }).content).not.toMatch(/^\s*import\s|require\(/m);
    const pyImports = generateAppCli(SPEC, { language: 'python' }).content.match(/^(?:from \S+ )?import .+$/gm);
    expect(pyImports).toEqual([
      'from __future__ import annotations',
      'import argparse', 'import json', 'import math', 'import os', 'import re', 'import sys',
      'import urllib.error', 'import urllib.parse', 'import urllib.request',
    ]);
  });

  it('refuses an unknown language', () => {
    expect(() => generateAppCli(SPEC, { language: 'ruby' })).toThrow(/Unknown app CLI language/);
  });
});

// A real HTTP app for the generated CLIs to call. Records every request.
function startApp() {
  const seen = [];
  const notes = new Map([['n1', { id: 'n1', title: 'First' }]]);
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const url = new URL(req.url, 'http://127.0.0.1');
      seen.push({ method: req.method, path: url.pathname, rawPath: req.url.split('?')[0], query: Object.fromEntries(url.searchParams), body: body ? JSON.parse(body) : null, auth: req.headers.authorization || null });
      const send = (status, payload) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(payload)); };
      const match = url.pathname.match(/^\/api\/notes(?:\/(.+))?$/);
      if (!match) return send(404, { error: 'no route' });
      const id = match[1] && decodeURIComponent(match[1]);
      if (req.method === 'GET' && !id) return send(200, { notes: [...notes.values()] });
      if (req.method === 'GET') return notes.has(id) ? send(200, notes.get(id)) : send(404, { error: 'note not found' });
      if (req.method === 'POST') return send(201, { id: 'n2', ...JSON.parse(body) });
      if (req.method === 'DELETE') return send(200, { deleted: id });
      return send(405, { error: 'method not allowed' });
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, seen, port: server.address().port })));
}

function execute(command, args, { cwd, env }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c) => { stdout += c; });
    child.stderr.on('data', (c) => { stderr += c; });
    child.on('error', reject);
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

describe.each([
  ['node', process.execPath],
  ['python', 'python3'],
])('generated %s CLI against a live app', (language, interpreter) => {
  let app;
  let dir;
  let file;
  let env;

  beforeAll(async () => {
    app = await startApp();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), `tr-app-cli-${language}-`));
    const generated = generateAppCli(SPEC, { language });
    file = path.join(dir, path.basename(generated.path));
    fs.writeFileSync(file, generated.content, { mode: generated.mode });
    // No Total Recall in reach: an empty HOME, no NODE_PATH/PYTHONPATH, cwd outside any repo.
    env = {
      PATH: process.env.PATH,
      HOME: dir,
      NOTES_API_URL: `http://127.0.0.1:${app.port}/api`,
      NOTES_TOKEN: 'test-token',
    };
  });

  afterAll(() => {
    app.server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  beforeEach(() => { app.seen.length = 0; });

  const cli = (...args) => execute(interpreter, [file, ...args], { cwd: dir, env });

  it('sends typed query args and prints a JSON envelope', async () => {
    const result = await cli('list', '--done', '--tag', 'work', '--json');
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ ok: true, status: 200, data: { notes: [{ id: 'n1', title: 'First' }] } });
    expect(app.seen[0]).toMatchObject({ method: 'GET', path: '/api/notes', query: { limit: '20', done: 'true', tag: 'work' }, auth: 'Bearer test-token' });
  });

  it('sends a typed JSON body with positional and flag args', async () => {
    const result = await cli('add', 'Buy milk', '--priority', '2', '--weight', '1.5', '--urgent', '--json');
    expect(result.status, result.stderr).toBe(0);
    expect(app.seen[0].body).toEqual({ title: 'Buy milk', priority: 2, weight: 1.5, urgent: true });
    expect(JSON.parse(result.stdout).data).toMatchObject({ id: 'n2', title: 'Buy milk' });
  });

  it('encodes path args and omits unset optional args', async () => {
    const result = await cli('remove', '--id', 'a/b c');
    expect(result.status, result.stderr).toBe(0);
    expect(app.seen[0].rawPath).toMatch(/^\/api\/notes\/a%2Fb%20c$/);
    expect(app.seen[0].query).toEqual({});
    expect(JSON.parse(result.stdout)).toEqual({ deleted: 'a/b c' });
  });

  it('exits 1 with the app error message on an HTTP error', async () => {
    const plain = await cli('get', 'missing');
    expect(plain.status).toBe(1);
    expect(plain.stderr).toContain('notes: note not found (HTTP 404)');
    const json = await cli('get', 'missing', '--json');
    expect(json.status).toBe(1);
    expect(JSON.parse(json.stdout)).toEqual({ ok: false, status: 404, error: 'note not found' });
  });

  it('exits 2 on usage errors without calling the app', async () => {
    for (const args of [['add', 'x'], ['add', '--priority', '2'], ['add', 'x', '--priority', '7'], ['list', '--limit', 'abc'], ['list', '--weight', '1'], ['frobnicate'], []]) {
      const result = await cli(...args);
      expect(result.status, `${args.join(' ')}: ${result.stdout}${result.stderr}`).toBe(2);
    }
    expect(app.seen).toHaveLength(0);
  });

  it('exits 3 when the app is unreachable', async () => {
    const closed = await startApp();
    const port = closed.port;
    await new Promise((resolve) => closed.server.close(resolve));
    const result = await cli('list', '--base-url', `http://127.0.0.1:${port}/api`, '--json');
    expect(result.status).toBe(3);
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: false, status: null });
    expect(JSON.parse(result.stdout).error).toMatch(/cannot reach http:\/\/127\.0\.0\.1:\d+/);
  });

  it('prints help and exits 0', async () => {
    const top = await cli('--help');
    expect(top.status).toBe(0);
    expect(top.stdout).toMatch(/list/);
    expect(top.stdout).toMatch(/remove/);
    const sub = await cli('add', '--help');
    expect(sub.status).toBe(0);
    expect(sub.stdout).toMatch(/--priority/);
  });
});

describe('total-recall app cli', () => {
  let root;
  let plugin;
  let logSpy;
  let errSpy;
  let exitSpy;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-app-cli-cmd-'));
    plugin = path.join(root, 'notes');
    fs.mkdirSync(plugin);
    fs.writeFileSync(path.join(plugin, 'plugin.json'), JSON.stringify({ id: 'notes', name: 'Notes', version: '1.2.0', description: 'Notes capability', app_cli: SPEC }));
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => { throw new Error(`process.exit(${code})`); });
  });

  afterEach(() => {
    logSpy.mockRestore();
    errSpy.mockRestore();
    exitSpy.mockRestore();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('writes the generated file with mode 755 and refuses to overwrite without --force', async () => {
    const out = path.join(root, 'app', 'notes.py');
    await expect(runAppCli(['app', 'cli', plugin, '--adapter', 'flask', '--out', out, '--json'])).rejects.toThrow('process.exit(0)');
    const result = JSON.parse(logSpy.mock.calls[0][0]);
    const expected = generateAppCli(SPEC, { language: 'python', source: { id: 'notes', version: '1.2.0' } });
    expect(result).toEqual({ language: 'python', path: 'notes.py', sha256: expected.sha256, out });
    expect(fs.readFileSync(out, 'utf8')).toBe(expected.content);
    expect(fs.statSync(out).mode & 0o777).toBe(0o755);

    await expect(runAppCli(['app', 'cli', plugin, '--lang', 'node', '--out', out])).rejects.toThrow('process.exit(1)');
    expect(fs.readFileSync(out, 'utf8')).toBe(expected.content);
    await expect(runAppCli(['app', 'cli', plugin, '--lang', 'node', '--out', out, '--force'])).rejects.toThrow('process.exit(0)');
    expect(fs.readFileSync(out, 'utf8')).toContain('#!/usr/bin/env node');
  });

  it('exits 3 for an adapter without a CLI language and 1 for a plugin without app_cli', async () => {
    await expect(runAppCli(['app', 'cli', plugin, '--adapter', 'rails'])).rejects.toThrow('process.exit(3)');
    const bare = path.join(root, 'bare');
    fs.mkdirSync(bare);
    fs.writeFileSync(path.join(bare, 'plugin.json'), JSON.stringify({ id: 'bare', name: 'Bare', version: '1.0.0', description: 'No app CLI here' }));
    await expect(runAppCli(['app', 'cli', bare, '--lang', 'node'])).rejects.toThrow('process.exit(1)');
    expect(errSpy.mock.calls.flat().join('\n')).toMatch(/declares no app_cli/);
  });
});
