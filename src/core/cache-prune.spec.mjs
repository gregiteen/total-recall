import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { pruneCaches, maybePruneCaches, sessionIngestedGuard, isProtected, PROTECTED, DEFAULT_POLICIES, formatBytes } from './cache-prune.mjs';

const DAY = 24 * 60 * 60 * 1000;
let brain;

const write = (rel, content, ageDays = 0) => {
  const abs = path.join(brain, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
  if (ageDays) {
    const t = new Date(Date.now() - ageDays * DAY);
    fs.utimesSync(abs, t, t);
  }
  return abs;
};

beforeEach(() => { brain = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-prune-')); });
afterEach(() => fs.rmSync(brain, { recursive: true, force: true }));

describe('isProtected', () => {
  it('refuses every protected directory', () => {
    for (const p of PROTECTED) {
      expect(isProtected(brain, path.join(brain, p))).toBe(true);
    }
  });

  it('protects the embeddings index — rebuildable is not the same as unused', () => {
    // Deleting it is legal and ruinous: re-embedding the vault is expensive and
    // the index is in constant use.
    expect(isProtected(brain, path.join(brain, 'memory-derived'))).toBe(true);
  });

  it('refuses anything outside the brain rather than guessing', () => {
    expect(isProtected(brain, '/etc')).toBe(true);
    expect(isProtected(brain, path.join(brain, '..', 'elsewhere'))).toBe(true);
  });

  it('allows genuine cache directories', () => {
    expect(isProtected(brain, path.join(brain, 'logs'))).toBe(false);
    expect(isProtected(brain, path.join(brain, 'sessions'))).toBe(false);
  });

  it('does not confuse a prefix with a directory', () => {
    expect(isProtected(brain, path.join(brain, 'memory-vault-backup-old'))).toBe(false);
  });
});

describe('age policy', () => {
  it('deletes files past the cutoff and keeps the rest', () => {
    write('logs/system-2026-01-01.jsonl', 'old', 40);
    write('logs/system-2026-08-20.jsonl', 'new', 0);
    const r = pruneCaches({ brainDir: brain });
    expect(fs.existsSync(path.join(brain, 'logs/system-2026-01-01.jsonl'))).toBe(false);
    expect(fs.existsSync(path.join(brain, 'logs/system-2026-08-20.jsonl'))).toBe(true);
    expect(r.removed).toBe(1);
  });

  it('ignores files the policy does not match', () => {
    // An unrelated old file in logs/ is not this policy's business.
    write('logs/secrets-audit.jsonl', 'audit', 400);
    pruneCaches({ brainDir: brain });
    expect(fs.existsSync(path.join(brain, 'logs/secrets-audit.jsonl'))).toBe(true);
  });
});

describe('size policy (daemon.log)', () => {
  it('truncates rather than unlinking, because the daemon holds it open', () => {
    // Unlinking orphans the appender's descriptor and logging stops silently
    // until restart -- a worse failure than the disk usage.
    const big = path.join(brain, 'logs/daemon.log');
    write('logs/daemon.log', Array.from({ length: 60_000 }, (_, i) => `line ${i}`).join('\n'));
    const before = fs.statSync(big).size;

    const r = pruneCaches({
      brainDir: brain,
      policies: [{ id: 'daemon-log', dir: 'logs', match: /^daemon\.log$/, mode: 'size', limit: 100_000, keepBytes: 20_000 }],
    });

    expect(fs.existsSync(big)).toBe(true);          // still there
    const after = fs.statSync(big).size;
    expect(after).toBeLessThan(before);
    expect(after).toBeLessThanOrEqual(20_000);
    expect(r.freed_bytes).toBeGreaterThan(0);
  });

  it('keeps the newest lines, and leaves no partial first line', () => {
    const lines = Array.from({ length: 60_000 }, (_, i) => `line ${i}`);
    write('logs/daemon.log', lines.join('\n'));
    pruneCaches({
      brainDir: brain,
      policies: [{ id: 'd', dir: 'logs', match: /^daemon\.log$/, mode: 'size', limit: 100_000, keepBytes: 20_000 }],
    });
    const kept = fs.readFileSync(path.join(brain, 'logs/daemon.log'), 'utf8');
    expect(kept).toContain('line 59999');            // newest survived
    expect(kept.split('\n')[0]).toMatch(/^line \d+$/); // no truncated fragment
  });

  it('leaves a file that is under the cap completely alone', () => {
    write('logs/daemon.log', 'small');
    pruneCaches({ brainDir: brain });
    expect(fs.readFileSync(path.join(brain, 'logs/daemon.log'), 'utf8')).toBe('small');
  });
});

describe('count policy (snapshots)', () => {
  it('keeps whole snapshots, never half of one', () => {
    // Each snapshot is a .tar.gz plus a .json sidecar. Counting files instead
    // of snapshots orphans a sidecar whose archive was deleted.
    for (let i = 0; i < 14; i++) {
      write(`.snapshots/vault-${i}.tar.gz`, `archive${i}`, 14 - i);
      write(`.snapshots/vault-${i}.json`, `meta${i}`, 14 - i);
    }
    pruneCaches({ brainDir: brain });
    const left = fs.readdirSync(path.join(brain, '.snapshots'));
    expect(left.length).toBe(20); // 10 snapshots x 2 files
    const stems = new Set(left.map((f) => f.replace(/\.tar\.gz$/, '').replace(/\.[^.]+$/, '')));
    expect(stems.size).toBe(10);
    for (const s of stems) {
      expect(left).toContain(`${s}.tar.gz`);
      expect(left).toContain(`${s}.json`);
    }
  });
});

describe('safety', () => {
  it('never touches the vault, even if a policy points straight at it', () => {
    write('memory-vault/facts/important.md', 'irreplaceable', 400);
    const r = pruneCaches({
      brainDir: brain,
      policies: [{ id: 'bad', dir: 'memory-vault', mode: 'age', limit: 1 }],
    });
    expect(fs.existsSync(path.join(brain, 'memory-vault/facts/important.md'))).toBe(true);
    expect(r.results[0].skipped).toMatch(/protected/);
  });

  it('reports a refusal instead of silently doing nothing', () => {
    const r = pruneCaches({
      brainDir: brain,
      policies: [{ id: 'bad', dir: 'config', mode: 'age', limit: 1 }],
    });
    expect(r.results[0].skipped).toBeTruthy();
  });

  it('dry run reports without deleting', () => {
    // Ingested, so it is a genuine deletion candidate -- otherwise the guard
    // would retain it and this would prove nothing about dry-run.
    const h = crypto.createHash('sha256').update('done').digest('hex');
    write('memory-derived/content-hashes.jsonl', JSON.stringify({ sha256: h }));
    write('sessions/old.jsonl', JSON.stringify({ content: 'done' }), 90);
    const r = pruneCaches({ brainDir: brain, dryRun: true });
    expect(r.dry_run).toBe(true);
    expect(r.removed).toBe(1);
    expect(fs.existsSync(path.join(brain, 'sessions/old.jsonl'))).toBe(true);
  });

  it('survives directories that do not exist', () => {
    expect(() => pruneCaches({ brainDir: brain })).not.toThrow();
  });
});

describe('default policies', () => {
  it('cover every cache that actually grew, and nothing else', () => {
    expect(DEFAULT_POLICIES.map((p) => p.id).sort()).toEqual(
      ['daemon-log', 'sessions', 'snapshots', 'system-logs'],
    );
    for (const p of DEFAULT_POLICIES) {
      expect(PROTECTED).not.toContain(p.dir);
    }
  });
});

describe('formatBytes', () => {
  it('renders sizes a human can read', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(1.5 * 1024 ** 3)).toBe('1.5 GB');
  });
});

describe('maybePruneCaches throttle', () => {
  it('runs the first time, then not again until the interval elapses', () => {
    write('sessions/old.jsonl', JSON.stringify({ content: 'x' }), 90);
    const t0 = Date.now();
    expect(maybePruneCaches({ brainDir: brain, now: t0 })).not.toBeNull();
    write('sessions/old2.jsonl', 'x'.repeat(100), 90);
    expect(maybePruneCaches({ brainDir: brain, now: t0 + 1000 })).toBeNull();
    expect(fs.existsSync(path.join(brain, 'sessions/old2.jsonl'))).toBe(true);
  });

  it('runs again once enough time has passed', () => {
    const t0 = Date.now();
    maybePruneCaches({ brainDir: brain, now: t0 });
    const h = crypto.createHash('sha256').update('done').digest('hex');
    write('memory-derived/content-hashes.jsonl', JSON.stringify({ sha256: h }));
    write('sessions/old.jsonl', JSON.stringify({ content: 'done' }), 90);
    const r = maybePruneCaches({ brainDir: brain, now: t0 + 7 * 60 * 60 * 1000 });
    expect(r).not.toBeNull();
    expect(fs.existsSync(path.join(brain, 'sessions/old.jsonl'))).toBe(false);
  });

  it('survives an unreadable marker rather than throwing', () => {
    fs.mkdirSync(path.join(brain, 'scheduler'), { recursive: true });
    fs.writeFileSync(path.join(brain, 'scheduler/last-cache-prune.json'), 'not json');
    expect(() => maybePruneCaches({ brainDir: brain })).not.toThrow();
  });
});

describe('session ingestion guard', () => {
  const hash = (c) => crypto.createHash('sha256').update(String(c)).digest('hex');
  const index = (...contents) =>
    write('memory-derived/content-hashes.jsonl',
      contents.map((c) => JSON.stringify({ sha256: hash(c) })).join('\n'));

  it('deletes a stale session whose entries are all in the vault', () => {
    index('alpha', 'beta');
    write('sessions/done.jsonl',
      [JSON.stringify({ content: 'alpha' }), JSON.stringify({ content: 'beta' })].join('\n'), 90);
    pruneCaches({ brainDir: brain });
    expect(fs.existsSync(path.join(brain, 'sessions/done.jsonl'))).toBe(false);
  });

  it('KEEPS a stale session that was never ingested', () => {
    // Age is not proof of ingestion: a session written while the daemon was
    // stopped can be arbitrarily old and never have been read. Deleting it
    // would destroy memory that never reached the vault.
    index('alpha');
    write('sessions/pending.jsonl', JSON.stringify({ content: 'never-ingested' }), 90);
    const r = pruneCaches({ brainDir: brain });
    expect(fs.existsSync(path.join(brain, 'sessions/pending.jsonl'))).toBe(true);
    expect(r.results.find((x) => x.id === 'sessions').retained).toBe(1);
  });

  it('keeps a session where only SOME entries were ingested', () => {
    index('alpha');
    write('sessions/partial.jsonl',
      [JSON.stringify({ content: 'alpha' }), JSON.stringify({ content: 'not-yet' })].join('\n'), 90);
    pruneCaches({ brainDir: brain });
    expect(fs.existsSync(path.join(brain, 'sessions/partial.jsonl'))).toBe(true);
  });

  it('keeps everything when the index is missing — nothing has been ingested', () => {
    write('sessions/old.jsonl', JSON.stringify({ content: 'x' }), 90);
    pruneCaches({ brainDir: brain });
    expect(fs.existsSync(path.join(brain, 'sessions/old.jsonl'))).toBe(true);
  });

  it('treats corrupt lines as not ingested, so corruption costs disk not memory', () => {
    index('alpha');
    write('sessions/corrupt.jsonl', 'not json at all', 90);
    expect(sessionIngestedGuard(brain)({ abs: path.join(brain, 'sessions/corrupt.jsonl') })).toBe(false);
  });

  it('an empty session file carries nothing and may go', () => {
    index('alpha');
    write('sessions/empty.jsonl', '', 90);
    expect(sessionIngestedGuard(brain)({ abs: path.join(brain, 'sessions/empty.jsonl') })).toBe(true);
  });
});
