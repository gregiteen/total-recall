import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setBrainEnabled } from '../core/brain-registry.mjs';
import { SKILLS, acknowledge, findRoot, lastCapsuleDelivery, recordCapsuleDelivery, sessionKey, takeCaller } from '../core/preflight-receipt.mjs';

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

describe('the gate survives a broken owner plugin (it can never lock out its own repair)', () => {
  const ADAPTER = `export function get() { return {
    readablePaths: [],
    async run({ stdin, decideWith }) {
      const d = decideWith({ tool: stdin.tool_name === 'Bash' ? 'shell' : 'write', command: stdin.tool_input?.command, path: stdin.tool_input?.file_path, cwd: stdin.cwd });
      return d.decision === 'allow' ? { stdout: '', exitCode: 0 } : { stdout: 'ADAPTER-DENY', exitCode: 2 };
    } }; }`;
  let pluginHome;
  const pluginDir = () => path.join(pluginHome, '.agent', 'skills', 'total-recall', 'plugins', 'meta-harness');
  const install = (manifest, adapter = ADAPTER) => {
    fs.rmSync(pluginDir(), { recursive: true, force: true });
    fs.mkdirSync(pluginDir(), { recursive: true });
    fs.writeFileSync(path.join(pluginDir(), 'plugin.json'), typeof manifest === 'string' ? manifest : JSON.stringify(manifest));
    fs.writeFileSync(path.join(pluginDir(), 'adapters.mjs'), adapter);
  };
  const hook = (payload, cwd) => {
    const r = spawnSync(process.execPath, [BIN, 'preflight', 'gate', '--harness', 'claude'], { cwd, input: JSON.stringify({ cwd, ...payload }), encoding: 'utf8', env: { ...process.env, HOME: pluginHome, AGENT_DIR: path.join(pluginHome, '.agent'), _TR_TEST_AGENT_DIR: '', TR_PREFLIGHT_MAX_AGE_MIN: '' } });
    return { code: r.status, out: r.stdout, err: r.stderr };
  };
  const EDIT = { tool_name: 'Edit', tool_input: { file_path: '/x/plugin.json' } };
  const CONTEXT = { tool_name: 'Bash', tool_input: { command: 'total-recall context "repair"' } };
  // The manifest that caused the lockout: valid JSON, one snake_case argument name.
  const INVALID = { id: 'meta-harness', name: 'x', version: '1.0.0', runtime: { modules: { 'gate-adapters': 'adapters.mjs' } }, cli: { command: 'meta-harness', subcommands: [{ name: 'route', args: [{ name: 'timeout_ms', flag: '--timeout-ms', type: 'number' }] }] } };
  let receiptRepo;

  beforeAll(() => {
    pluginHome = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-pf-owner-home-'));
    receiptRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-pf-owner-repo-'));
    for (const rel of SKILLS) { const f = path.join(receiptRepo, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, rel); }
    receiptRepo = findRoot(receiptRepo);
    acknowledge({ root: receiptRepo, task: 'spec', home: pluginHome, run: (a) => (a[0] === 'context' ? { ok: true, out: 'ready:true tokens:1 version:aa', err: '', code: 0 } : { ok: true, out: '', err: '', code: 0 }) });
  });
  afterAll(() => { for (const d of [pluginHome, receiptRepo]) fs.rmSync(d, { recursive: true, force: true }); });

  it('still uses the adapter when the manifest fails schema validation', () => {
    install(INVALID);
    expect(hook(EDIT, receiptRepo).code).toBe(0);
    const denied = hook(EDIT, bare);
    expect(denied.code).toBe(2);
    expect(denied.out).toContain('ADAPTER-DENY');
    expect(denied.err).toContain('tr-preflight --ack');
  });
  for (const [label, setUp, ownerFailed] of [
    ['an unparseable manifest', () => install('{ not json'), true],
    ['adapter code that throws on import', () => install({ ...INVALID }, 'throw new Error("boom");'), true],
    // The bundled copy may answer for a removed global plugin; either way nothing locks.
    ['a removed plugin', () => fs.rmSync(pluginDir(), { recursive: true, force: true }), false],
  ]) {
    it(`keeps repair and receipted work open with ${label}, and explains every denial`, () => {
      setUp();
      expect(hook(CONTEXT, bare).code).toBe(0);
      expect(hook(EDIT, receiptRepo).code).toBe(0);
      const denied = hook(EDIT, bare);
      expect(denied.code).toBe(2);
      if (ownerFailed) expect(denied.err).toContain('meta-harness plugin could not load');
      expect(denied.err).toContain('tr-preflight --ack');
    });
  }
  it('still fails closed, with a reason on stderr, on a payload it cannot read', () => {
    install('{ not json');
    const r = hook({ something: 'else' }, receiptRepo);
    expect(r.code).toBe(2);
    expect(r.err).toContain('fails closed');
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

describe('gate modes through the real command', () => {
  let modeHome;
  let modeRepo;
  const env = () => ({ ...process.env, HOME: modeHome, AGENT_DIR: path.join(modeHome, '.agent'), _TR_TEST_AGENT_DIR: '', TR_PREFLIGHT_MAX_AGE_MIN: '' });
  const pluginDir = () => path.join(modeHome, '.agent', 'skills', 'total-recall', 'plugins', 'fx');
  const cli = (args, input) => spawnSync(process.execPath, [BIN, ...args], { cwd: modeRepo, input, encoding: 'utf8', env: env() });
  const rawCall = () => {
    const r = cli(['preflight', 'gate'], JSON.stringify({ tool: 'shell', command: 'rawthing --now', cwd: modeRepo }));
    return { code: r.status, answer: JSON.parse(r.stdout.trim()) };
  };
  const owner = (code) => fs.writeFileSync(path.join(pluginDir(), 'cli.mjs'), code);

  beforeAll(() => {
    modeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-pf-mode-home-'));
    modeRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-pf-mode-repo-'));
    for (const rel of SKILLS) { const f = path.join(modeRepo, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, rel); }
    modeRepo = findRoot(modeRepo);
    acknowledge({ root: modeRepo, task: 'spec', home: modeHome, run: (a) => (a[0] === 'context' ? { ok: true, out: 'ready:true tokens:1 version:aa', err: '', code: 0 } : { ok: true, out: '', err: '', code: 0 }) });
    fs.mkdirSync(pluginDir(), { recursive: true });
    fs.writeFileSync(path.join(pluginDir(), 'plugin.json'), JSON.stringify({
      id: 'fx', name: 'Fixture', version: '1.0.0', description: 'A plugin that owns one raw command.',
      cli: { command: 'fx', handler: './cli.mjs', answers_help: true, subcommands: [{ name: 'go', description: 'Run it.' }] },
      ui: { elements: [{ id: 'card', kind: 'card', tag: 'fx-card', module: 'ui/card.js' }] },
      gate: { owned_commands: [{ pattern: 'rawthing\\b', use: 'total-recall fx go' }] },
    }));
    owner('process.exit(0);');
  });
  afterAll(() => { for (const d of [modeHome, modeRepo]) fs.rmSync(d, { recursive: true, force: true }); });

  it('warns by default: the command runs and the note names the plugin command', () => {
    const { code, answer } = rawCall();
    expect(code).toBe(0);
    expect(answer).toMatchObject({ decision: 'allow', rule: 'warn:owned:fx' });
    expect(answer.warning).toContain('total-recall fx go');
  });
  it('blocks once a plugin is set to enforce', () => {
    expect(cli(['preflight', 'mode', 'enforce', '--plugin', 'fx']).status).toBe(0);
    const { code, answer } = rawCall();
    expect(code).toBe(2);
    expect(answer).toMatchObject({ decision: 'deny', rule: 'owned:fx', fix: 'total-recall fx go' });
  });
  for (const [label, code] of [['throws', 'throw new Error("boom");'], ['cannot load a module', 'import "./gone.mjs";']]) {
    it(`does not block when the owner ${label}, and blocks again once it is repaired`, () => {
      owner(code);
      const broken = rawCall();
      expect(broken.code).toBe(0);
      expect(broken.answer.warning).toContain('failed its health check');
      owner('process.exit(0);');
      expect(rawCall().code).toBe(2);
    });
  }
  it('does nothing in off, and clear follows the next level again', () => {
    expect(cli(['preflight', 'mode', 'off', '--plugin', 'fx']).status).toBe(0);
    expect(rawCall().answer).toEqual({ decision: 'allow', rule: 'receipt:fresh' });
    expect(cli(['preflight', 'mode', 'clear', '--plugin', 'fx']).status).toBe(0);
    expect(rawCall().answer.rule).toBe('warn:owned:fx');
  });
  it('lets a repository override the machine, only where it has a brain', () => {
    const noBrain = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-pf-mode-nobrain-'));
    const refused = spawnSync(process.execPath, [BIN, 'preflight', 'mode', 'off', '--repo'], { cwd: noBrain, encoding: 'utf8', env: env() });
    fs.rmSync(noBrain, { recursive: true, force: true });
    expect(refused.status).toBe(1);
    expect(refused.stderr).toContain('no project brain');
    expect(cli(['preflight', 'mode', 'enforce', '--plugin', 'fx']).status).toBe(0);
    expect(cli(['preflight', 'mode', 'off', '--repo']).status).toBe(0);
    expect(rawCall().code).toBe(0);
    expect(cli(['preflight', 'mode', 'clear', '--repo']).status).toBe(0);
    expect(rawCall().code).toBe(2);
    expect(cli(['preflight', 'mode', 'clear', '--plugin', 'fx']).status).toBe(0);
  });
  it('refuses an unknown mode or plugin and changes nothing', () => {
    expect(cli(['preflight', 'mode', 'block']).status).toBe(1);
    const unknown = cli(['preflight', 'mode', 'off', '--plugin', 'nope']);
    expect(unknown.status).toBe(1);
    expect(unknown.stderr).toContain('fx');
    expect(rawCall().answer.rule).toBe('warn:owned:fx');
  });
  it('reports modes and warning delivery', () => {
    const report = JSON.parse(cli(['preflight', 'mode', '--json']).stdout);
    expect(report.plugins).toEqual([{ plugin: 'fx', mode: 'warn' }]);
    expect(report.settings.machine).toContain('gate.json');
  });
});

describe('bookkeeping never decides anything (a sandbox may refuse every write the gate makes)', () => {
  let home;
  let repo;
  let tmp;
  const state = () => path.join(home, '.agent', 'tr-preflight');
  const pluginDir = () => path.join(home, '.agent', 'skills', 'total-recall', 'plugins', 'fx');
  const env = () => ({ ...process.env, HOME: home, AGENT_DIR: path.join(home, '.agent'), _TR_TEST_AGENT_DIR: '', TR_PREFLIGHT_MAX_AGE_MIN: '', TMPDIR: tmp });
  const gate = (call) => {
    const r = spawnSync(process.execPath, [BIN, 'preflight', 'gate'], { cwd: repo, input: JSON.stringify({ cwd: repo, ...call }), encoding: 'utf8', env: env() });
    return { code: r.status, answer: JSON.parse(r.stdout.trim().split('\n').pop()) };
  };
  const refuseWrites = (dir) => fs.chmodSync(dir, 0o500);
  const allowWrites = (dir) => fs.chmodSync(dir, 0o700);

  beforeAll(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-pf-sbx-home-'));
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-pf-sbx-tmp-'));
    repo = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-pf-sbx-repo-'));
    for (const rel of SKILLS) { const f = path.join(repo, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, rel); }
    repo = findRoot(repo);
    acknowledge({ root: repo, task: 'spec', home, run: (a) => (a[0] === 'context' ? { ok: true, out: 'ready:true tokens:1 version:aa', err: '', code: 0 } : { ok: true, out: '', err: '', code: 0 }) });
    fs.mkdirSync(path.join(pluginDir(), 'ui'), { recursive: true });
    fs.writeFileSync(path.join(pluginDir(), 'plugin.json'), JSON.stringify({
      id: 'fx', name: 'Fixture', version: '1.0.0', description: 'A plugin that owns one raw command and routes.',
      cli: { command: 'fx', handler: './cli.mjs', subcommands: [{ name: 'route', description: 'Route.' }] },
      ui: { elements: [{ id: 'card', kind: 'card', tag: 'fx-card', module: 'ui/card.js' }] },
      gate: { owned_commands: [{ pattern: 'rawthing\\b', use: 'total-recall fx route' }], router: { pattern: 'fx\\s+route', use: 'total-recall fx route "<task>"' } },
    }));
    fs.writeFileSync(path.join(pluginDir(), 'cli.mjs'), 'process.exit(0);');
    fs.writeFileSync(path.join(pluginDir(), 'ui', 'card.js'), '');
  });
  afterAll(() => {
    for (const d of [state(), tmp]) { try { allowWrites(d); } catch { /* already gone */ } }
    for (const d of [home, repo, tmp]) fs.rmSync(d, { recursive: true, force: true });
  });

  it('allows and warns with the state folder unwritable, keeping the stamp in the temp folder', () => {
    refuseWrites(state());
    try {
      const first = gate({ tool: 'write', path: 'a' });
      expect(first.code).toBe(0);
      expect(first.answer).toMatchObject({ decision: 'allow', warned: ['route'] });
      expect(gate({ tool: 'write', path: 'a' }).answer).toEqual({ decision: 'allow', rule: 'receipt:fresh' });
      expect(gate({ tool: 'shell', command: 'rawthing' }).code).toBe(0);
      expect(fs.readdirSync(state()).some((name) => name.startsWith('route-warned-'))).toBe(false);
    } finally { allowWrites(state()); }
  });
  it('allows with both places unwritable, and only warns again', () => {
    refuseWrites(state());
    refuseWrites(tmp);
    try {
      for (const call of [{ tool: 'write', path: 'b' }, { tool: 'shell', command: 'rawthing' }, { tool: 'shell', command: 'total-recall fx route "x"' }]) {
        expect(gate(call).code, JSON.stringify(call)).toBe(0);
      }
    } finally { allowWrites(state()); allowWrites(tmp); }
  });
  it('still blocks on a missing receipt with the state folder unwritable', () => {
    const bareDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-pf-sbx-bare-'));
    refuseWrites(state());
    try {
      const r = spawnSync(process.execPath, [BIN, 'preflight', 'gate'], { cwd: bareDir, input: JSON.stringify({ tool: 'write', path: 'a', cwd: bareDir }), encoding: 'utf8', env: env() });
      expect(r.status).toBe(2);
      expect(JSON.parse(r.stdout.trim().split('\n').pop())).toMatchObject({ decision: 'deny', rule: 'receipt' });
    } finally { allowWrites(state()); fs.rmSync(bareDir, { recursive: true, force: true }); }
  });
});


describe('receipts count per session', () => {
  let home;
  let repo;
  let tmp;
  const state = () => path.join(home, '.agent', 'tr-preflight');
  const pluginDir = () => path.join(home, '.agent', 'skills', 'total-recall', 'plugins', 'fx');
  const env = (extra = {}) => ({ ...process.env, HOME: home, AGENT_DIR: path.join(home, '.agent'), _TR_TEST_AGENT_DIR: '', TR_PREFLIGHT_MAX_AGE_MIN: '', TMPDIR: tmp, TR_META_HARNESS_RUN: '', ...extra });
  const gate = (call, extra) => {
    const r = spawnSync(process.execPath, [BIN, 'preflight', 'gate'], { cwd: repo, input: JSON.stringify({ cwd: repo, ...call }), encoding: 'utf8', env: env(extra) });
    return { code: r.status, answer: JSON.parse(r.stdout.trim().split('\n').pop()), err: r.stderr };
  };
  const WORK = { tool: 'write', path: 'a' };
  const ACK = 'total-recall tr-preflight --ack --task "spec" --action read';

  beforeAll(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-pf-sess-home-'));
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-pf-sess-tmp-'));
    repo = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-pf-sess-repo-'));
    for (const rel of SKILLS) { const f = path.join(repo, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, rel); }
    repo = findRoot(repo);
    acknowledge({ root: repo, task: 'spec', home, run: (a) => (a[0] === 'context' ? { ok: true, out: 'ready:true tokens:1 version:aa', err: '', code: 0 } : { ok: true, out: '', err: '', code: 0 }) });
    fs.mkdirSync(path.join(pluginDir(), 'ui'), { recursive: true });
    fs.writeFileSync(path.join(pluginDir(), 'plugin.json'), JSON.stringify({
      id: 'fx', name: 'Fixture', version: '1.0.0', description: 'A plugin that routes.',
      cli: { command: 'fx', handler: './cli.mjs', answers_help: true, subcommands: [{ name: 'route', description: 'Route.' }] },
      ui: { elements: [{ id: 'card', kind: 'card', tag: 'fx-card', module: 'ui/card.js' }] },
      gate: { router: { pattern: 'fx\\s+route', use: 'total-recall fx route "<task>"' } },
    }));
    fs.writeFileSync(path.join(pluginDir(), 'cli.mjs'), 'process.exit(0);');
    fs.writeFileSync(path.join(pluginDir(), 'ui', 'card.js'), '');
  });
  afterAll(() => {
    for (const d of [state(), tmp]) { try { fs.chmodSync(d, 0o700); } catch { /* gone */ } }
    for (const d of [home, repo, tmp]) fs.rmSync(d, { recursive: true, force: true });
  });

  it('denies a session that has not acknowledged, even with a fresh receipt from another agent', () => {
    const denied = gate({ ...WORK, session_id: 'never-acked' });
    expect(denied.code).toBe(2);
    expect(denied.answer).toMatchObject({ decision: 'deny', rule: 'receipt:session' });
    expect(denied.answer.reason).toContain('another agent');
    expect(denied.answer.fix).toContain('tr-preflight --ack');
  });
  it('lets the session pass once it has run the acknowledgement, and no other session', () => {
    expect(gate({ tool: 'shell', command: ACK, session_id: 'A' }).code).toBe(0);
    expect(gate({ ...WORK, session_id: 'A' }).code).toBe(0);
    expect(gate({ ...WORK, session_id: 'B' }).answer.rule).toBe('receipt:session');
  });
  it('always lets a session reach the commands that repair it', () => {
    for (const command of [ACK, 'total-recall tr-preflight --help', 'total-recall context "x"', 'total-recall recall "x"', 'cd . && total-recall tr-preflight --ack', 'total-recall tr-preflight --ack --task "a; b"']) {
      expect(gate({ tool: 'shell', command, session_id: `repair-${command.length}` }).code, command).toBe(0);
    }
    expect(gate({ tool: 'read', path: path.join(repo, '.agent/skills/total-recall/SKILL.md'), session_id: 'reader' }).code).toBe(0);
    expect(gate({ tool: 'meta', session_id: 'reader' }).code).toBe(0);
  });
  it('reads the session id each harness sends', () => {
    for (const key of ['session_id', 'sessionId', 'conversation_id', 'conversationId']) {
      expect(gate({ ...WORK, [key]: `via-${key}` }).answer.rule, key).toBe('receipt:session');
    }
  });
  it('keeps the repository rule when a harness sends no session id', () => {
    expect(gate(WORK).code).toBe(0);
    expect(gate({ ...WORK, session_id: '  ' }).code).toBe(0);
    expect(gate({ ...WORK, session_id: 42 }).code).toBe(0);
  });
  it('never stops a subagent the harness marks, or tells it to route', () => {
    const child = gate({ ...WORK, session_id: 'parent-unacked', agent_id: 'sub-1' });
    expect(child.code).toBe(0);
    expect(child.answer.warned).toBeUndefined();
  });
  it('never stops a run Metaharness started', () => {
    const run = gate({ ...WORK, session_id: 'dispatched-child' }, { TR_META_HARNESS_RUN: '1' });
    expect(run.code).toBe(0);
    expect(run.answer.warned).toBeUndefined();
  });
  it('counts a new session as delegated after an acknowledged session starts a subagent', () => {
    const fresh = () => gate({ ...WORK, session_id: `child-${Math.random()}` });
    expect(fresh().code).toBe(2);
    expect(gate({ tool: 'shell', command: ACK, session_id: 'parent' }).code).toBe(0);
    expect(gate({ tool: 'agent', session_id: 'parent' }).code).toBe(0);
    const child = fresh();
    expect(child.code).toBe(0);
    expect(child.answer.warned).toBeUndefined();
  });
  it('does not open that window for a session that never acknowledged', () => {
    for (const name of fs.readdirSync(state())) if (name.startsWith('delegated-')) fs.rmSync(path.join(state(), name));
    expect(gate({ tool: 'agent', session_id: 'unacked-parent' }).code).toBe(0);
    expect(gate({ ...WORK, session_id: 'unacked-child' }).code).toBe(2);
  });
  it('does not hold a session to a stamp nothing can record', () => {
    fs.chmodSync(state(), 0o500);
    fs.chmodSync(tmp, 0o500);
    try {
      expect(gate({ ...WORK, session_id: 'nowhere-to-write' }).code).toBe(0);
    } finally { fs.chmodSync(state(), 0o700); fs.chmodSync(tmp, 0o700); }
  });
  it('keeps the acknowledgement in the temp folder when the state folder refuses writes', () => {
    fs.chmodSync(state(), 0o500);
    try {
      expect(gate({ ...WORK, session_id: 'sandboxed' }).code).toBe(2);
      expect(gate({ tool: 'shell', command: ACK, session_id: 'sandboxed' }).code).toBe(0);
      expect(gate({ ...WORK, session_id: 'sandboxed' }).code).toBe(0);
    } finally { fs.chmodSync(state(), 0o700); }
  });
  it('asks again once the session has passed the receipt window', () => {
    const stamped = gate({ tool: 'shell', command: ACK, session_id: 'old-session' });
    expect(stamped.code).toBe(0);
    const expired = () => spawnSync(process.execPath, [BIN, 'preflight', 'gate'], { cwd: repo, input: JSON.stringify({ cwd: repo, ...WORK, session_id: 'old-session' }), encoding: 'utf8', env: env({ TR_PREFLIGHT_MAX_AGE_MIN: '60' }) });
    expect(expired().status).toBe(0);
    const stamp = fs.readdirSync(state()).filter((name) => name.startsWith('session-ack-')).map((name) => path.join(state(), name));
    for (const file of stamp) fs.writeFileSync(file, JSON.stringify({ at: Date.now() - 2 * 60 * 60 * 1000, root: repo }));
    expect(expired().status).toBe(2);
    const answer = JSON.parse(expired().stdout.trim().split('\n').pop());
    expect(answer.rule).toBe('receipt:session');
    expect(answer.reason).toContain('lapsed after 60 minutes');
  });
  it('tells a prompt hook the acknowledgement lapsed, not that it never happened', () => {
    expect(gate({ tool: 'shell', command: ACK, session_id: 'lapsed-prompt' }).code).toBe(0);
    for (const name of fs.readdirSync(state()).filter((entry) => entry.startsWith('session-ack-'))) fs.writeFileSync(path.join(state(), name), JSON.stringify({ at: Date.now() - 2 * 60 * 60 * 1000, root: repo }));
    const r = spawnSync(process.execPath, [BIN, 'preflight', 'remind', '--json'], { cwd: repo, input: JSON.stringify({ cwd: repo, session_id: 'lapsed-prompt' }), encoding: 'utf8', env: env() });
    const { reminder } = JSON.parse(r.stdout.trim().split('\n').pop());
    expect(reminder).toContain('lapsed after 30 minutes');
    expect(reminder).not.toContain('has not acknowledged');
    expect(reminder).toContain('on its own');
  });
  it('clears a stale receipt with punctuation in the task, and explains a wrapped command', () => {
    const file = path.join(state(), fs.readdirSync(state()).find((name) => /^[0-9a-f]{16}\.json$/.test(name)));
    const saved = fs.readFileSync(file, 'utf8');
    fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(saved), at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() }));
    try {
      const stale = gate({ ...WORK, session_id: 'punctuated' });
      expect(stale.answer.rule).toBe('receipt');
      expect(stale.answer.reason).toContain('120 minutes old');
      for (const command of ['total-recall context "finish it; verify & ship"', 'total-recall tr-preflight --ack --task "finish it; verify & ship"']) {
        expect(gate({ tool: 'shell', command, session_id: 'punctuated' }).code, command).toBe(0);
      }
      const piped = gate({ tool: 'shell', command: 'total-recall tr-preflight --ack --task "x" | tail -5', session_id: 'punctuated' });
      expect(piped.code).toBe(2);
      expect(piped.answer.reason).toContain('`|`');
    } finally { fs.writeFileSync(file, saved); }
  });
  it('tells a bare capsule command which session is running it', () => {
    const task = 'note this session';
    expect(gate({ tool: 'shell', command: `total-recall tr-preflight --ack --task "${task}"`, session_id: 'noted' }).code).toBe(0);
    expect(takeCaller(repo, 'ack', { task, home })).toBe('noted');
    expect(gate({ tool: 'shell', command: `total-recall context "${task}"`, session_id: 'noted' }).code).toBe(0);
    expect(takeCaller(repo, 'context', { task, home })).toBe('noted');
  });
  it('leaves no note for a cut command, a subagent or a harness with no session id', () => {
    const task = 'note nothing';
    expect(gate({ tool: 'shell', command: ACK, session_id: 'cut' }).code).toBe(0);
    expect(gate({ tool: 'shell', command: `total-recall context "${task}" | head -80`, session_id: 'cut' }).code).toBe(0);
    expect(gate({ tool: 'shell', command: `total-recall context "${task}"`, session_id: 'parent', agent_id: 'child' }).code).toBe(0);
    expect(gate({ tool: 'shell', command: `total-recall context "${task}"` }).code).toBe(0);
    expect(takeCaller(repo, 'context', { task, home })).toBeNull();
  });
  it('forgets the capsule when the session is compacted or cleared, and only then', () => {
    const hook = (input) => spawnSync(process.execPath, [BIN, 'preflight', 'session-start'], { cwd: repo, input, encoding: 'utf8', env: env() });
    const start = (source) => ({ code: hook(JSON.stringify({ session_id: 'compacted', source, cwd: repo })).status });
    const held = () => recordCapsuleDelivery(repo, 'compacted', { rulesHash: 'aa', skills: {} }, { home });
    held();
    for (const source of ['startup', 'resume']) { expect(start(source).code).toBe(0); expect(lastCapsuleDelivery(repo, 'compacted', { home })).not.toBeNull(); }
    for (const source of ['compact', 'clear']) { held(); expect(start(source).code).toBe(0); expect(lastCapsuleDelivery(repo, 'compacted', { home })).toBeNull(); }
    expect(hook('not json').status).toBe(0);
  });
  it('names the command once on stderr', () => {
    const denied = gate({ ...WORK, session_id: 'stderr-reader' });
    expect(denied.code).toBe(2);
    expect(denied.err.match(/tr-preflight --ack/g)).toHaveLength(1);
  });
  it('does not let one agent acknowledging void another session route', () => {
    expect(gate({ tool: 'shell', command: ACK, session_id: 'router-a' }).code).toBe(0);
    expect(spawnSync(process.execPath, [BIN, 'preflight', 'mode', 'enforce', '--router'], { cwd: repo, encoding: 'utf8', env: env() }).status).toBe(0);
    expect(gate({ ...WORK, session_id: 'router-a' }).answer.rule).toBe('route');
    expect(gate({ tool: 'shell', command: 'total-recall fx route "x"', session_id: 'router-a' }).code).toBe(0);
    expect(gate({ ...WORK, session_id: 'router-a' }).code).toBe(0);
    expect(gate({ tool: 'shell', command: ACK, session_id: 'router-b' }).code).toBe(0);
    expect(gate({ ...WORK, session_id: 'router-a' }).code).toBe(0);
    expect(gate({ ...WORK, session_id: 'router-b' }).answer.rule).toBe('route');
    expect(spawnSync(process.execPath, [BIN, 'preflight', 'mode', 'clear', '--router'], { cwd: repo, encoding: 'utf8', env: env() }).status).toBe(0);
  });
  it('warns about routing once per session', () => {
    expect(gate({ tool: 'shell', command: ACK, session_id: 'warn-a' }).code).toBe(0);
    expect(gate({ tool: 'shell', command: ACK, session_id: 'warn-b' }).code).toBe(0);
    expect(gate({ ...WORK, session_id: 'warn-a' }).answer.warned).toEqual(['route']);
    expect(gate({ ...WORK, session_id: 'warn-a' }).answer.warned).toBeUndefined();
    expect(gate({ ...WORK, session_id: 'warn-b' }).answer.warned).toEqual(['route']);
  });
  it('tells a prompt hook when only this session is missing, and never blocks', () => {
    const r = spawnSync(process.execPath, [BIN, 'preflight', 'remind', '--json'], { cwd: repo, input: JSON.stringify({ cwd: repo, session_id: 'prompt-only' }), encoding: 'utf8', env: env() });
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout.trim().split('\n').pop()).reminder).toContain('this session has not acknowledged');
  });
  it('records the tool name the harness sent', () => {
    gate({ tool_name: 'some_new_tool', session_id: 'namer' });
    const rows = fs.readFileSync(path.join(state(), 'decisions.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
    expect(rows.at(-1).native_tool).toBe('some_new_tool');
  });
  it('records a hash of the session, never the raw id', () => {
    gate({ tool: 'shell', command: ACK, session_id: 'raw-session-id-value' });
    const log = fs.readFileSync(path.join(state(), 'decisions.jsonl'), 'utf8');
    expect(log).not.toContain('raw-session-id-value');
    expect(log).toMatch(/"session":"[0-9a-f]{16}"/);
  });
});

describe('an agent is not bound to one repo', () => {
  let home;
  let tmp;
  let first;
  let other;
  let noSkills;
  const made = [];
  // Which brain a folder uses is the point here, and setting AGENT_DIR turns that lookup off.
  const env = (extra = {}) => ({ ...process.env, HOME: home, AGENT_DIR: '', _TR_TEST_AGENT_DIR: '', TR_PREFLIGHT_MAX_AGE_MIN: '', TMPDIR: tmp, TR_META_HARNESS_RUN: '', ...extra });
  const gate = (cwd, call, extra) => {
    const r = spawnSync(process.execPath, [BIN, 'preflight', 'gate'], { cwd, input: JSON.stringify({ cwd, ...call }), encoding: 'utf8', env: env(extra) });
    return { code: r.status, answer: JSON.parse(r.stdout.trim().split('\n').pop()), err: r.stderr };
  };
  const WORK = { tool: 'write', path: 'a' };
  const ACK = 'total-recall tr-preflight --ack --task "spec" --action read';
  const ready = (args) => (args[0] === 'context' ? { ok: true, out: 'ready:true tokens:1 version:aa rules_hash:bb', err: '', code: 0 } : { ok: true, out: '', err: '', code: 0 });
  const ackIn = (cwd, session) => {
    expect(gate(cwd, { tool: 'shell', command: ACK, session_id: session }).code).toBe(0);
    expect(acknowledge({ root: cwd, task: 'spec', home, session, run: ready }).ok).toBe(true);
  };
  const folder = (prefix) => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix)); made.push(dir); return dir; };
  const withSkills = (prefix = 'tr-pf-repo-') => {
    const dir = folder(prefix);
    for (const rel of SKILLS) { const f = path.join(dir, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, `${dir} ${rel}`); }
    return findRoot(dir);
  };
  const withoutSkills = () => { const dir = folder('tr-pf-bare-'); fs.writeFileSync(path.join(dir, '.git'), 'gitdir: elsewhere'); return findRoot(dir); };

  beforeAll(() => {
    home = folder('tr-pf-any-home-');
    tmp = folder('tr-pf-any-tmp-');
    for (const rel of SKILLS) { const f = path.join(home, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, `shared ${rel}`); }
    first = withSkills();
    other = withSkills();
    noSkills = withoutSkills();
    expect(acknowledge({ root: first, task: 'spec', home, run: ready }).ok).toBe(true);
  });
  afterAll(() => { for (const dir of made) fs.rmSync(dir, { recursive: true, force: true }); });

  it('keeps working in another repository after acknowledging in one', () => {
    ackIn(first, 'mover');
    for (const repo of [other, noSkills, first]) {
      const answer = gate(repo, { ...WORK, session_id: 'mover' });
      expect(answer.code, repo).toBe(0);
      expect(answer.answer.decision, repo).toBe('allow');
    }
  });
  it('still stops a session that has acknowledged nowhere', () => {
    const away = gate(other, { ...WORK, session_id: 'stranger' });
    expect(away.code).toBe(2);
    expect(away.answer.rule).toBe('receipt');
    expect(away.answer.reason).toContain('tr-preflight --ack');
    expect(gate(first, { ...WORK, session_id: 'stranger' }).answer.rule).toBe('receipt:session');
  });
  it('clears a repository with no skills of its own', () => {
    const stranded = withoutSkills();
    expect(gate(stranded, { ...WORK, session_id: 'stranded' }).answer.reason).toContain('no preflight receipt');
    ackIn(stranded, 'stranded');
    expect(gate(stranded, { ...WORK, session_id: 'stranded' }).code).toBe(0);
  });
  it('keeps the directory rule for a harness that sends no session id, and its ack clears it', () => {
    const repo = withSkills();
    expect(gate(repo, WORK).code).toBe(2);
    expect(acknowledge({ root: repo, task: 'spec', home, run: ready }).ok).toBe(true);
    expect(gate(repo, WORK).code).toBe(0);
  });
  it('never stops a subagent or a Metaharness run in another repository', () => {
    const child = gate(other, { ...WORK, session_id: 'unacked-parent', agent_id: 'sub' });
    expect(child.code).toBe(0);
    expect(child.answer.warned).toBeUndefined();
    const run = gate(other, { ...WORK, session_id: 'dispatched' }, { TR_META_HARNESS_RUN: '1' });
    expect(run.code).toBe(0);
    expect(run.answer.warned).toBeUndefined();
  });
  it('asks again once the acknowledgement lapses, and an ack anywhere clears it', () => {
    ackIn(first, 'lapsing');
    fs.writeFileSync(path.join(home, '.agent', 'tr-preflight', `session-ack-${sessionKey('lapsing')}.stamp`), JSON.stringify({ at: Date.now() - 2 * 60 * 60 * 1000, root: first }));
    const lapsed = gate(other, { ...WORK, session_id: 'lapsing' });
    expect(lapsed.code).toBe(2);
    expect(lapsed.answer.reason).toContain('lapsed');
    ackIn(withSkills(), 'lapsing');
    expect(gate(other, { ...WORK, session_id: 'lapsing' }).code).toBe(0);
  });
  it('answers check and the prompt hook for the agent, not the folder it moved into', () => {
    ackIn(first, 'asker');
    const check = () => spawnSync(process.execPath, [BIN, 'tr-preflight', '--check', '--json'], { cwd: other, encoding: 'utf8', env: env() });
    expect(gate(other, { tool: 'shell', command: 'total-recall tr-preflight --check', session_id: 'asker' }).code).toBe(0);
    expect(check().status).toBe(0);
    expect(check().status).toBe(1);
    const prompt = spawnSync(process.execPath, [BIN, 'preflight', 'remind', '--json'], { cwd: other, input: JSON.stringify({ cwd: other, session_id: 'asker' }), encoding: 'utf8', env: env() });
    expect(JSON.parse(prompt.stdout.trim().split('\n').pop()).reminder).toBeNull();
  });
  describe('telling a session about a brain it has not received', () => {
    const nestedIn = (parent) => {
      const child = path.join(parent, 'nested');
      fs.mkdirSync(child);
      fs.writeFileSync(path.join(child, '.git'), 'gitdir: elsewhere');
      return child;
    };
    it('names the brain a folder borrows from a parent, once for that brain', () => {
      const parent = withSkills();
      const child = nestedIn(parent);
      ackIn(first, 'borrower');
      const told = gate(child, { ...WORK, session_id: 'borrower' });
      expect(told.code).toBe(0);
      expect(told.answer.warned).toEqual(['arrival']);
      expect(told.answer.warning).toContain(`cd ${parent} && total-recall context`);
      expect(gate(child, { ...WORK, session_id: 'borrower' }).answer.warned).toBeUndefined();
      expect(gate(parent, { ...WORK, session_id: 'borrower' }).answer.warned).toBeUndefined();
    });
    it('says nothing when a nested folder uses the brain the session acknowledged under', () => {
      const parent = withSkills();
      ackIn(parent, 'same-brain');
      expect(gate(nestedIn(parent), { ...WORK, session_id: 'same-brain' }).answer.warned).toBeUndefined();
    });
    it('says nothing about a brain that is switched off, because no capsule draws from it', () => {
      const off = withSkills();
      const brainDir = path.join(off, '.agent', 'skills', 'total-recall');
      const globalBrainDir = path.join(home, '.agent', 'skills', 'total-recall');
      ackIn(first, 'switched');
      setBrainEnabled(brainDir, false, { globalBrainDir });
      expect(gate(off, { ...WORK, session_id: 'switched' }).answer.warned).toBeUndefined();
      setBrainEnabled(brainDir, true, { globalBrainDir });
      expect(gate(off, { ...WORK, session_id: 'switched' }).answer.warned).toEqual(['arrival']);
    });
    it("counts a capsule fetched from a nested folder as that brain's", () => {
      const parent = withSkills();
      const child = nestedIn(parent);
      ackIn(first, 'fetched');
      vi.stubEnv('_TR_TEST_AGENT_DIR', '');
      try { recordCapsuleDelivery(child, 'fetched', { rulesHash: 'a', skills: {} }, { home }); } finally { vi.unstubAllEnvs(); }
      expect(gate(parent, { ...WORK, session_id: 'fetched' }).answer.warned).toBeUndefined();
    });
    it('tells it once, and how to get them', () => {
      ackIn(first, 'visitor');
      const told = gate(other, { ...WORK, session_id: 'visitor' });
      expect(told.code).toBe(0);
      expect(told.answer.warned).toEqual(['arrival']);
      expect(told.answer.warning).toContain(other);
      expect(told.answer.warning).toContain(`cd ${other} && total-recall context`);
      expect(gate(other, { ...WORK, session_id: 'visitor' }).answer.warned).toBeUndefined();
    });
    it('notices a file in another repository, and a command that changes into one', () => {
      ackIn(first, 'by-path');
      expect(gate(first, { tool: 'write', path: path.join(other, 'x.mjs'), session_id: 'by-path' }).answer.warned).toEqual(['arrival']);
      ackIn(first, 'by-cd');
      expect(gate(first, { tool: 'shell', command: `cd ${other} && ls`, session_id: 'by-cd' }).answer.warned).toEqual(['arrival']);
    });
    it('says nothing where there is nothing to tell', () => {
      ackIn(first, 'quiet');
      expect(gate(first, { ...WORK, session_id: 'quiet' }).answer.warned).toBeUndefined();
      expect(gate(noSkills, { ...WORK, session_id: 'quiet' }).answer.warned).toBeUndefined();
      expect(gate(first, { tool: 'write', path: path.join(home, '.agent', 'skills', 'total-recall', 'x'), session_id: 'quiet' }).answer.warned).toBeUndefined();
      recordCapsuleDelivery(other, 'quiet', { rulesHash: 'a', skills: {} }, { home });
      expect(gate(other, { ...WORK, session_id: 'quiet' }).answer.warned).toBeUndefined();
    });
    it('leaves a subagent out of it, without using up the note', () => {
      ackIn(first, 'parent');
      expect(gate(other, { ...WORK, session_id: 'parent', agent_id: 'kid' }).answer.warned).toBeUndefined();
      expect(gate(other, { ...WORK, session_id: 'parent' }).answer.warned).toEqual(['arrival']);
    });
    it('tells it again after compaction, which lost what it was told', () => {
      ackIn(first, 'compacted');
      expect(gate(other, { ...WORK, session_id: 'compacted' }).answer.warned).toEqual(['arrival']);
      spawnSync(process.execPath, [BIN, 'preflight', 'session-start'], { cwd: other, input: JSON.stringify({ session_id: 'compacted', source: 'compact', cwd: other }), encoding: 'utf8', env: env() });
      expect(gate(other, { ...WORK, session_id: 'compacted' }).answer.warned).toEqual(['arrival']);
    });
  });
  it('keeps what repairs the gate open when the gate itself fails', () => {
    // A number for cwd throws inside the gate, the same way a bad edit to its code would.
    const crash = { cwd: 42, session_id: 'crashed' };
    const packageRoot = path.resolve(path.dirname(BIN), '..');
    const read = gate(other, { ...crash, tool: 'read', path: '/x/y' });
    expect(read.code).toBe(0);
    expect(read.answer.rule).toBe('gate-error:repair');
    expect(read.answer.warning).toContain('gate failed');
    expect(gate(other, { ...crash, tool: 'write', path: path.join(packageRoot, 'src', 'x.mjs') }).code).toBe(0);
    expect(gate(other, { ...crash, tool: 'shell', command: 'total-recall update' }).code).toBe(0);
    expect(gate(packageRoot, { ...crash, tool: 'shell', command: 'npm test' }).code).toBe(0);
    const write = gate(other, { ...crash, tool: 'write', path: path.join(other, 'x') });
    expect(write.code).toBe(2);
    expect(write.answer.rule).toBe('gate-error');
    expect(write.answer.reason).toContain('fails closed');
    expect(gate(other, { ...crash, tool: 'shell', command: 'npm test' }).code).toBe(2);
  });
});

describe('preflight coverage', () => {
  let dir;
  const write = (name, manifest, readme) => {
    fs.mkdirSync(path.join(dir, name), { recursive: true });
    fs.writeFileSync(path.join(dir, name, 'plugin.json'), typeof manifest === 'string' ? manifest : JSON.stringify(manifest));
    if (readme) fs.writeFileSync(path.join(dir, name, 'README.md'), readme);
  };
  const DOC = '# X\n\n## Using this from an agent\n\nSend work here.\n';
  const covered = () => spawnSync(process.execPath, [BIN, 'preflight', 'coverage', '--dir', dir, '--json'], { encoding: 'utf8', env: { ...process.env, TR_PREFLIGHT_MAX_AGE_MIN: '' } });

  beforeAll(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-pf-coverage-')); });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('reports nothing found as a failure, never as full coverage', () => {
    const r = covered();
    expect(r.status).toBe(1);
    expect(JSON.parse(r.stdout)).toMatchObject({ ok: false, declared: 0 });
  });
  it('accepts a plugin that reviewed itself and owns no raw command', () => {
    write('complete', { id: 'complete', gate: { tasks: ['Do a thing'], owned_commands: [] } }, DOC);
    write('owner', { id: 'owner', gate: { tasks: ['Do another'], owned_commands: [{ pattern: 'x', use: 'total-recall owner go' }] } }, DOC);
    const r = covered();
    expect(r.status).toBe(0);
    const report = JSON.parse(r.stdout);
    expect(report).toMatchObject({ ok: true, declared: 2, missing: 0 });
    expect(report.plugins.find((row) => row.plugin === 'owner').owned).toBe(1);
  });
  it('names what each plugin is missing and exits 1', () => {
    write('no-gate', { id: 'no-gate' }, DOC);
    write('empty-tasks', { id: 'empty-tasks', gate: { tasks: [], owned_commands: [] } }, DOC);
    write('blank-tasks', { id: 'blank-tasks', gate: { tasks: ['  '], owned_commands: [] } }, DOC);
    write('no-docs', { id: 'no-docs', gate: { tasks: ['Do it'], owned_commands: [] } }, '# Nothing about agents\n');
    write('no-readme', { id: 'no-readme', gate: { tasks: ['Do it'], owned_commands: [] } });
    const r = covered();
    expect(r.status).toBe(1);
    const missing = Object.fromEntries(JSON.parse(r.stdout).plugins.map((row) => [row.plugin, row.missing]));
    expect(missing['no-gate']).toEqual(['tasks', 'owned commands']);
    expect(missing['empty-tasks']).toEqual(['tasks']);
    expect(missing['blank-tasks']).toEqual(['tasks']);
    expect(missing['no-docs']).toEqual(['docs']);
    expect(missing['no-readme']).toEqual(['docs']);
    expect(missing.complete).toEqual([]);
  });
  it('skips a folder with no readable manifest', () => {
    write('broken', '{ not json');
    fs.mkdirSync(path.join(dir, 'empty-folder'), { recursive: true });
    expect(JSON.parse(covered().stdout).plugins.map((row) => row.plugin)).not.toContain('broken');
  });
});
