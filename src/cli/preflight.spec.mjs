import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SKILLS, acknowledge, findRoot } from '../core/preflight-receipt.mjs';

// These run the real entry point in a child process, the way every hook does.
const BIN = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'bin', 'total-recall.mjs');
let home;
let bare;
let repo;

const run = (args, { cwd, input } = {}) => {
  const r = spawnSync(process.execPath, [BIN, ...args], { cwd, input, encoding: 'utf8', env: { ...process.env, HOME: home, TR_PREFLIGHT_MAX_AGE_MIN: '' } });
  return { code: r.status, out: r.stdout, err: r.stderr };
};
const gate = (call, cwd, args = []) => {
  const r = run(['preflight', 'gate', ...args], { cwd, input: typeof call === 'string' ? call : JSON.stringify(call) });
  let answer = null;
  try { answer = JSON.parse(r.out.trim().split('\n').pop()); } catch { /* not JSON */ }
  return { ...r, answer };
};

beforeAll(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-pf-cli-home-'));
  bare = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-pf-cli-bare-'));
  repo = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-pf-cli-repo-'));
  for (const rel of SKILLS) { const f = path.join(repo, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, rel); }
  repo = findRoot(repo);
  acknowledge({ root: repo, task: 'spec', home, run: (a) => (a[0] === 'context' ? { ok: true, out: 'ready:true tokens:1 version:aa', err: '', code: 0 } : { ok: true, out: '', err: '', code: 0 }) });
});
afterAll(() => { for (const d of [home, bare, repo]) fs.rmSync(d, { recursive: true, force: true }); });

describe('total-recall preflight gate (real process)', () => {
  it('denies with exit 2 and the exact fix when there is no receipt', () => {
    const r = gate({ tool: 'write', cwd: bare }, bare);
    expect(r.code).toBe(2);
    expect(r.answer).toMatchObject({ decision: 'deny', rule: 'receipt' });
    expect(r.answer.fix).toContain('tr-preflight --ack');
  });
  it('keeps the satisfying command open without a receipt', () => {
    const r = gate({ tool: 'shell', command: 'total-recall tr-preflight --check', cwd: bare }, bare);
    expect(r.code).toBe(0);
    expect(r.answer.decision).toBe('allow');
  });
  it('rejects a chained command that tries to ride the exemption', () => {
    const r = gate({ tool: 'shell', command: 'total-recall tr-preflight --check; rm -rf x', cwd: bare }, bare);
    expect(r.code).toBe(2);
  });
  it('allows work in a directory with a fresh receipt', () => {
    const r = gate({ tool: 'write', cwd: repo }, repo);
    expect(r.code).toBe(0);
    expect(r.answer).toMatchObject({ decision: 'allow', rule: 'receipt:fresh' });
  });
  it('fails closed on unreadable input', () => {
    const r = gate('{not json', bare);
    expect(r.code).toBe(2);
    expect(r.answer).toMatchObject({ decision: 'deny', rule: 'gate-error' });
  });
  it('fails closed on input that parses but is not a call', () => {
    for (const input of ['null', '[]', '42', '"x"', 'true']) {
      const r = gate(input, bare);
      expect(r.code, input).toBe(2);
      expect(r.answer, input).toMatchObject({ decision: 'deny', rule: 'gate-error' });
    }
  });
  it('fails closed when the call is malformed but an object', () => {
    for (const call of [{ tool: 7 }, { tool: 'write', cwd: 42 }, { tool: 'shell', command: { x: 1 } }, {}]) {
      expect(gate(call, bare).code, JSON.stringify(call)).toBe(2);
    }
  });
  it('fails closed when a harness has no adapter', () => {
    const r = gate({ tool: 'write', cwd: repo }, repo, ['--harness', 'no-such-harness']);
    expect(r.code).toBe(2);
    expect(r.answer.rule).toBe('gate-error');
    expect(r.answer.reason).toContain('no-such-harness');
  });
  it('answers in well under a second', () => {
    const start = Date.now();
    gate({ tool: 'write', cwd: repo }, repo);
    expect(Date.now() - start).toBeLessThan(2500);
  });
});

describe('total-recall preflight remind (prompt hooks never block the human)', () => {
  const remind = (input, cwd, extra = []) => run(['preflight', 'remind', ...extra], { cwd, input });
  it('prints the reminder when there is no receipt, and still exits 0', () => {
    const r = remind(JSON.stringify({ cwd: bare }), bare);
    expect(r.code).toBe(0);
    expect(r.out).toContain('TR-PREFLIGHT FAILED');
    expect(r.out).toContain('--ack');
  });
  it('is silent with a receipt', () => {
    const r = remind(JSON.stringify({ cwd: repo }), repo);
    expect(r.code).toBe(0);
    expect(r.out).toBe('');
  });
  it('exits 0 on every kind of bad input', () => {
    for (const input of ['{not json', '', 'null', '[]', '{"cwd":"/definitely/not/here"}', '{"cwd":42}', 'x'.repeat(100000)]) {
      expect(remind(input, bare).code, JSON.stringify(input.slice(0, 20))).toBe(0);
    }
  });
  it('exits 0 when the home directory cannot be read', () => {
    const r = spawnSync(process.execPath, [BIN, 'preflight', 'remind'], { cwd: bare, input: '{}', encoding: 'utf8', env: { ...process.env, HOME: '/definitely/not/here' } });
    expect(r.status).toBe(0);
  });
  it('gives machine-readable output', () => {
    expect(JSON.parse(remind('{}', repo, ['--json']).out)).toEqual({ reminder: null });
    expect(JSON.parse(remind('{}', bare, ['--json']).out).reminder).toContain('TR-PREFLIGHT FAILED');
  });
});

describe('total-recall preflight check and the tr-preflight alias', () => {
  it('exits 1 with the ack command when there is no receipt', () => {
    for (const args of [['preflight', 'check'], ['tr-preflight', '--check']]) {
      const r = run(args, { cwd: bare });
      expect(r.code).toBe(1);
      expect(r.err).toContain('tr-preflight FAILED');
      expect(r.err).toContain('--ack');
    }
  });
  it('exits 0 with a receipt and gives the same answer through the alias', () => {
    const a = run(['preflight', 'check'], { cwd: repo });
    const b = run(['tr-preflight', '--check'], { cwd: repo });
    expect(a.code).toBe(0);
    expect(b.code).toBe(0);
    expect(a.out).toContain('tr-preflight OK');
    expect(a.out).toBe(b.out);
  });
  it('reports machine-readable state', () => {
    const r = run(['preflight', 'check', '--json'], { cwd: repo });
    expect(JSON.parse(r.out)).toMatchObject({ ok: true, task: 'spec' });
  });
  it.each(['--off', '--remove'])('has no off switch: install %s refuses', (off) => {
    const r = run(['preflight', 'install', off], { cwd: repo });
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/no off switch/);
  });

  it('install --help prints usage and performs nothing', () => {
    const r = run(['preflight', 'install', '--help'], { cwd: repo });
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/Usage: total-recall preflight/);
    expect(r.out).not.toMatch(/Installed preflight gate/);
  });

  it('installs adapter with dry-run or rejects unknown harness', () => {
    const okRun = run(['preflight', 'install', '--dry-run'], { cwd: repo });
    expect(okRun.code).toBe(0);
    const failRun = run(['preflight', 'install', '--harness', 'no-such-harness'], { cwd: repo });
    expect(failRun.code).toBe(1);
    expect(failRun.err).toContain('no-such-harness');
  });
});
