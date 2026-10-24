import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import contextStats from './context-stats.mjs';

describe('context-stats', () => {
  let home;
  let prevAgentDir;
  let logs;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-stats-'));
    prevAgentDir = process.env._TR_TEST_AGENT_DIR;
    process.env._TR_TEST_AGENT_DIR = home;
    const brain = path.join(home, 'skills', 'total-recall');
    fs.mkdirSync(path.join(brain, 'memory-vault'), { recursive: true });
    fs.mkdirSync(path.join(brain, 'memory-derived'), { recursive: true });
    logs = [];
    vi.spyOn(console, 'log').mockImplementation((...a) => { logs.push(a.join(' ')); });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (prevAgentDir === undefined) delete process.env._TR_TEST_AGENT_DIR;
    else process.env._TR_TEST_AGENT_DIR = prevAgentDir;
    fs.rmSync(home, { recursive: true, force: true });
  });

  const writeLedger = (records) => {
    const file = path.join(home, 'skills', 'total-recall', 'memory-derived', 'context-ledger.jsonl');
    fs.writeFileSync(file, records.map(r => JSON.stringify(r)).join('\n') + '\n');
  };

  const out = () => logs.join('\n');

  it('reports no samples honestly instead of inventing a trend', async () => {
    await contextStats(['--json']);
    const body = JSON.parse(logs.at(-1));
    expect(body.samples).toBe(0);
    expect(body.actions).toEqual([]);
  });

  it('summarises overflow per action from the ledger', async () => {
    writeLedger([
      { at: '2026-10-24T00:00:00Z', actions: ['read'], total_tokens: 9000, required_tokens: 9000, overflow_tokens: 3000, required_ids: ['a'], excluded_ids: [] },
      { at: '2026-10-24T00:01:00Z', actions: ['edit'], total_tokens: 100, required_tokens: 100, overflow_tokens: 0, required_ids: ['a', 'b'], excluded_ids: [] },
    ]);
    await contextStats(['--json']);
    const body = JSON.parse(logs.at(-1));
    expect(body.samples).toBe(2);
    const read = body.actions.find(a => a.action === 'read');
    expect(read.overflow_rate).toBe(1);
    expect(body.actions[0].action).toBe('read'); // worst first
    expect(body.most_required[0]).toEqual({ id: 'a', appearances: 2 });
  });

  it('renders a human summary with headroom when a budget is configured', async () => {
    writeLedger([{ at: '2026-10-24T00:00:00Z', actions: ['read'], total_tokens: 100, required_tokens: 100, overflow_tokens: 0, required_ids: ['x'], excluded_ids: [] }]);
    await contextStats([]);
    expect(out()).toMatch(/Capsule measurements: 1 sample/);
    expect(out()).toMatch(/By action:/);
    expect(out()).toMatch(/Identifiers and counts only/);
  });

  it('rejects an unknown flag rather than silently reporting the wrong scope', async () => {
    // A dropped --globel would report project scope while the operator believed
    // otherwise, and this command exists to be trusted about scope.
    await expect(contextStats(['--globel'])).rejects.toThrow(/Unknown context-stats option/);
  });

  it('accepts the layer flags without rejecting them', async () => {
    // --global resolves the global brain created in beforeEach.
    await expect(contextStats(['--global', '--json'])).resolves.toBeUndefined();
    expect(JSON.parse(logs.at(-1))).toHaveProperty('samples');
    // --project needs a project brain; a bare temp dir has none, and the command
    // must say so rather than silently falling back to global scope.
    await expect(contextStats(['--project'])).rejects.toThrow(/No enabled brain/);
  });

  it('reports telemetry as disabled when the switch is off', async () => {
    process.env.TR_CONTEXT_TELEMETRY = 'off';
    try {
      await contextStats([]);
      expect(out()).toMatch(/telemetry is off/i);
    } finally { delete process.env.TR_CONTEXT_TELEMETRY; }
  });

  it('honours --limit so a long ledger can be narrowed', async () => {
    writeLedger(Array.from({ length: 10 }, (_, i) => ({ at: `2026-10-24T00:0${i}:00Z`, actions: ['read'], total_tokens: 1, required_tokens: 1, overflow_tokens: 0, required_ids: [], excluded_ids: [] })));
    await contextStats(['--json', '--limit', '3']);
    expect(JSON.parse(logs.at(-1)).samples).toBe(3);
  });
});
