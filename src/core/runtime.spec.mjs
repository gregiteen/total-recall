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


describe('loadDynamicSecrets layering', () => {
  let root;
  let home;
  let agentRoot;
  let cwd;

  // The global layer always lives under <home>/.agent.
  const globalBrainStore = () =>
    path.join(home, '.agent', 'skills', 'total-recall', 'config', 'secrets.enc');
  const writeStore = (file, obj) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    // Plain JSON is a supported store format (loadSecretsSync falls back to it),
    // which keeps these tests independent of the encryption password.
    fs.writeFileSync(file, JSON.stringify(obj));
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-runtime-'));
    home = path.join(root, 'home');
    agentRoot = path.join(root, 'agent');
    cwd = path.join(root, 'proj');
    fs.mkdirSync(cwd, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('lets the canonical brain store win over a legacy flat store', async () => {
    writeStore(globalBrainStore(), { google_api_key: 'WORKING_BRAIN_KEY' });
    writeStore(path.join(cwd, '.agent', 'secrets.enc'), { google_api_key: 'DEAD_LEGACY_KEY' });

    const secrets = await loadDynamicSecrets({ cwd, agentRoot, home });
    expect(secrets.google_api_key).toBe('WORKING_BRAIN_KEY');
  });

  it('never lets a legacy flat store mask the project brain', async () => {
    writeStore(path.join(agentRoot, 'skills', 'total-recall', 'config', 'secrets.enc'), {
      google_api_key: 'PROJECT_KEY',
    });
    writeStore(path.join(agentRoot, 'secrets.enc'), { google_api_key: 'DEAD_LEGACY_KEY' });
    writeStore(path.join(cwd, '.agent', 'secrets.enc'), { google_api_key: 'ALSO_DEAD' });

    const secrets = await loadDynamicSecrets({ cwd, agentRoot, home });
    expect(secrets.google_api_key).toBe('PROJECT_KEY');
  });

  it('still surfaces keys that exist only in a legacy store', async () => {
    writeStore(globalBrainStore(), { google_api_key: 'WORKING_BRAIN_KEY' });
    writeStore(path.join(cwd, '.agent', 'secrets.enc'), { HEADSCALE_PREAUTH_KEY: 'LEGACY_ONLY' });

    const secrets = await loadDynamicSecrets({ cwd, agentRoot, home });
    expect(secrets.google_api_key).toBe('WORKING_BRAIN_KEY');
    expect(secrets.HEADSCALE_PREAUTH_KEY).toBe('LEGACY_ONLY');
  });

  it('lets the project brain override the global brain', async () => {
    writeStore(globalBrainStore(), { K: 'GLOBAL' });
    writeStore(path.join(agentRoot, 'skills', 'total-recall', 'config', 'secrets.enc'), { K: 'PROJECT' });

    const secrets = await loadDynamicSecrets({ cwd, agentRoot, home });
    expect(secrets.K).toBe('PROJECT');
  });

  it('never exposes the internal metadata key', async () => {
    writeStore(globalBrainStore(), { A: 'value', __tr_secrets_meta: { version: 2 } });

    const secrets = await loadDynamicSecrets({ cwd, agentRoot, home });
    expect(secrets.A).toBe('value');
    expect(secrets.__tr_secrets_meta).toBeUndefined();
  });

  it('returns an empty object when no layer exists', async () => {
    const secrets = await loadDynamicSecrets({ cwd, agentRoot, home });
    expect(secrets).toEqual({});
  });
});
