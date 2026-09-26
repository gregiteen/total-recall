// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

vi.mock('./logger.mjs', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

let brain;
let gate;
let queue;

beforeEach(async () => {
  brain = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-gate-'));
  process.env._TR_TEST_AGENT_DIR = brain;
  vi.resetModules();
  gate = await import('./research-gate.mjs');
  queue = await import('./research-queue.mjs');
});

afterEach(() => {
  delete process.env._TR_TEST_AGENT_DIR;
  fs.rmSync(brain, { recursive: true, force: true });
});

const cfg = (over = {}) => ({ ...gate.AUTONOMOUS_DEFAULTS, ...over });
const notCovered = async () => 0;

describe('requestResearch (human asked)', () => {
  it('records origin user and where it came from', () => {
    const item = gate.requestResearch({ topic: '  Stripe webhooks  ', via: 'chat', notes: 'n' });
    expect(item).toMatchObject({ topic: 'Stripe webhooks', origin: 'user', requested_via: 'chat', priority: 'high' });
  });

  it('rejects a missing topic and an unknown via', () => {
    expect(() => gate.requestResearch({ topic: '', via: 'chat' })).toThrow(/topic/);
    expect(() => gate.requestResearch({ topic: 'x', via: 'telepathy' })).toThrow(/via/);
  });

  it('claims an autonomous item the user then asks for, so it runs first', async () => {
    await gate.proposeAutonomousResearch([{ topic: 'Next.js 16 caching' }], { project: 'site', config: cfg(), coverageCheck: notCovered, brainDir: brain });
    const item = gate.requestResearch({ topic: 'next.js 16 caching', via: 'extension', brainDir: brain });
    expect(item).toMatchObject({ origin: 'user', requested_via: 'extension' });
    expect(queue.loadQueue(brain)).toHaveLength(1);
  });
});

describe('proposeAutonomousResearch (AI noticed a gap while working)', () => {
  it('queues gaps with provenance', async () => {
    const { queued, skipped } = await gate.proposeAutonomousResearch(
      [{ topic: 'Telnyx Call Control v2', rationale: 'agent guessed the command name', priority: 80 }],
      { project: 'ultrachat', sessionId: 's1', config: cfg(), coverageCheck: notCovered, brainDir: brain },
    );
    expect(skipped).toEqual([]);
    expect(queued[0]).toMatchObject({
      origin: 'autonomous', requested_via: 'session', project: 'ultrachat',
      session_id: 's1', rationale: 'agent guessed the command name', priority: 'high',
    });
  });

  it('skips gaps existing research already covers', async () => {
    const { queued, skipped } = await gate.proposeAutonomousResearch(
      [{ topic: 'covered' }, { topic: 'new' }],
      { project: 'p', config: cfg(), coverageCheck: async (t) => (t === 'covered' ? 0.9 : 0.2), brainDir: brain },
    );
    expect(queued.map((i) => i.topic)).toEqual(['new']);
    expect(skipped).toEqual([{ topic: 'covered', reason: 'covered' }]);
  });

  it('enforces the per-session, per-project and per-day budgets', async () => {
    const opts = { config: cfg({ maxPerSession: 2, maxPendingPerProject: 3, maxPerDay: 4 }), coverageCheck: notCovered, brainDir: brain };

    const s = await gate.proposeAutonomousResearch(['a', 'b', 'c'].map((topic) => ({ topic })), { ...opts, project: 'p1', sessionId: 's1' });
    expect(s.queued).toHaveLength(2);
    expect(s.skipped).toEqual([{ topic: 'c', reason: 'budget-session' }]);

    const p = await gate.proposeAutonomousResearch(['d', 'e'].map((topic) => ({ topic })), { ...opts, project: 'p1', sessionId: 's2' });
    expect(p.queued.map((i) => i.topic)).toEqual(['d']);
    expect(p.skipped).toEqual([{ topic: 'e', reason: 'budget-project' }]);

    const d = await gate.proposeAutonomousResearch(['f', 'g'].map((topic) => ({ topic })), { ...opts, project: 'p2', sessionId: 's3' });
    expect(d.queued.map((i) => i.topic)).toEqual(['f']);
    expect(d.skipped).toEqual([{ topic: 'g', reason: 'budget-day' }]);
  });

  it('does not count user requests against the autonomous budget', async () => {
    for (const t of ['u1', 'u2', 'u3', 'u4']) gate.requestResearch({ topic: t, via: 'cli', project: 'p', brainDir: brain });
    const { queued } = await gate.proposeAutonomousResearch([{ topic: 'gap' }], { project: 'p', config: cfg(), coverageCheck: notCovered, brainDir: brain });
    expect(queued).toHaveLength(1);
  });

  it('queues nothing when autonomous research is disabled', async () => {
    const { queued, skipped } = await gate.proposeAutonomousResearch([{ topic: 'x' }], { project: 'p', config: cfg({ enabled: false }), coverageCheck: notCovered, brainDir: brain });
    expect(queued).toEqual([]);
    expect(skipped).toEqual([{ topic: 'x', reason: 'disabled' }]);
  });

  it('skips duplicates of anything already in the queue', async () => {
    gate.requestResearch({ topic: 'Same Topic', via: 'dashboard', brainDir: brain });
    const { skipped } = await gate.proposeAutonomousResearch([{ topic: 'same   topic' }], { project: 'p', config: cfg(), coverageCheck: notCovered, brainDir: brain });
    expect(skipped).toEqual([{ topic: 'same   topic', reason: 'duplicate' }]);
  });
});

describe('resolveAutonomousConfig', () => {
  it('reads snake_case overrides from research.yml and keeps defaults otherwise', () => {
    expect(gate.resolveAutonomousConfig({ autonomous: { enabled: false, max_per_day: 1 } }))
      .toEqual({ ...gate.AUTONOMOUS_DEFAULTS, enabled: false, maxPerDay: 1 });
    expect(gate.resolveAutonomousConfig({ autonomous: { max_per_day: -3 } }).maxPerDay).toBe(gate.AUTONOMOUS_DEFAULTS.maxPerDay);
    expect(gate.resolveAutonomousConfig(undefined)).toEqual({ ...gate.AUTONOMOUS_DEFAULTS });
  });
});
