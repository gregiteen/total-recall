import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { CAPSULE_REFRESH_MS, SKILLS, acknowledge, checkAgentReceipt, checkAnyReceipt, checkReceipt, consultPath, findRoot, forgetCapsuleDeliveries, lastArrivalMs, lastCapsuleDelivery, lastSessionAck, markArrival, markSessionAck, lastConsultMs, noteCaller, readReceipt, recordCapsuleDelivery, takeCaller, receiptPath, skillHashes, touchConsult, recordDecision, readDecisions, decisionsLogPath, markRouted, lastRoutedMs, markRouteWarned, lastRouteWarnedMs } from './preflight-receipt.mjs';

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
  it('keeps home and an uninitialized Git worktree in separate receipt scopes', () => {
    const worktree = path.join(root, 'worktree');
    const deep = path.join(worktree, 'src');
    fs.mkdirSync(deep, { recursive: true });
    fs.writeFileSync(path.join(worktree, '.git'), 'gitdir: elsewhere');
    expect(findRoot(deep)).toBe(fs.realpathSync(worktree));
    expect(checkReceipt(findRoot(deep), { home }).problems).toContain(`missing mandatory skill: ${SKILLS[0]}`);
  });
  it('uses home for relocated shared skill files even below a workspace', () => {
    const shared = path.join(root, '.shared', 'skills');
    const homedir = vi.spyOn(os, 'homedir').mockReturnValue(home);
    try {
      fs.mkdirSync(shared, { recursive: true });
      fs.mkdirSync(path.join(home, '.agent'));
      fs.symlinkSync(shared, path.join(home, '.agent', 'skills'));
      expect(findRoot(shared)).toBe(fs.realpathSync(home));
    } finally { homedir.mockRestore(); }
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
  it('acknowledges through a stale curation, because the rule already falls back to its full text', () => {
    const rules = { ok: false, out: '✖ stale curation: global:some-rule (rule edited; full text in use)\n', err: '', code: 1 };
    const r = acknowledge({ root, run: run({ rules }), home });
    expect(r.ok).toBe(true);
    expect(r.notes).toEqual(['stale curation: global:some-rule (rule edited; full text in use)']);
  });
  it('still refuses when a stale curation comes with a real rules problem', () => {
    const rules = { ok: false, out: '✖ stale curation: global:some-rule (rule edited; full text in use)\n✖ orphan curation: gone (rule no longer exists)\n', err: '', code: 1 };
    expect(acknowledge({ root, run: run({ rules }), home }).ok).toBe(false);
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

describe('gate decisions log (ENFORCE-R5)', () => {
  it('appends and reads back real decisions per session without fabricated rates', () => {
    expect(readDecisions({ home })).toEqual([]);
    const d1 = recordDecision({ harness: 'claude', decision: 'allow', rule: 'shell:satisfying-command' }, { home, now: 1000000 });
    const d2 = recordDecision({ harness: 'claude', decision: 'deny', rule: 'receipt', reason: 'receipt missing' }, { home, now: 1000005 });

    const read = readDecisions({ home });
    expect(read).toHaveLength(2);
    expect(read[0]).toMatchObject({ at: new Date(1000000).toISOString(), harness: 'claude', decision: 'allow' });
    expect(read[1]).toMatchObject({ at: new Date(1000005).toISOString(), harness: 'claude', decision: 'deny', rule: 'receipt' });
    expect(decisionsLogPath(home)).toContain('decisions.jsonl');
  });
});

describe('bookkeeping writes never throw', () => {
  let home;
  let tmp;
  let saved;
  const state = () => path.join(home, '.agent', 'tr-preflight');
  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-book-home-'));
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-book-tmp-'));
    fs.mkdirSync(state(), { recursive: true });
    saved = process.env.TMPDIR;
    process.env.TMPDIR = tmp;
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.TMPDIR; else process.env.TMPDIR = saved;
    fs.chmodSync(state(), 0o700);
    fs.chmodSync(tmp, 0o700);
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('keeps stamps and decisions in the temp folder when the state folder refuses writes', () => {
    fs.chmodSync(state(), 0o500);
    markRouted('/r', { home, now: 111 });
    markRouteWarned('/r', { home, now: 222 });
    touchConsult('/r', { home, now: 333 });
    expect(lastRoutedMs('/r', { home })).toBe(111);
    expect(lastRouteWarnedMs('/r', { home })).toBe(222);
    expect(lastConsultMs('/r', { home })).toBe(333);
    expect(recordDecision({ harness: 'x', decision: 'allow' }, { home, now: 1000 })).toMatchObject({ harness: 'x' });
    expect(readDecisions({ home }).map((row) => row.harness)).toEqual(['x']);
  });
  it('reads decisions from both places, oldest first', () => {
    recordDecision({ harness: 'second' }, { home, now: 2000 });
    fs.chmodSync(state(), 0o500);
    fs.chmodSync(decisionsLogPath(home), 0o400);
    recordDecision({ harness: 'first' }, { home, now: 1000 });
    expect(readDecisions({ home }).map((row) => row.harness)).toEqual(['first', 'second']);
  });
  it('returns quietly with nowhere to write', () => {
    fs.chmodSync(state(), 0o500);
    fs.chmodSync(tmp, 0o500);
    expect(() => { markRouted('/r', { home }); markRouteWarned('/r', { home }); touchConsult('/r', { home }); }).not.toThrow();
    expect(recordDecision({ harness: 'x' }, { home })).toBeNull();
    expect(lastRoutedMs('/r', { home })).toBe(0);
  });
});

describe('acknowledge hands over the capsule', () => {
  const capsule = (hash = 'aaaa1111aaaa1111') => ({ ok: true, out: `ready:true tokens:12 version:abc123 rules_hash:${hash}\nPREFLIGHT: read this, then run the ack\nthe rules\n`, err: '', code: 0 });
  const ack = ({ hash, ...options } = {}) => acknowledge({ root, task: 'first task', home, session: 's1', run: run({ context: capsule(hash) }), ...options });

  it('returns the capsule without the notice that sends the reader to the command just run', () => {
    const result = ack();
    expect(result.capsule).toBe('ready:true tokens:12 version:abc123 rules_hash:aaaa1111aaaa1111\nthe rules');
    expect(result.unchanged).toBeNull();
    expect(result.receipt).toMatchObject({ capsule: 'printed', rules_hash: 'aaaa1111aaaa1111', capsule_version: 'abc123' });
  });
  it('skips it for the same session and rules, even when the task is reworded', () => {
    const start = Date.now();
    ack({ now: start });
    const again = ack({ task: 'a reworded task', now: start + 31 * 60000 });
    expect(again.ok).toBe(true);
    expect(again.capsule).toBeNull();
    expect(again.unchanged.ageMs).toBe(31 * 60000);
    expect(again.receipt.capsule).toBe('unchanged');
    // The receipt is still renewed, or the gate would deny the next call.
    expect(checkReceipt(root, { home, now: start + 32 * 60000 }).ok).toBe(true);
  });
  it('still returns it when the session cannot be named, every time', () => {
    expect(ack({ session: null }).capsule).toContain('the rules');
    expect(ack({ session: null }).capsule).toContain('the rules');
  });
  it('returns it to a session that has not received it, whoever acknowledged first', () => {
    ack();
    expect(ack({ session: 's2' }).capsule).toContain('the rules');
  });
  it('returns it when a rule changes', () => {
    ack();
    expect(ack({ hash: 'bbbb2222bbbb2222' }).capsule).toContain('the rules');
  });
  it('returns it when a mandatory skill changes', () => {
    ack();
    write(SKILLS[0], 'a rewritten skill');
    expect(ack().capsule).toContain('the rules');
  });
  it('returns it past the ceiling, which a skipped print does not extend', () => {
    const start = Date.now();
    ack({ now: start });
    expect(ack({ now: start + CAPSULE_REFRESH_MS - 1000 }).capsule).toBeNull();
    expect(ack({ now: start + CAPSULE_REFRESH_MS }).capsule).toContain('the rules');
  });
  it('returns it once the session has forgotten it', () => {
    ack();
    forgetCapsuleDeliveries('s1', { home });
    expect(lastCapsuleDelivery(root, 's1', { home })).toBeNull();
    expect(ack().capsule).toContain('the rules');
  });
  it('never skips on a capsule that carries no rules hash', () => {
    recordCapsuleDelivery(root, 's1', { rulesHash: null, skills: skillHashes(root).hashes }, { home });
    expect(acknowledge({ root, home, session: 's1', run: run() }).capsule).toContain('rules');
  });
  it('counts a capsule the session received from context, so it is not printed twice', () => {
    recordCapsuleDelivery(root, 's1', { rulesHash: 'aaaa1111aaaa1111', skills: skillHashes(root).hashes, task: 'first task' }, { home });
    expect(ack().capsule).toBeNull();
  });
});

describe('the gate tells a capsule command who is running it', () => {
  const command = 'total-recall tr-preflight --ack --task "ship it"';
  it('answers once', () => {
    noteCaller(root, 's1', 'ack', command, { home });
    expect(takeCaller(root, 'ack', { task: 'ship it', home })).toBe('s1');
    expect(takeCaller(root, 'ack', { task: 'ship it', home })).toBeNull();
  });
  it('answers null once the note is old, so the capsule gets printed', () => {
    const now = Date.now();
    noteCaller(root, 's1', 'ack', command, { home, now });
    expect(takeCaller(root, 'ack', { task: 'ship it', home, now: now + 16000 })).toBeNull();
  });
  it('leaves a note for another command alone', () => {
    noteCaller(root, 's1', 'ack', command, { home });
    expect(takeCaller(root, 'ack', { task: 'some other task', home })).toBeNull();
    expect(takeCaller(root, 'context', { task: 'ship it', home })).toBeNull();
    expect(takeCaller(root, 'ack', { task: 'ship it', home })).toBe('s1');
  });
});

describe('an agent is not bound to one repository', () => {
  let other;
  const acknowledged = (repo, options = {}) => acknowledge({ root: repo, task: 'x', home, run: run(), ...options });
  const shareSkills = () => {
    for (const rel of SKILLS) {
      const file = path.join(home, rel);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, `shared ${rel}`);
    }
  };
  const TWO_HOURS = 2 * 60 * 60 * 1000;
  beforeEach(() => {
    other = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-pf-other-'));
    fs.writeFileSync(path.join(other, '.git'), 'gitdir: elsewhere');
  });
  afterEach(() => fs.rmSync(other, { recursive: true, force: true }));

  it("lets a repository with no skills acknowledge with the machine's shared ones", () => {
    expect(acknowledged(other).ok).toBe(false);
    shareSkills();
    const result = acknowledged(other);
    expect(result.ok).toBe(true);
    expect(result.skillFiles).toEqual(SKILLS.map((rel) => path.join(home, rel)));
    expect(checkReceipt(other, { home }).ok).toBe(true);
  });
  it("uses its brain's skills for a nested checkout with none, before the shared ones", () => {
    shareSkills();
    const nested = path.join(root, 'nested');
    fs.mkdirSync(nested);
    fs.writeFileSync(path.join(nested, '.git'), 'gitdir: elsewhere');
    vi.stubEnv('_TR_TEST_AGENT_DIR', '');
    try {
      expect(skillHashes(nested, home).files).toEqual(SKILLS.map((rel) => path.join(root, rel)));
    } finally { vi.unstubAllEnvs(); }
  });
  it("prefers a repository's own skills", () => {
    shareSkills();
    expect(skillHashes(root, home).files).toEqual(SKILLS.map((rel) => path.join(root, rel)));
  });
  it('reads the receipt from where the session acknowledged, wherever it is now', () => {
    acknowledged(root);
    markSessionAck(root, 's1', { home });
    expect(lastSessionAck('s1', { home })).toMatchObject({ root });
    expect(checkReceipt(other, { home }).ok).toBe(false);
    expect(checkAgentReceipt(other, 's1', { home }).ok).toBe(true);
  });
  it('keeps the directory rule for a caller with no session, or one that never acknowledged', () => {
    acknowledged(root);
    expect(checkAgentReceipt(other, null, { home }).ok).toBe(false);
    expect(checkAgentReceipt(other, 'never', { home }).ok).toBe(false);
  });
  it('reports the receipt that lapsed, not the repository the session moved into', () => {
    acknowledged(root, { now: Date.now() - TWO_HOURS });
    markSessionAck(root, 's1', { home });
    expect(checkAgentReceipt(other, 's1', { home }).problems[0]).toContain('stale');
  });
  it('accepts a fresh receipt from anywhere for a caller nobody can name, and nothing else', () => {
    expect(checkAnyReceipt(other, { home }).ok).toBe(false);
    acknowledged(root, { now: Date.now() - TWO_HOURS });
    expect(checkAnyReceipt(other, { home }).ok).toBe(false);
    acknowledged(root);
    expect(checkAnyReceipt(other, { home })).toMatchObject({ ok: true, receipt: { repo: root } });
  });
  it('keeps a routed task routed across repositories, for that session only', () => {
    markRouted('/a', { home, session: 's1', now: 5 });
    expect(lastRoutedMs('/b', { home, session: 's1' })).toBe(5);
    expect(lastRoutedMs('/b', { home, session: 's2' })).toBe(0);
    expect(lastRoutedMs('/b', { home })).toBe(0);
  });
  it("forgets every repository's capsule and arrival for a compacted session, and no other session's", () => {
    for (const repo of [root, other]) {
      recordCapsuleDelivery(repo, 's1', { rulesHash: 'a', skills: {} }, { home });
      markArrival(repo, 's1', { home });
    }
    recordCapsuleDelivery(root, 's2', { rulesHash: 'a', skills: {} }, { home });
    forgetCapsuleDeliveries('s1', { home });
    for (const repo of [root, other]) {
      expect(lastCapsuleDelivery(repo, 's1', { home })).toBeNull();
      expect(lastArrivalMs(repo, 's1', { home })).toBe(0);
    }
    expect(lastCapsuleDelivery(root, 's2', { home })).not.toBeNull();
  });
});
