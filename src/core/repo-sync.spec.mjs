import { describe, it, expect, vi, beforeEach } from 'vitest';
import { syncAllRepos, syncSingleRepo, isGeneratedSurface } from './repo-sync.mjs';
import fs from 'node:fs';

vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    readdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  },
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

vi.mock('./validated-write.mjs', () => ({ writeNodeValidatedAsync: vi.fn() }));

vi.mock('./logger.mjs', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }
}));

describe('repo-sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // syncSingleRepo/syncAllRepos became async when node writes moved onto the
  // SSSS Core Contract (writeNodeValidatedAsync). Without the await these
  // assertions ran against a Promise and passed for the wrong reason.
  it('syncSingleRepo returns an object', async () => {
    fs.existsSync.mockReturnValue(false);
    const result = await syncSingleRepo('/some/path', '/brain/dir');
    expect(result).toHaveProperty('repo');
    expect(result).toHaveProperty('ingested');
  });

  it('syncAllRepos returns repos array', async () => {
    fs.existsSync.mockReturnValue(false);
    fs.readFileSync.mockImplementation((path) => {
      if (path && path.toString().includes('project-registry.json')) {
        return '[]';
      }
      return '';
    });
    const result = await syncAllRepos();
    expect(result).toHaveProperty('repos');
    expect(result).toHaveProperty('totalIngested');
  });
});

describe('repo-sync never ingests generated instruction surfaces', () => {
  // Regression: repo-sync ingests every .md file in a registered repo. The
  // compiled surfaces are Total Recall's OWN output and carry no SSSS
  // frontmatter, so each sync logged
  // "Rejected by SSSS contract: created: Invalid ISO datetime" and, before the
  // contract check, minted brain facts that were copies of the surface itself
  // (4 such nodes were found in the global vault and removed).
  it('rejects compiled surfaces at the repo root', () => {
    for (const name of ['INSTRUCTIONS.md', 'AGENTS.md', 'CLAUDE.md', 'GEMINI.md', 'COPILOT_INSTRUCTIONS.md']) {
      expect(isGeneratedSurface(name), `${name} must not be ingested`).toBe(true);
    }
  });

  it('rejects compiled surfaces nested in per-IDE directories', () => {
    expect(isGeneratedSurface('some/deep/AGENTS.md')).toBe(true);
    expect(isGeneratedSurface('nested/CLAUDE.md')).toBe(true);
  });

  it('still accepts ordinary repo documentation', () => {
    for (const name of ['README.md', 'docs/ARCHITECTURE.md', 'docs/guides/gemini.md', 'CHANGELOG.md']) {
      expect(isGeneratedSurface(name), `${name} should still be ingested`).toBe(false);
    }
  });
});
