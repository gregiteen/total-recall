import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import matter from 'gray-matter';
import {
  loadCandidatesFromInbox,
  loadCandidatesFromSessions,
  collectRemCandidates,
  evaluateCandidates,
} from './dream.mjs';

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tr-dream-'));
}

describe('dream REM candidates', () => {
  let brain;
  beforeEach(() => {
    brain = tmpDir();
  });
  afterEach(() => {
    fs.rmSync(brain, { recursive: true, force: true });
  });

  it('loads draft nodes from memory-inbox/pending', () => {
    const pending = path.join(brain, 'memory-inbox', 'pending');
    fs.mkdirSync(pending, { recursive: true });
    const node = {
      type: 'memory',
      slug: 'draft-pref-1',
      category: 'preferences',
      title: 'Always use single quotes',
      status: 'draft',
      confidence: 0.6,
      importance: 3,
      evidence_count: 2,
    };
    fs.writeFileSync(
      path.join(pending, 'draft-pref-1.md'),
      matter.stringify('Always use single quotes in JS.', node),
    );

    const c = loadCandidatesFromInbox(brain);
    expect(c).toHaveLength(1);
    expect(c[0].slug).toBe('draft-pref-1');
    expect(c[0]._inbox_path).toContain('pending');
  });

  it('extracts preference-like lines from sessions', () => {
    const sessions = path.join(brain, 'sessions');
    fs.mkdirSync(sessions, { recursive: true });
    const line = JSON.stringify({
      role: 'user',
      content: 'Always remember to run tests before pushing code to production.',
      type: 'observation',
    });
    fs.writeFileSync(path.join(sessions, 's1.jsonl'), line + '\n');

    const c = loadCandidatesFromSessions(sessions);
    expect(c.length).toBeGreaterThanOrEqual(1);
    expect(c[0].slug).toMatch(/^session-extract-/);
    expect(c[0].tags).toContain('dream-rem');
  });

  it('collectRemCandidates merges inbox + sessions', () => {
    const pending = path.join(brain, 'memory-inbox', 'pending');
    fs.mkdirSync(pending, { recursive: true });
    fs.writeFileSync(
      path.join(pending, 'a.md'),
      matter.stringify('body', {
        slug: 'inbox-a',
        status: 'draft',
        category: 'facts',
        title: 'A',
        confidence: 0.9,
        importance: 4,
        evidence_count: 5,
      }),
    );
    const sessions = path.join(brain, 'sessions');
    fs.mkdirSync(sessions, { recursive: true });
    fs.writeFileSync(
      path.join(sessions, 's.jsonl'),
      JSON.stringify({
        role: 'user',
        content: 'Never run tsc directly; use the code-quality skill scripts instead.',
      }) + '\n',
    );

    const all = collectRemCandidates({ brainDirPath: brain, sessionsDir: sessions });
    expect(all.some((c) => c.slug === 'inbox-a')).toBe(true);
    expect(all.some((c) => String(c.slug).startsWith('session-extract-'))).toBe(true);
  });

  it('evaluateCandidates still promotes high-confidence inbox drafts', () => {
    const conflicts = path.join(brain, 'conflicts');
    fs.mkdirSync(conflicts, { recursive: true });
    const candidates = [
      {
        slug: 'hi-conf',
        evidence_count: 5,
        importance: 3,
        confidence: 0.9,
      },
    ];
    const result = evaluateCandidates(candidates, [], conflicts);
    expect(result.promoted.length).toBe(1);
    expect(result.promoted[0].status).toBe('active');
  });
});
