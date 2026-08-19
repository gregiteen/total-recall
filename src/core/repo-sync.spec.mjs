import { describe, it, expect, vi, beforeEach } from 'vitest';
import { syncAllRepos, syncSingleRepo } from './repo-sync.mjs';
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
