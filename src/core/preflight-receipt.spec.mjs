import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { SKILLS, acknowledge, checkReceipt, consultPath, findRoot, lastConsultMs, readReceipt, receiptPath, skillHashes, touchConsult } from './preflight-receipt.mjs';

let root;
let home;
const write = (rel, body) => { const f = path.join(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, body); };
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-pf-root-'));
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-pf-home-'));
  for (const rel of SKILLS) write(rel, `skill ${rel}`);
});
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(home, { recursive: true, force: true }); });

const ready = { ok: true, out: 'ready:true tokens:12 version:abc123def\nrules', err: '', code: 0 };
const run = (overrides = {}) => (args) => (args[0] === 'context' ? (overrides.context || ready) : (overrides.rules || { ok: true, out: 'ok', err: '', code: 0 }));

describe('findRoot', () => {
  it('finds the nearest ancestor with .agent, else the directory itself', () => {
    const deep = path.join(root, 'a', 'b'); fs.mkdirSync(deep, { recursive: true });
    expect(findRoot(deep)).toBe(fs.realpathSync(root));
    const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-pf-bare-'));
    try { expect(findRoot(bare)).toBe(fs.realpathSync(bare)); } finally { fs.rmSync(bare, { recursive: true, force: true }); }
  });
  it('gives a symlinked path and its real path the same root, so they find the same receipt', () => {
    const link = path.join(os.tmpdir(), `tr-pf-link-${process.pid}`);
    fs.symlinkSync(root, link);
    try { expect(findRoot(link)).toBe(findRoot(root)); } finally { fs.unlinkSync(link); }
  });
});

describe('checkReceipt', () => {
  it('reports each failure: missing skills, no receipt', () => {
    fs.rmSync(path.join(root, SKILLS[1]));
    expect(checkReceipt(root, { home })).toMatchObject({ ok: false, problems: [`missing mandatory skill: ${SKILLS[1]}`] });
    write(SKILLS[1], 'x');
    expect(checkReceipt(root, { home })).toMatchObject({ ok: false, problems: ['no preflight receipt for this repository'] });
  });
  it('accepts a fresh receipt written by acknowledge', () => {
    expect(acknowledge({ root, task: 'EN-02', run: run(), home }).ok).toBe(true);
    const result = checkReceipt(root, { home });
    expect(result.ok).toBe(true);
    expect(result.receipt.task).toBe('EN-02');
    expect(result.receipt.capsule_version).toBe('abc123def');
  });
  it('rejects a stale receipt, a changed skill and a receipt that is not ready', () => {
    const now = Date.now();
    acknowledge({ root, run: run(), home, now });
    expect(checkReceipt(root, { home, now: now + 31 * 60000 }).problems).toContain('preflight receipt is stale; re-run --ack');
    expect(checkReceipt(root, { home, now: now + 29 * 60000 }).ok).toBe(true);
    write(SKILLS[0], 'edited skill');
    expect(checkReceipt(root, { home, now }).problems[0]).toContain('changed since the receipt');
    write(SKILLS[0], `skill ${SKILLS[0]}`);
    const file = receiptPath(root, home);
    fs.writeFileSync(file, JSON.stringify({ ...readReceipt(root, home), ready: false }));
    expect(checkReceipt(root, { home, now }).problems).toContain('receipt does not record ready:true');
  });
  it('honors an explicit maximum age over the receipt and the default', () => {
    const now = Date.now();
    acknowledge({ root, run: run(), home, now });
    expect(checkReceipt(root, { home, now: now + 5 * 60000, maxAgeMs: 4 * 60000 }).ok).toBe(false);
    expect(checkReceipt(root, { home, now: now + 40 * 60000, maxAgeMs: 60 * 60000 }).ok).toBe(true);
  });
  it('carries the window it was written with, so the hot path needs no configuration', () => {
    const now = Date.now();
    acknowledge({ root, run: run(), home, now, maxAgeMs: 5 * 60000 });
    expect(readReceipt(root, home).max_age_ms).toBe(300000);
    expect(checkReceipt(root, { home, now: now + 4 * 60000 }).ok).toBe(true);
    expect(checkReceipt(root, { home, now: now + 6 * 60000 }).ok).toBe(false);
    acknowledge({ root, run: run(), home, now });
    expect(readReceipt(root, home).max_age_ms).toBeUndefined();
    expect(checkReceipt(root, { home, now: now + 29 * 60000 }).ok).toBe(true);
  });
  it('still accepts a receipt in the format the original tr-preflight command wrote', () => {
    const { hashes } = skillHashes(root);
    const file = receiptPath(root, home); fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ at: new Date().toISOString(), repo: root, task: 't', actions: 'read', ready: true, skills: hashes, rules_verify: 'ok' }));
    expect(checkReceipt(root, { home }).ok).toBe(true);
    expect(file).toContain(crypto.createHash('sha256').update(root).digest('hex').slice(0, 16));
  });
});

describe('acknowledge', () => {
  it('refuses without ready:true and explains an overflow', () => {
    const r = acknowledge({ root, run: run({ context: { ok: false, out: 'ready:false reason:budget-overflow', err: '', code: 2 } }), home });
    expect(r.ok).toBe(false);
    expect(r.problems.join(' ')).toContain('capsule overflow');
    expect(readReceipt(root, home)).toBeNull();
  });
  it('refuses when rules do not verify and writes nothing', () => {
    const r = acknowledge({ root, run: run({ rules: { ok: false, out: 'rule too long', err: '', code: 1 } }), home });
    expect(r.ok).toBe(false);
    expect(r.problems[0]).toBe('total-recall rules verify failed');
    expect(readReceipt(root, home)).toBeNull();
  });
  it('refuses when a mandatory skill is missing', () => {
    fs.rmSync(path.join(root, SKILLS[0]));
    expect(acknowledge({ root, run: run(), home }).ok).toBe(false);
  });
  it('writes the receipt owner-only', () => {
    const r = acknowledge({ root, run: run(), home });
    expect(fs.statSync(r.file).mode & 0o777).toBe(0o600);
    expect(fs.statSync(path.dirname(r.file)).mode & 0o777).toBe(0o700);
  });
});

describe('consult stamp', () => {
  it('records and reads the last consult', () => {
    expect(lastConsultMs(root, { home })).toBe(0);
    touchConsult(root, { now: 1234567, home });
    expect(lastConsultMs(root, { home })).toBe(1234567);
    expect(consultPath(root, home)).toContain('consult-');
  });
});
