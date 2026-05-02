/**
 * episodes.test.mjs — Tests for episode archive operations
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { archiveEpisode, listEpisodes, getEpisodeStats, findEpisodeByShortId } from '../core/episodes.mjs';

let tmpDir;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-episodes-test-'));
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('archiveEpisode', () => {
  it('creates episode with correct directory structure', () => {
    const result = archiveEpisode({
      episodesDir: tmpDir,
      sessionId: 'abc12345-6789-0123-4567-890123456789',
      content: '# Test Session\nDid some stuff.',
      date: '2026-05-01',
      metadata: {
        agent: 'antigravity',
        objective: 'Test things',
        filesModified: ['/path/to/file.ts'],
        decisions: ['Used option A'],
        userMood: 'positive',
      },
    });

    assert.ok(result.filePath.includes('2026/05/01'));
    assert.ok(result.filePath.includes('session-abc12345'));
    assert.ok(fs.existsSync(result.filePath));
    assert.equal(result.isNew, true);

    const content = fs.readFileSync(result.filePath, 'utf-8');
    assert.ok(content.includes('type: episode'));
    assert.ok(content.includes('session_id: "abc12345-6789-0123-4567-890123456789"'));
    assert.ok(content.includes('user_mood: positive'));
    assert.ok(content.includes('/path/to/file.ts'));
    assert.ok(content.includes('Used option A'));
  });

  it('detects existing episodes', () => {
    const r1 = archiveEpisode({
      episodesDir: tmpDir,
      sessionId: 'dup00000-1111-2222-3333-444444444444',
      content: 'First write.',
      date: '2026-05-01',
    });
    assert.equal(r1.isNew, true);

    const r2 = archiveEpisode({
      episodesDir: tmpDir,
      sessionId: 'dup00000-1111-2222-3333-444444444444',
      content: 'Overwrite.',
      date: '2026-05-01',
    });
    assert.equal(r2.isNew, false);
  });
});

describe('listEpisodes', () => {
  it('lists all episodes sorted', () => {
    const episodes = listEpisodes(tmpDir);
    assert.ok(episodes.length >= 2, `Expected >= 2, got ${episodes.length}`);
    // Verify sorted
    for (let i = 1; i < episodes.length; i++) {
      assert.ok(episodes[i] >= episodes[i - 1], 'Should be sorted');
    }
  });

  it('returns empty array for missing directory', () => {
    const result = listEpisodes('/nonexistent');
    assert.deepEqual(result, []);
  });
});

describe('findEpisodeByShortId', () => {
  it('finds episode by prefix', () => {
    const found = findEpisodeByShortId(tmpDir, 'abc12345');
    assert.ok(found, 'Should find the episode');
    assert.ok(found.includes('abc12345'));
  });

  it('returns null for unknown id', () => {
    const found = findEpisodeByShortId(tmpDir, 'zzzzzzz');
    assert.equal(found, null);
  });
});

describe('getEpisodeStats', () => {
  it('returns stats with monthly breakdown', () => {
    const stats = getEpisodeStats(tmpDir);
    assert.ok(stats.total >= 2);
    assert.equal(stats.oldestDate, '2026-05-01');
    assert.equal(stats.newestDate, '2026-05-01');
    assert.ok(stats.byMonth['2026-05'] >= 2);
  });
});
