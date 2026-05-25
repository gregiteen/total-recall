process.env.GOOGLE_API_KEY = 'mock-google-key';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import remember from './remember.mjs';
import recall from './recall.mjs';

describe('remember and recall CLI commands', () => {
  let tmpAgentDir;
  let origAgentDir;
  let origEnv;

  beforeEach(() => {
    tmpAgentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-remember-test-'));
    origAgentDir = process.env.AGENT_DIR;
    origEnv = { ...process.env };
    process.env.AGENT_DIR = tmpAgentDir;

    // Create the active meta-skill rule structure
    const rulesDir = path.join(tmpAgentDir, 'skills', 'total-recall', 'rules');
    fs.mkdirSync(rulesDir, { recursive: true });

    fs.writeFileSync(path.join(rulesDir, 'invariants.md'), '# Invariant Rules\n\n- Existing invariant rule\n', 'utf8');
    fs.writeFileSync(path.join(rulesDir, 'preferences.md'), '# User Preferences\n\n- Existing preference rule\n', 'utf8');
    fs.writeFileSync(path.join(rulesDir, 'corrections.md'), '# Corrections\n\n- Existing correction rule\n', 'utf8');
  });

  afterEach(() => {
    if (origAgentDir === undefined) delete process.env.AGENT_DIR;
    else process.env.AGENT_DIR = origAgentDir;
    process.env = origEnv;
    fs.rmSync(tmpAgentDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('correctly appends rules to invariant.md and runs compilation', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // Mock fetch for semantic embeddings build
    const origFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ embedding: { values: [0.1, 0.2, 0.3] } })
    });

    await remember(['invariant', 'Never run tsc directly.']);

    const rulePath = path.join(tmpAgentDir, 'skills', 'total-recall', 'rules', 'invariants.md');
    const content = fs.readFileSync(rulePath, 'utf8');
    expect(content).toContain('- Existing invariant rule');
    expect(content).toContain('- Never run tsc directly.');

    global.fetch = origFetch;
    consoleSpy.mockRestore();
  });

  it('correctly appends rules to preference.md', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const origFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ embedding: { values: [0.1, 0.2, 0.3] } })
    });

    await remember(['preference', 'Always use double quotes.']);

    const rulePath = path.join(tmpAgentDir, 'skills', 'total-recall', 'rules', 'preferences.md');
    const content = fs.readFileSync(rulePath, 'utf8');
    expect(content).toContain('- Existing preference rule');
    expect(content).toContain('- Always use double quotes.');

    global.fetch = origFetch;
    consoleSpy.mockRestore();
  });

  it('correctly scaffolds fact nodes', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const origFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ embedding: { values: [0.1, 0.2, 0.3] } })
    });

    await remember(['fact', 'The project server runs on port 3000.']);

    const factsDir = path.join(tmpAgentDir, 'memory-vault', 'facts');
    const files = fs.readdirSync(factsDir);
    expect(files.length).toBe(1);

    const nodePath = path.join(factsDir, files[0]);
    const content = fs.readFileSync(nodePath, 'utf8');
    expect(content).toContain('category: facts');
    expect(content).toContain('The project server runs on port 3000.');

    global.fetch = origFetch;
    consoleSpy.mockRestore();
  });

  it('performs semantic recall searches', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // Create a mock embedding index
    const derivedDir = path.join(tmpAgentDir, 'memory-derived');
    fs.mkdirSync(derivedDir, { recursive: true });
    fs.writeFileSync(
      path.join(derivedDir, 'embeddings.json'),
      JSON.stringify({
        'invariant-rules': {
          embedding: [1, 0, 0],
          model: 'text-embedding-004',
          generated_at: new Date().toISOString()
        }
      }),
      'utf8'
    );

    // Populate mock vault node
    const vaultDir = path.join(tmpAgentDir, 'memory-vault');
    const invariantsDir = path.join(vaultDir, 'invariants');
    fs.mkdirSync(invariantsDir, { recursive: true });
    fs.writeFileSync(
      path.join(invariantsDir, 'invariant-rules.md'),
      `---
type: memory
slug: invariant-rules
category: invariants
title: Invariant Rules
---
Core Invariants`
    );

    // Mock fetch for the recall query embedding
    const origFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ embedding: { values: [1, 0, 0] } })
    });

    await recall(['tsc', '--top-k', '1']);

    const outputs = consoleSpy.mock.calls.flat().join('\n');
    expect(outputs).toContain('Vault Match');
    expect(outputs).toContain('Invariant Rules');

    global.fetch = origFetch;
    consoleSpy.mockRestore();
  });
});
