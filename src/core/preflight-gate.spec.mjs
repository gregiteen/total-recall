import { describe, it, expect } from 'vitest';
import { decide, isRepoSweep, isSatisfyingCommand, SWEEP_CONSULT_MS, TOOL_CLASSES } from './preflight-gate.mjs';

describe('compact in the gate', () => {
  it('is open when plain and closed when chained or piped', () => {
    expect(isSatisfyingCommand('total-recall compact "task" --budget 2000')).toBe(true);
    expect(isSatisfyingCommand('total-recall compact "task" | head')).toBe(false);
    expect(isSatisfyingCommand('total-recall compact "task" ; rm -rf x')).toBe(false);
  });
});

const noReceipt = { check: () => ({ ok: false, problems: ['no preflight receipt for this repository'] }) };
const fresh = (extra = {}) => ({ check: () => ({ ok: true, problems: [] }), ...extra });

describe('decide: without a receipt', () => {
  it('denies every working tool class with the exact fix', () => {
    for (const tool of TOOL_CLASSES.filter((t) => !['meta', 'ui', 'read', 'shell'].includes(t))) {
      const answer = decide({ tool, cwd: '/repo' }, noReceipt);
      expect(answer, tool).toMatchObject({ decision: 'deny', rule: 'receipt' });
      expect(answer.fix).toBe('total-recall tr-preflight --ack --task "<task>" --action read,edit,test');
      expect(answer.reason).toContain('/repo');
    }
  });
  it('treats an unknown tool class as other, which is denied', () => {
    expect(decide({ tool: 'quantum' }, noReceipt).decision).toBe('deny');
    expect(decide(undefined, noReceipt).decision).toBe('deny');
  });
  it('keeps discover and display tools open', () => {
    expect(decide({ tool: 'meta' }, noReceipt).decision).toBe('allow');
    expect(decide({ tool: 'ui' }, noReceipt).decision).toBe('allow');
  });
  it('reads skill files but nothing else', () => {
    expect(decide({ tool: 'read', path: '/a/.agent/skills/ssss/SKILL.md' }, noReceipt).decision).toBe('allow');
    expect(decide({ tool: 'read', path: '/a/.claude/skills/plugin/SKILL.md' }, noReceipt).decision).toBe('allow');
    expect(decide({ tool: 'read', path: '/etc/hosts' }, noReceipt).decision).toBe('deny');
    expect(decide({ tool: 'read', path: '/a/b/skills/x.md' }, noReceipt).decision).toBe('deny');
  });
  it('opens persisted command output only for the paths an adapter names (audit F-019)', () => {
    const persisted = { ...noReceipt, readablePaths: [/\/\.claude\/projects\/[^/]+\/[^/]+\/tool-results\/[^/]+$/] };
    expect(decide({ tool: 'read', path: '/u/.claude/projects/p/s/tool-results/abc.txt' }, persisted).decision).toBe('allow');
    expect(decide({ tool: 'read', path: '/u/.claude/projects/p/s/other/abc.txt' }, persisted).decision).toBe('deny');
    expect(decide({ tool: 'read', path: '/u/.claude/projects/p/s/tool-results/abc.txt' }, noReceipt).decision).toBe('deny');
  });
});

describe('decide: the commands that satisfy the gate', () => {
  const open = [
    'total-recall tr-preflight --ack --task "x y" --action read,edit,test',
    'total-recall tr-preflight --check',
    'total-recall preflight check --json',
    'total-recall preflight install',
    'total-recall rules verify',
    'total-recall rules audit --json',
    'total-recall rules --help',
    'total-recall context "EN-02 gate" --action read,edit,test',
    'total-recall recall "preflight" --local',
    'total-recall help "find the owner"',
    'total-recall --help',
    'cd /Users/me/repo && total-recall tr-preflight --check',
    'npx total-recall context "task"',
    'node /opt/tr/bin/total-recall.mjs context "task"',
  ];
  it.each(open)('allows %s', (command) => {
    expect(isSatisfyingCommand(command)).toBe(true);
    expect(decide({ tool: 'shell', command }, noReceipt)).toMatchObject({ decision: 'allow', rule: 'shell:satisfying-command' });
  });

  const bypass = [
    'total-recall tr-preflight --check; rm -rf x',
    'total-recall tr-preflight --check && rm -rf x',
    'total-recall context "t" | head -80',
    'total-recall context "t" 2>&1',
    'total-recall context "t" > /tmp/out',
    'total-recall recall $(rm -rf x)',
    'total-recall recall `rm -rf x`',
    'total-recall tr-preflight --check\nrm -rf x',
    'cd /tmp && rm -rf x && total-recall help',
    'echo total-recall context',
    'total-recall remember invariant "x"',
    'total-recall plugin list',
    'total-recall rules verify; rm -rf x',
    'total-recall rules audit | head',
    'rm -rf x',
    'curl http://example.test',
  ];
  it.each(bypass)('denies %j', (command) => {
    expect(isSatisfyingCommand(command)).toBe(false);
    expect(decide({ tool: 'shell', command }, noReceipt).decision).toBe('deny');
  });
});

describe('decide: with a fresh receipt', () => {
  it('allows ordinary work', () => {
    for (const tool of ['write', 'web', 'mcp', 'agent', 'search', 'other']) expect(decide({ tool }, fresh()).decision).toBe('allow');
    expect(decide({ tool: 'shell', command: 'npm test' }, fresh()).decision).toBe('allow');
  });
  it('still blocks a repository sweep without a recent consult, and opens it after one', () => {
    const sweep = { tool: 'shell', command: 'rg -n "preflight" src' };
    expect(decide(sweep, fresh({ recentConsult: () => false }))).toMatchObject({ decision: 'deny', rule: 'sweep' });
    expect(decide(sweep, fresh({ recentConsult: () => true })).decision).toBe('allow');
    expect(decide(sweep, fresh()).decision).toBe('deny');
  });
  it('uses a 15 minute consult window', () => expect(SWEEP_CONSULT_MS).toBe(15 * 60 * 1000));
});

describe('isRepoSweep', () => {
  const sweeps = ['rg foo', 'ripgrep foo src', 'grep -rn foo .', 'grep -R foo src', 'grep --recursive foo .', 'find . -name "*.mjs"', 'find /Users/me -name x', 'git grep foo', 'ag foo'];
  it.each(sweeps)('flags %s', (c) => expect(isRepoSweep(c)).toBe(true));
  const notSweeps = ['ls -la', 'npm test', 'git status', 'grep foo file.txt', 'total-recall plugin library --json | grep foo', 'cat package.json | rg version',
    'rg foo node_modules/x', 'rg foo .agent/skills', 'find /tmp/x -name y', 'git log -S foo', 'echo org chart', 'total-recall help "x" && rg foo'];
  it.each(notSweeps)('does not flag %s', (c) => expect(isRepoSweep(c)).toBe(false));
});

describe('decide: fails closed', () => {
  it('denies when the receipt check throws', () => {
    const answer = decide({ tool: 'write', cwd: '/r' }, { check: () => { throw new Error('disk on fire'); } });
    expect(answer).toMatchObject({ decision: 'deny', rule: 'gate-error' });
    expect(answer.reason).toContain('disk on fire');
    expect(answer.fix).toContain('--ack');
  });
  it('denies when the sweep consult check throws', () => {
    const answer = decide({ tool: 'shell', command: 'rg foo src' }, fresh({ recentConsult: () => { throw new Error('boom'); } }));
    expect(answer.decision).toBe('deny');
  });
});
