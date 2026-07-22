import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./logger.mjs', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { startSourceWatcher } from './source-watcher.mjs';
import fs from 'node:fs';
import path from 'node:path';

describe('source-watcher', () => {
  const repoRoot = path.join(process.cwd(), '.test-repo-watch');
  const skillsDir = path.join(repoRoot, '.agent', 'skills');

  beforeEach(() => {
    fs.mkdirSync(skillsDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  });

  it('returns a stopper that does nothing if repo-expert is missing', () => {
    const watcher = startSourceWatcher(repoRoot, skillsDir);
    expect(watcher.stop).toBeDefined();
    expect(typeof watcher.stop).toBe('function');
    watcher.stop();
  });

  it('starts watching if repo-expert skill exists', () => {
    fs.mkdirSync(path.join(skillsDir, 'repo-expert'), { recursive: true });
    fs.mkdirSync(path.join(repoRoot, 'src'), { recursive: true });
    
    const watcher = startSourceWatcher(repoRoot, skillsDir);
    expect(watcher.stop).toBeDefined();
    watcher.stop();
  });
});
