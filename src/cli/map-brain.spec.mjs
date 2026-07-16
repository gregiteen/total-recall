import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import map from './map.mjs';
import brain from './brain.mjs';

describe('total-recall map and brain CLI commands', () => {
  let tmpAgentDir;
  let origAgentDir;
  let origEnv;

  beforeEach(() => {
    tmpAgentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-map-brain-test-'));
    origAgentDir = process.env.AGENT_DIR;
    origEnv = { ...process.env };
    process.env.AGENT_DIR = tmpAgentDir;

    // Set up standard total-recall folders in the global brain
    const brainDir = path.join(tmpAgentDir, 'skills', 'total-recall');
    fs.mkdirSync(path.join(brainDir, 'memory-vault', 'facts'), { recursive: true });
    fs.mkdirSync(path.join(brainDir, 'memory-vault', 'invariants'), { recursive: true });
    fs.mkdirSync(path.join(brainDir, 'config'), { recursive: true });

    // Seed a couple of mock memory nodes with YAML frontmatter
    const factNodeContent = `---
type: memory
slug: mock-fact-1
category: facts
title: Mock Fact Node 1
importance: 4
modality: descriptive
related:
  - mock-invariant-1
---
Mock Fact Body Content`;

    const invariantNodeContent = `---
type: memory
slug: mock-invariant-1
category: invariants
title: Mock Invariant Node 1
importance: 5
modality: must
---
Mock Invariant Body Content`;

    fs.writeFileSync(path.join(brainDir, 'memory-vault', 'facts', 'mock-fact-1.md'), factNodeContent, 'utf8');
    fs.writeFileSync(path.join(brainDir, 'memory-vault', 'invariants', 'mock-invariant-1.md'), invariantNodeContent, 'utf8');
  });

  afterEach(() => {
    if (origAgentDir === undefined) delete process.env.AGENT_DIR;
    else process.env.AGENT_DIR = origAgentDir;
    process.env = origEnv;
    fs.rmSync(tmpAgentDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('map prints categories and nodes as a hierarchical tree', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await map([]);

    const loggedTexts = consoleSpy.mock.calls.map(call => call[0]).join('\n');
    expect(loggedTexts).toContain('Total Recall Knowledge Map');
    expect(loggedTexts).toContain('mock-fact-1');
    expect(loggedTexts).toContain('Mock Fact Node 1');
    expect(loggedTexts).toContain('mock-invariant-1');
    expect(loggedTexts).toContain('Mock Invariant Node 1');

    consoleSpy.mockRestore();
  });

  it('map --relations lists outbound node link mappings', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await map(['--relations']);

    const loggedTexts = consoleSpy.mock.calls.map(call => call[0]).join('\n');
    expect(loggedTexts).toContain('Semantic Node Relations Map');
    expect(loggedTexts).toContain('mock-fact-1');
    expect(loggedTexts).toContain('mock-invariant-1');

    consoleSpy.mockRestore();
  });

  it('brain subcommand lists active layers and nodes count', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await brain(['list']);

    const loggedTexts = consoleSpy.mock.calls.map(call => call[0]).join('\n');
    expect(loggedTexts).toContain('Active Total Recall Brain Registry');
    expect(loggedTexts).toContain('Global Brain');
    expect(loggedTexts).toContain('Path:');

    consoleSpy.mockRestore();
  });

  it('brain status outputs active context and layer resolution paths', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await brain(['status']);

    const loggedTexts = consoleSpy.mock.calls.map(call => call[0]).join('\n');
    expect(loggedTexts).toContain('Active Brain Context Status');
    expect(loggedTexts).toContain('Current Working Dir');
    expect(loggedTexts).toContain('Global Layer');

    consoleSpy.mockRestore();
  });

  it('brain register registers a project root directory', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // Create a mock project folder
    const mockProjRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-mock-proj-'));
    const brainDir = path.join(mockProjRoot, '.agent', 'skills', 'total-recall');
    fs.mkdirSync(path.join(brainDir, 'memory-vault'), { recursive: true });

    const registryFile = path.join(tmpAgentDir, 'skills', 'total-recall', 'config', 'project-registry.json');
    expect(fs.existsSync(registryFile)).toBe(false);

    await brain(['register', mockProjRoot]);

    expect(fs.existsSync(registryFile)).toBe(true);
    const registry = JSON.parse(fs.readFileSync(registryFile, 'utf8'));
    expect(registry.length).toBe(1);
    expect(registry[0].path).toBe(mockProjRoot);

    fs.rmSync(mockProjRoot, { recursive: true, force: true });
    consoleSpy.mockRestore();
  }, 15000);
});
