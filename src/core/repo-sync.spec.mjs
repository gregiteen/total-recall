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

  it('syncSingleRepo returns an object', () => {
    fs.existsSync.mockReturnValue(false);
    const result = syncSingleRepo('/some/path', '/brain/dir');
    expect(result).toHaveProperty('repo');
    expect(result).toHaveProperty('ingested');
  });

  it('syncAllRepos returns repos array', () => {
    fs.existsSync.mockReturnValue(false);
    fs.readFileSync.mockImplementation((path) => {
      if (path && path.toString().includes('project-registry.json')) {
        return '[]';
      }
      return '';
    });
    const result = syncAllRepos();
    expect(result).toHaveProperty('repos');
    expect(result).toHaveProperty('totalIngested');
  });
});
