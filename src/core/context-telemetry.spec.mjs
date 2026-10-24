import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { recordCapsule, readLedger, summariseLedger, ledgerPath, telemetryEnabled, LEDGER_NAME } from './context-telemetry.mjs';

const stats = (over = {}) => ({
  total_tokens: 100, required_tokens: 90, overflow_tokens: 0,
  required_ids: ['global:always-push-everything'], excluded_ids: [],
  version: 'v1', contributions: [{ id: 'global:always-push-everything', required: true, estimated_tokens: 90 }],
  ...over,
});

describe('context telemetry', () => {
  let derived;
  beforeEach(() => { derived = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-telemetry-')); });
  afterEach(() => {
    fs.rmSync(derived, { recursive: true, force: true });
    delete process.env.TR_CONTEXT_TELEMETRY;
    delete process.env.TR_CONTEXT_LEDGER_MAX_BYTES;
  });

  it('records one line per capsule and reads it back', () => {
    const written = recordCapsule(stats(), { derivedDir: derived, action: ['read'], query: 'inspect', consumer: 'cli' });
    expect(written).toMatchObject({ total_tokens: 100, required_tokens: 90, overflow_tokens: 0, ready: true });
    const records = readLedger(derived);
    expect(records).toHaveLength(1);
    expect(records[0].actions).toEqual(['read']);
    expect(records[0].required_count).toBe(1);
    // The query is measured by length, never stored as text.
    expect(records[0].query_chars).toBe(7);
    expect(JSON.stringify(records[0])).not.toContain('inspect');
  });

  it('records an overflowing capsule, which is the sample the budget case needs', () => {
    // A measurement that only counted successes would hide the exact failure it
    // exists to explain.
    recordCapsule(stats({ total_tokens: 9000, required_tokens: 9000, overflow_tokens: 5000 }), { derivedDir: derived, action: ['read'] });
    const [record] = readLedger(derived);
    expect(record.overflow_tokens).toBe(5000);
    expect(record.ready).toBe(false);
  });

  it('never stores rule text or capsule content, only identifiers and counts', () => {
    const secretish = 'API_KEY=sk-live-should-never-be-written';
    recordCapsule(stats({ contributions: [{ id: 'x', required: true, text: secretish, estimated_tokens: 5 }] }), { derivedDir: derived, action: ['secrets'] });
    const raw = fs.readFileSync(ledgerPath(derived), 'utf8');
    expect(raw).not.toContain('sk-live');
    expect(raw).not.toContain(secretish);
  });

  it('stays bounded under sustained writes while keeping a usable trend', () => {
    // The original defect this guards: an append-only log here reached 306 MB
    // and silently broke every backup for five weeks. A second defect, caught
    // while building this: renaming the live file over the previous generation
    // left 4 of 40 records, so the trend the ledger exists for was destroyed.
    process.env.TR_CONTEXT_LEDGER_MAX_BYTES = '20000';
    for (let i = 0; i < 2000; i++) recordCapsule(stats(), { derivedDir: derived, action: ['read'] });
    const file = ledgerPath(derived);
    const size = fs.statSync(file).size;
    // Bounded: 2000 records would be ~450 KB unbounded.
    expect(size).toBeLessThanOrEqual(20000);
    // Useful: retention must preserve a real window, not collapse to a handful.
    expect(readLedger(derived).length).toBeGreaterThan(20);
    // One file, no generation sprawl.
    expect(fs.existsSync(`${file}.1`)).toBe(false);
  });

  it('keeps a bounded window proportional to the cap', () => {
    // Retention is a fraction of the cap, so a larger cap keeps more history.
    // Records are ~225 bytes; a 5 KB cap should retain far more than a 1 KB one.
    process.env.TR_CONTEXT_LEDGER_MAX_BYTES = '5000';
    for (let i = 0; i < 200; i++) recordCapsule(stats(), { derivedDir: derived, action: ['read'] });
    expect(fs.statSync(ledgerPath(derived)).size).toBeLessThanOrEqual(5000);
    const records = readLedger(derived).length;
    expect(records).toBeGreaterThan(5);
  });

  it('can be switched off entirely', () => {
    process.env.TR_CONTEXT_TELEMETRY = 'off';
    expect(telemetryEnabled()).toBe(false);
    expect(recordCapsule(stats(), { derivedDir: derived, action: ['read'] })).toBeNull();
    expect(fs.existsSync(ledgerPath(derived))).toBe(false);
  });

  it('never throws when measurement cannot be written', () => {
    // A session must not fail because telemetry did.
    expect(recordCapsule(stats(), { derivedDir: '/proc/nonexistent-and-unwritable' })).toBeNull();
    expect(recordCapsule(null, { derivedDir: derived })).toBeNull();
    expect(recordCapsule(stats(), { derivedDir: null })).toBeNull();
  });

  it('tolerates a torn line rather than discarding the ledger', () => {
    recordCapsule(stats(), { derivedDir: derived, action: ['read'] });
    fs.appendFileSync(ledgerPath(derived), '{"at":"truncated');
    recordCapsule(stats(), { derivedDir: derived, action: ['edit'] });
    expect(readLedger(derived)).toHaveLength(2);
  });

  it('summarises per action so an overflow is attributable', () => {
    recordCapsule(stats({ overflow_tokens: 0 }), { derivedDir: derived, action: ['read'] });
    recordCapsule(stats({ overflow_tokens: 400 }), { derivedDir: derived, action: ['read'] });
    recordCapsule(stats({ overflow_tokens: 0 }), { derivedDir: derived, action: ['edit'] });
    const summary = summariseLedger(readLedger(derived));
    const read = summary.actions.find(a => a.action === 'read');
    const edit = summary.actions.find(a => a.action === 'edit');
    expect(read.samples).toBe(2);
    expect(read.overflow).toBe(1);
    expect(read.overflow_rate).toBe(0.5);
    // Worst offender first: the ordering is the point of the report.
    expect(summary.actions[0].action).toBe('read');
    expect(edit.overflow_rate).toBe(0);
  });

  it('ranks the rules included most often, the input to action-scoping', () => {
    recordCapsule(stats({ required_ids: ['a', 'b'] }), { derivedDir: derived, action: ['read'] });
    recordCapsule(stats({ required_ids: ['a'] }), { derivedDir: derived, action: ['edit'] });
    const summary = summariseLedger(readLedger(derived));
    expect(summary.most_required[0]).toEqual({ id: 'a', appearances: 2 });
  });

  it('summarises an empty ledger without inventing data', () => {
    const summary = summariseLedger([]);
    expect(summary.samples).toBe(0);
    expect(summary.actions).toEqual([]);
    expect(summary.first_at).toBeNull();
  });

  it('names the ledger inside the brain derived space', () => {
    expect(ledgerPath('/brain/memory-derived')).toBe(path.join('/brain/memory-derived', LEDGER_NAME));
    expect(ledgerPath(null)).toBeNull();
  });
});
