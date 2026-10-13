import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./logger.mjs', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { cleanAndParseJSON, loadRuntimeConfig, loadDynamicSecrets } from './runtime.mjs';
import fs from 'fs';
import os from 'os';
import path from 'path';

describe('cleanAndParseJSON', () => {
  it('parses standard clean JSON', () => {
    const input = '{"name": "John", "age": 30, "active": true}';
    expect(cleanAndParseJSON(input)).toEqual({
      name: 'John',
      age: 30,
      active: true
    });
  });

  it('extracts and parses JSON wrapped in markdown code blocks', () => {
    const inputWithJsonTag = '```json\n{"name": "John"}\n```';
    expect(cleanAndParseJSON(inputWithJsonTag)).toEqual({ name: 'John' });

    const inputWithoutJsonTag = '```\n{"name": "Doe"}\n```';
    expect(cleanAndParseJSON(inputWithoutJsonTag)).toEqual({ name: 'Doe' });
  });

  it('ignores conversational text prefixing the JSON payload', () => {
    const input = 'Here is the response you asked for:\n{"name": "John"}';
    expect(cleanAndParseJSON(input)).toEqual({ name: 'John' });
  });

  it('strips single-line and multi-line comments outside of strings', () => {
    const input = `
      // This is a comment
      {
        "name": "John", /* This is a multi-line
        comment */
        "age": 30 // another comment
      }
    `;
    expect(cleanAndParseJSON(input)).toEqual({
      name: 'John',
      age: 30
    });
  });

  it('strips single slash comment/bullet typos outside of strings', () => {
    const input = `
      {
        "name": "John",
        / "age": 30
      }
    `;
    expect(cleanAndParseJSON(input)).toEqual({
      name: 'John'
    });
  });

  it('does NOT strip comment-like patterns inside string literals', () => {
    const input = '{"url": "https://example.com/api", "text": "This is a // comment inside a string"}';
    expect(cleanAndParseJSON(input)).toEqual({
      url: 'https://example.com/api',
      text: 'This is a // comment inside a string'
    });
  });

  it('removes stray trailing commas in objects and arrays', () => {
    const input = '{"hobbies": ["coding", "reading",], "user": {"id": 1,},}';
    expect(cleanAndParseJSON(input)).toEqual({
      hobbies: ['coding', 'reading'],
      user: { id: 1 }
    });
  });

  it('filters out LLM placeholder lines outside actual string content', () => {
    const input = `
      {
        "name": "John",
        _
        ...
        "age": 30
      }
    `;
    expect(cleanAndParseJSON(input)).toEqual({
      name: 'John',
      age: 30
    });
  });

  it('quotes unquoted keys', () => {
    const input = '{name: "John", age: 30, user-id: "123"}';
    expect(cleanAndParseJSON(input)).toEqual({
      name: 'John',
      age: 30,
      'user-id': '123'
    });
  });

  it('normalizes single-quoted strings to double-quoted strings', () => {
    const input = "{'name': 'John', 'escape': 'don\\'t', 'nested': \"value\"}";
    expect(cleanAndParseJSON(input)).toEqual({
      name: 'John',
      escape: "don't",
      nested: 'value'
    });
  });

  it('quotes unquoted string values (excluding keywords and numbers)', () => {
    const input = '{status: pending, value: LK-99, active: true, score: 98.6}';
    expect(cleanAndParseJSON(input)).toEqual({
      status: 'pending',
      value: 'LK-99',
      active: true,
      score: 98.6
    });
  });

  it('auto-balances unclosed brackets and braces for truncated JSON payloads', () => {
    const truncatedObject = '{"name": "John", "hobbies": ["coding", "reading"';
    expect(cleanAndParseJSON(truncatedObject)).toEqual({
      name: 'John',
      hobbies: ['coding', 'reading']
    });

    const truncatedArray = '[{"name": "John"}, {"name": "Doe"';
    expect(cleanAndParseJSON(truncatedArray)).toEqual([
      { name: 'John' },
      { name: 'Doe' }
    ]);
  });
});

describe('loadRuntimeConfig', () => {
  const originalEnv = process.env;
  const originalArgv = process.argv;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.argv = [...originalArgv];
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
    process.argv = originalArgv;
  });

  it('prioritizes CLI argument --agent=name over everything', () => {
    process.argv = ['node', 'cli.js', '--agent=claude'];
    process.env.TR_CLI_AGENT = 'gemini';

    vi.spyOn(fs, 'existsSync').mockReturnValue(false);

    const config = loadRuntimeConfig();
    expect(config.agents[0].name).toBe('claude');
  });

  it('falls back to TR_CLI_AGENT environment variable when no CLI arg is specified', () => {
    process.argv = ['node', 'cli.js'];
    process.env.TR_CLI_AGENT = 'claude';

    vi.spyOn(fs, 'existsSync').mockReturnValue(false);

    const config = loadRuntimeConfig();
    expect(config.agents[0].name).toBe('claude');
  });

  it('falls back to brain.json preferred_agent when no CLI arg or Env var is specified', () => {
    process.argv = ['node', 'cli.js'];
    delete process.env.TR_CLI_AGENT;

    vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
      if (p.endsWith('brain.json')) return true;
      return false;
    });

    vi.spyOn(fs, 'readFileSync').mockImplementation((p) => {
      if (p.endsWith('brain.json')) {
        return JSON.stringify({ preferred_agent: 'codex' });
      }
      return '';
    });

    const config = loadRuntimeConfig();
    expect(config.agents[0].name).toBe('codex');
  });

  it('falls back to SSSS Compiled Memory Preference Surface (INSTRUCTIONS.md) when lower tiers are not present', () => {
    process.argv = ['node', 'cli.js'];
    delete process.env.TR_CLI_AGENT;

    vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
      if (p.endsWith('INSTRUCTIONS.md')) return true;
      return false;
    });

    vi.spyOn(fs, 'readFileSync').mockImplementation((p) => {
      if (p.endsWith('INSTRUCTIONS.md')) {
        return 'Some content\nMy preferred CLI agent is claude\nMore content';
      }
      return '';
    });

    const config = loadRuntimeConfig();
    expect(config.agents[0].name).toBe('claude');
  });
});


describe('selected auth credential projection', () => {
  let root, saved;
  let gateway;
  beforeEach(async () => {
    vi.restoreAllMocks();
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-runtime-auth-'));
    saved = process.env.TR_SECRETS_PASSWORD;
    process.env.TR_SECRETS_PASSWORD = 'fixture-runtime-master';
    const { loadPluginModule } = await import('./plugin-runtime.mjs');
    gateway = await loadPluginModule('auth', 'secrets-store');
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.TR_SECRETS_PASSWORD; else process.env.TR_SECRETS_PASSWORD = saved;
    fs.rmSync(root, { recursive: true, force: true });
  });
  it('projects only the explicitly selected encrypted store and excludes signing/password material', async () => {
    const selected = path.join(root, 'selected'), other = path.join(root, 'other');
    gateway.saveSecretsSync(selected, { GOOGLE_API_KEY: 'selected-fixture', SESSION_SECRET: 'private-fixture', dashboard_password_hash: 'private-fixture', __tr_secrets_meta: {} });
    gateway.saveSecretsSync(other, { GOOGLE_API_KEY: 'other-fixture' });
    expect(await loadDynamicSecrets({ brainDir: selected, home: other, cwd: other })).toEqual({ google_api_key: 'selected-fixture' });
  });
  it('propagates corrupt/plaintext store errors without alternate-store resolution', async () => {
    fs.mkdirSync(path.join(root, 'config'));
    fs.writeFileSync(path.join(root, 'config/secrets.enc'), JSON.stringify({ GOOGLE_API_KEY: 'legacy-fixture' }));
    await expect(loadDynamicSecrets({ brainDir: root })).rejects.toThrow();
  });
});
