import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
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
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });
});
