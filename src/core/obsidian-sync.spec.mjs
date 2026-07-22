import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import { addTask } from './task-envelope.mjs';
import { syncObsidianToVault, watchObsidianDirectory } from './obsidian-sync.mjs';

vi.mock('node:fs', () => {
  return {
    default: {
      readFileSync: vi.fn(),
      writeFileSync: vi.fn(),
      existsSync: vi.fn(),
      mkdirSync: vi.fn(),
      statSync: vi.fn(),
      watch: vi.fn()
    }
  };
});

// task-envelope.mjs (and vault.mjs beneath it) import the bare 'fs' specifier,
// not 'node:fs' — the mock above never reaches persistEnvelope's real disk
// write. Mock the module directly so conflict-path tests can't leak real
// files into the repo (see github-sync.spec.mjs for the same pattern).
vi.mock('./task-envelope.mjs', () => ({
  addTask: vi.fn(),
  resolveQueueDir: vi.fn((brainDir) => `${brainDir}/scheduler/queue`),
}));

// logger.mjs also uses the bare 'fs' specifier and resolves the real global
// brainDir at import time — unmocked, it appends real lines to the user's
// actual ~/.agent/skills/total-recall/logs/ during every test run.
vi.mock('./logger.mjs', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

describe('obsidian-sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exports syncObsidianToVault', () => {
    expect(syncObsidianToVault).toBeDefined();
  });

  it('exports watchObsidianDirectory', () => {
    expect(watchObsidianDirectory).toBeDefined();
  });

  it('translates frontmatter aliases to alternative_titles', () => {
    fs.existsSync.mockReturnValue(false);
    fs.readFileSync.mockReturnValue('---\naliases: ["alt title"]\ncssclasses: ["cool"]\n---\nbody');
    
    syncObsidianToVault('obsidian/test.md', 'vault/test.md', 'brain');
    
    expect(fs.writeFileSync).toHaveBeenCalledWith('vault/test.md', expect.stringContaining('alternative_titles:\n  - alt title'), 'utf8');
    expect(fs.writeFileSync).toHaveBeenCalledWith('vault/test.md', expect.stringContaining('tags:\n  - cool'), 'utf8');
  });

  it('surfaces conflict when vault file is newer', () => {
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue('---\ntitle: "obsidian"\n---\nbody');
    fs.statSync.mockImplementation((path) => {
      if (path === 'vault/test.md') return { mtimeMs: 2000 };
      if (path === 'obsidian/test.md') return { mtimeMs: 1000 };
    });
    
    syncObsidianToVault('obsidian/test.md', 'vault/test.md', 'brain');

    // Should skip writing due to conflict
    expect(fs.writeFileSync).not.toHaveBeenCalledWith('vault/test.md', expect.anything(), expect.anything());
    // Should surface the conflict as a queued task instead
    expect(addTask).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'system', origin: { agent: 'obsidian-sync' } }),
      'brain/scheduler/queue',
    );
  });
});
