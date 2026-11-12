import { describe, it, expect } from 'vitest';
import { ackDirectory, capsuleVerb, decide, findOwnedCommand, GATE_PACKAGE, gatePackageBroken, isAckCommand, isCheckCommand, isPlainTotalRecall, isRepoSweep, isRouteCommand, isSatisfyingCommand, SWEEP_CONSULT_MS, TOOL_CLASSES, whenGateFails } from './preflight-gate.mjs';

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

describe('decide: text the shell keeps literal is not a command being run', () => {
  const literal = [
    'total-recall tr-preflight --ack --task "finish the plugin; verify with real runs" --action read,edit,test',
    "total-recall context 'fix auth & session | gate' --action read,edit,test",
    'total-recall recall "a|b" --local',
    'total-recall context "version > 3.4 and < 4" --action read',
    'total-recall context "costs $5 from $HOME" --action read',
    'total-recall context "fix ${foo} interpolation"',
    "total-recall context 'two\nlines'",
    'total-recall context "two\nlines"',
    'total-recall context "it\'s; fine"',
    'total-recall context "say \\"hi\\"; then stop"',
    "total-recall context 'literal $(not run) and `not run`'",
    'total-recall context "literal \\$(not run) and \\`not run\\`"',
    'cd "/a path/repo" && total-recall context "x; y"',
  ];
  it.each(literal)('exempts %j', (command) => {
    expect(isSatisfyingCommand(command)).toBe(true);
    expect(decide({ tool: 'shell', command }, noReceipt)).toMatchObject({ decision: 'allow', rule: 'shell:satisfying-command' });
  });

  const live = [
    'total-recall context "$(rm -rf x)"',
    'total-recall context "`rm -rf x`"',
    'total-recall context "${x:-$(rm -rf y)}"',
    'total-recall context "${x@P}"',
    'total-recall context "\\\\$(rm -rf x)"',
    'total-recall tr-preflight --ack \\" ; rm -rf x ; " "',
    "total-recall context 'a' ; rm -rf x ; echo 'b'",
    'total-recall context "a"; rm -rf x; echo "b"',
    'total-recall context "unterminated; rm -rf x',
    "total-recall context 'unterminated; rm -rf x",
    'cd $(rm${IFS}-rf${IFS}x) && total-recall recall y',
    'node $(rm${IFS}-rf${IFS}x)bin/total-recall.mjs recall y',
    'total-recall rules\nrm -rf x',
    'total-recall recall =(rm -rf x)',
    'total-recall\nrm -rf x',
    'cd\nrm -rf x && total-recall help',
    'total-recall recall x <<EOF\n$(rm -rf y)\nEOF',
    "total-recall context 'a <<EOF' ; rm -rf y ; echo '\nEOF\n'",
  ];
  it.each(live)('denies %j', (command) => {
    expect(isSatisfyingCommand(command)).toBe(false);
    expect(decide({ tool: 'shell', command }, noReceipt).decision).toBe('deny');
  });
});

describe('isAckCommand', () => {
  it('accepts an acknowledgement whatever its quoted task says', () => {
    expect(isAckCommand('total-recall tr-preflight --ack --task "a; b"')).toBe(true);
    expect(isAckCommand('cd /r && total-recall preflight ack --task "x"')).toBe(true);
  });
  it('refuses one that would run something else, so it cannot skip the session check', () => {
    expect(isAckCommand('total-recall tr-preflight --ack --task "$(rm -rf x)"')).toBe(false);
    expect(isAckCommand('total-recall tr-preflight --ack --task "`rm -rf x`"')).toBe(false);
    expect(isAckCommand('total-recall tr-preflight --ack \\" ; rm -rf x ; " "')).toBe(false);
    expect(isAckCommand('total-recall tr-preflight --ack --task "x" | tail -5')).toBe(false);
  });
  it('does not take a task that merely mentions the acknowledgement', () => {
    expect(isAckCommand('total-recall recall "tr-preflight --ack"')).toBe(false);
  });
});

describe('ackDirectory', () => {
  it('reads a quoted folder, or the session acknowledges the wrong repository', () => {
    expect(ackDirectory('cd "/a/b" && total-recall tr-preflight --ack', '/cwd')).toBe('/a/b');
    expect(ackDirectory("cd '/a b/c' && total-recall tr-preflight --ack", '/cwd')).toBe('/a b/c');
    expect(ackDirectory('cd /a/b && total-recall tr-preflight --ack', '/cwd')).toBe('/a/b');
    expect(ackDirectory('total-recall tr-preflight --ack', '/cwd')).toBe('/cwd');
  });
});

describe('decide: a denial says what happened and what to run', () => {
  const ACK = 'total-recall tr-preflight --ack --task "<task>" --action read,edit,test';
  const stale = { check: () => ({ ok: false, problems: ['preflight receipt is stale; re-run --ack'], ageMs: 41 * 60000, limitMs: 30 * 60000 }) };

  it('carries the command in the reason, because adapters drop the fix field when a reason exists', () => {
    for (const deps of [stale, noReceipt, fresh({ sessionAcknowledged: () => false })]) {
      expect(decide({ tool: 'write', path: 'a', cwd: '/r' }, deps).reason).toContain(ACK);
    }
  });
  it('states the age and the window of a stale receipt', () => {
    const { reason } = decide({ tool: 'write', path: 'a', cwd: '/r' }, stale);
    expect(reason).toContain('41 minutes old');
    expect(reason).toContain('lasts 30');
  });
  it('gives no age when age was not the problem', () => {
    const changed = { check: () => ({ ok: false, problems: ['a skill changed since the receipt'], ageMs: 60000, limitMs: 30 * 60000 }) };
    expect(decide({ tool: 'write', path: 'a' }, changed).reason).not.toContain('minutes old');
  });
  it.each([
    ['total-recall tr-preflight --ack --task "x" | tail -5', 'tr-preflight', '`|`'],
    ['total-recall tr-preflight --ack --task "x" 2>&1 | tail -5', 'tr-preflight', '`>`'],
    ['total-recall tr-preflight --ack --task "x"; echo "rc=$?"', 'tr-preflight', '`;`'],
    ['cd /r && total-recall context "x" | head -40', 'context', '`|`'],
    ['total-recall recall "x" && npm test', 'recall', '`&&`'],
    ['total-recall rules verify\nrm x', 'rules', 'a line break'],
    ['total-recall context "$(cat task)"', 'context', '`$(`'],
    ['git status; total-recall context "x"', 'context', '`;`'],
  ])('names what was added to %j', (command, verb, construct) => {
    const { reason } = decide({ tool: 'shell', command, cwd: '/r' }, stale);
    expect(reason).toContain(`\`${verb}\``);
    expect(reason).toContain(construct);
    expect(reason).toContain(ACK);
  });
  it('tells an agent how to keep a substitution literal', () => {
    expect(decide({ tool: 'shell', command: 'total-recall context "$(x)"' }, stale).reason).toContain('Single quotes');
  });
  it('does not blame ordinary work for being wrapped', () => {
    const { reason } = decide({ tool: 'shell', command: 'npm test | tail -5', cwd: '/r' }, stale);
    expect(reason).not.toContain('was refused because');
    expect(reason).toContain(ACK);
  });
  it('says a session lapsed, rather than that it never acknowledged', () => {
    const answer = decide({ tool: 'write', path: 'a', cwd: '/r' }, {
      check: () => ({ ok: true, problems: [], limitMs: 30 * 60000 }),
      sessionAcknowledged: () => false,
      sessionLapsed: () => true,
    });
    expect(answer).toMatchObject({ decision: 'deny', rule: 'receipt:session' });
    expect(answer.reason).toContain('lapsed after 30 minutes');
    expect(answer.reason).not.toContain('has not acknowledged');
  });
  it('keeps saying so when a session never acknowledged', () => {
    const answer = decide({ tool: 'write', path: 'a' }, fresh({ sessionAcknowledged: () => false, sessionLapsed: () => false }));
    expect(answer.reason).toContain('has not acknowledged');
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
    expect(answer.fix).toContain('repair the gate');
  });
  it('denies when the sweep consult check throws', () => {
    const answer = decide({ tool: 'shell', command: 'rg foo src', cwd: '/r' }, fresh({ recentConsult: () => { throw new Error('boom'); } }));
    expect(answer.decision).toBe('deny');
  });
});

describe('decide: commands a plugin owns', () => {
  const owned = [
    { plugin: 'git-sentinel', pattern: 'git(\\s+-C\\s+\\S+)?\\s+status\\b', use: 'total-recall git-sentinel audit' },
    { plugin: 'mesh', pattern: 'ssh\\s', use: 'total-recall mesh exec <node> "<command>"' },
  ];
  const deps = fresh({ ownedCommands: () => owned, recentConsult: () => true, mode: () => 'enforce' });

  it('in enforce, denies the raw command and names the owner\'s command', () => {
    const answer = decide({ tool: 'shell', command: 'git status -sb' }, deps);
    expect(answer).toMatchObject({ decision: 'deny', rule: 'owned:git-sentinel', fix: 'total-recall git-sentinel audit' });
  });
  it('catches it after a separator, in a loop and with -C', () => {
    for (const command of ['cd x && git status', 'ls; git status', 'for r in a b; do git -C $r status; done', 'ssh root@host uptime']) {
      expect(decide({ tool: 'shell', command }, deps).decision, command).toBe('deny');
    }
  });
  it('ignores text that is not being run', () => {
    for (const command of [
      "total-recall mesh exec 100.64.0.10 'git status'",
      'git commit -m "explain git status; ssh usage"',
      "cat <<'EOF'\ngit status\nEOF",
      'echo git status',
      'git log -1',
    ]) {
      expect(decide({ tool: 'shell', command }, deps).decision, command).toBe('allow');
    }
  });
  it('applies only to shell calls', () => {
    expect(decide({ tool: 'write', path: 'git status' }, deps).decision).toBe('allow');
  });
  it('skips a declaration that does not compile', () => {
    expect(findOwnedCommand('git status', [{ plugin: 'bad', pattern: '(', use: 'x' }])).toBeNull();
  });
});

describe('decide: every task goes through the declared router', () => {
  const router = { plugin: 'meta-harness', pattern: 'meta-harness\\s+(route|coordinate)', use: 'total-recall meta-harness route "<task>" --json' };
  const base = { router: () => router, recentConsult: () => true, mode: () => 'enforce' };
  const unrouted = fresh({ ...base, routed: () => false });
  const routed = fresh({ ...base, routed: () => true });

  it('in enforce, denies working tools until the task is routed, and names the command', () => {
    for (const call of [{ tool: 'write', path: 'a' }, { tool: 'shell', command: 'npm test' }, { tool: 'mcp' }]) {
      expect(decide(call, unrouted), call.tool).toMatchObject({ decision: 'deny', rule: 'route', fix: router.use });
      expect(decide(call, routed).decision, call.tool).toBe('allow');
    }
  });
  it('keeps reading, searching and Total Recall commands open, so routing can run', () => {
    for (const call of [{ tool: 'read', path: 'a' }, { tool: 'search' }, { tool: 'web' }, { tool: 'shell', command: 'total-recall meta-harness route "x; y" --json' }]) {
      expect(decide(call, unrouted).decision, JSON.stringify(call)).toBe('allow');
    }
  });
  it('does not treat a chained command as a Total Recall command', () => {
    expect(isPlainTotalRecall('total-recall status; npm test')).toBe(false);
    expect(isPlainTotalRecall('total-recall status | head')).toBe(false);
    expect(decide({ tool: 'shell', command: 'total-recall status && npm test' }, unrouted).decision).toBe('deny');
  });
  it('always allows native subagents, routed or not', () => {
    expect(decide({ tool: 'agent' }, unrouted).decision).toBe('allow');
    expect(decide({ tool: 'agent' }, routed).decision).toBe('allow');
  });
  it('lets a process the router started work', () => {
    const inner = fresh({ ...base, routed: () => false, dispatched: true });
    expect(decide({ tool: 'write', path: 'a' }, inner).decision).toBe('allow');
  });
  it('applies nothing when no plugin declares a router', () => {
    expect(decide({ tool: 'write', path: 'a' }, fresh({ router: () => null })).decision).toBe('allow');
  });
  it('recognises only plain route commands', () => {
    expect(isRouteCommand('total-recall meta-harness route "x" --json', router)).toBe(true);
    expect(isRouteCommand('node bin/total-recall.mjs meta-harness coordinate "x"', router)).toBe(true);
    expect(isRouteCommand('total-recall meta-harness status', router)).toBe(false);
    expect(isRouteCommand('total-recall recall "meta-harness route"', router)).toBe(false);
    expect(isRouteCommand('total-recall meta-harness route "x"; rm a', router)).toBe(false);
  });
});

describe('decide: modes for the rules that steer work toward a plugin', () => {
  const owned = [{ plugin: 'git-sentinel', pattern: 'git\\s+status\\b', use: 'total-recall git-sentinel audit' }];
  const router = { plugin: 'meta-harness', pattern: 'meta-harness\\s+route', use: 'total-recall meta-harness route "<task>" --json' };
  const raw = { tool: 'shell', command: 'git status' };
  const base = { ownedCommands: () => owned, recentConsult: () => true };

  it('warns by default: the raw command runs and the note names the plugin command', () => {
    const answer = decide(raw, fresh(base));
    expect(answer).toMatchObject({ decision: 'allow', rule: 'warn:owned:git-sentinel', warned: ['owned:git-sentinel'] });
    expect(answer.warning).toContain('total-recall git-sentinel audit');
  });
  it('states facts, because harnesses treat commands from a hook as possible injection', () => {
    const answer = decide({ ...raw }, fresh({ ...base, router: () => router, routed: () => false }));
    expect(answer.warning).not.toMatch(/\b(run|must|do not)\b/i);
  });
  it('does nothing in off', () => {
    const answer = decide(raw, fresh({ ...base, router: () => router, routed: () => false, mode: () => 'off' }));
    expect(answer).toEqual({ decision: 'allow', rule: 'receipt:fresh' });
  });
  it('blocks in enforce only while the owner runs', () => {
    expect(decide(raw, fresh({ ...base, mode: () => 'enforce', ownerHealthy: () => true })).decision).toBe('deny');
    const broken = decide(raw, fresh({ ...base, mode: () => 'enforce', ownerHealthy: () => false }));
    expect(broken.decision).toBe('allow');
    expect(broken.warning).toContain('failed its health check');
  });
  it('asks about the owner only when a call would be denied', () => {
    const asked = [];
    const ownerHealthy = (plugin) => { asked.push(plugin); return true; };
    decide({ tool: 'shell', command: 'ls' }, fresh({ ...base, mode: () => 'enforce', ownerHealthy }));
    decide(raw, fresh({ ...base, mode: () => 'warn', ownerHealthy }));
    expect(asked).toEqual([]);
  });
  it('warns about routing once per receipt, not on every call', () => {
    const first = decide({ tool: 'write', path: 'a' }, fresh({ router: () => router, routed: () => false, routeWarned: () => false }));
    expect(first).toMatchObject({ decision: 'allow', warned: ['route'] });
    expect(first.warning).toContain(router.use);
    expect(decide({ tool: 'write', path: 'a' }, fresh({ router: () => router, routed: () => false, routeWarned: () => true }))).toEqual({ decision: 'allow', rule: 'receipt:fresh' });
  });
  it('carries both notes when both rules apply', () => {
    const answer = decide(raw, fresh({ ...base, router: () => router, routed: () => false }));
    expect(answer.warned).toEqual(['route', 'owned:git-sentinel']);
    expect(answer.warning).toContain(router.use);
    expect(answer.warning).toContain('total-recall git-sentinel audit');
  });
  it('asks for the mode by rule and plugin', () => {
    const asked = [];
    decide(raw, fresh({ ...base, router: () => router, routed: () => false, mode: (kind, plugin) => { asked.push([kind, plugin]); return 'off'; } }));
    expect(asked).toEqual([['router', 'meta-harness'], ['owned', 'git-sentinel']]);
  });
  it('never turns off the receipt, in any mode', () => {
    const noReceipt = { check: () => ({ ok: false, problems: ['no receipt'] }), mode: () => 'off' };
    expect(decide({ tool: 'write', path: 'a' }, noReceipt)).toMatchObject({ decision: 'deny', rule: 'receipt' });
  });
  it('never gates native subagents, in any mode', () => {
    for (const mode of ['off', 'warn', 'enforce']) {
      expect(decide({ tool: 'agent' }, fresh({ router: () => router, routed: () => false, mode: () => mode, ownerHealthy: () => true }))).toEqual({ decision: 'allow', rule: 'receipt:fresh' });
    }
  });
});

describe('capsuleVerb', () => {
  it('names the commands that hand over a capsule when they run alone', () => {
    expect(capsuleVerb('total-recall tr-preflight --ack --task "a; b"')).toBe('ack');
    expect(capsuleVerb('cd /r && total-recall preflight ack --task "x"')).toBe('ack');
    expect(capsuleVerb('total-recall context "a; b" --action read')).toBe('context');
    expect(capsuleVerb('npx total-recall context "x"')).toBe('context');
    expect(capsuleVerb('node bin/total-recall.mjs context "x"')).toBe('context');
  });
  it('refuses one whose output could be cut, and every other command', () => {
    expect(capsuleVerb('total-recall context "x" | head -80')).toBeNull();
    expect(capsuleVerb('total-recall tr-preflight --ack --task "x" > /dev/null')).toBeNull();
    expect(capsuleVerb('total-recall context "x"; echo done')).toBeNull();
    expect(capsuleVerb('total-recall recall "context"')).toBeNull();
    expect(capsuleVerb('total-recall preflight check')).toBeNull();
    expect(capsuleVerb('')).toBeNull();
  });
});

describe('whenGateFails: a failed gate never denies its own repair', () => {
  const boom = new Error('boom');
  const inside = `${GATE_PACKAGE}/src/core/preflight-receipt.mjs`;
  it('keeps displaying, reading and searching open', () => {
    for (const tool of ['meta', 'ui', 'read', 'search']) {
      expect(whenGateFails({ tool, cwd: '/r' }, boom), tool).toMatchObject({ decision: 'allow', rule: 'gate-error:repair' });
    }
  });
  it('keeps changes inside its own package open, and no others', () => {
    expect(whenGateFails({ tool: 'write', path: inside, cwd: '/r' }, boom).decision).toBe('allow');
    expect(whenGateFails({ tool: 'write', path: 'src/x.mjs', cwd: GATE_PACKAGE }, boom).decision).toBe('allow');
    expect(whenGateFails({ tool: 'write', path: '/r/x.mjs', cwd: '/r' }, boom).decision).toBe('deny');
    expect(whenGateFails({ tool: 'write', path: `${GATE_PACKAGE}-other/x.mjs`, cwd: '/r' }, boom).decision).toBe('deny');
    expect(whenGateFails({ tool: 'shell', command: 'npm test', cwd: GATE_PACKAGE }, boom).decision).toBe('allow');
    expect(whenGateFails({ tool: 'shell', command: 'npm test', cwd: '/r' }, boom).decision).toBe('deny');
  });
  it('keeps a plain Total Recall command open, which is how another machine updates', () => {
    expect(whenGateFails({ tool: 'shell', command: 'total-recall update', cwd: '/r' }, boom).decision).toBe('allow');
    expect(whenGateFails({ tool: 'shell', command: 'total-recall update; rm -rf x', cwd: '/r' }, boom).decision).toBe('deny');
  });
  it('denies everything else, and says what stays open', () => {
    for (const tool of ['web', 'mcp', 'agent', 'other']) {
      const answer = whenGateFails({ tool, cwd: '/r' }, boom);
      expect(answer, tool).toMatchObject({ decision: 'deny', rule: 'gate-error' });
      expect(answer.reason).toContain('boom');
      expect(answer.reason).toContain(GATE_PACKAGE);
    }
  });
  it('never throws, whatever it is given', () => {
    for (const call of [undefined, null, {}, { tool: 7 }, { tool: 'write', path: 42 }, { tool: 'shell', cwd: 42 }, { tool: 'write', path: 'x', cwd: 42 }]) {
      expect(() => whenGateFails(call, boom), JSON.stringify(call)).not.toThrow();
    }
  });
  it('reaches decide, so a check that throws still leaves the repair open', () => {
    expect(decide({ tool: 'write', path: inside, cwd: '/r' }, { check: () => { throw boom; } }).decision).toBe('allow');
  });
});

describe('isCheckCommand', () => {
  it('recognizes the plain check in both spellings, and only that', () => {
    for (const command of ['total-recall tr-preflight --check', 'total-recall preflight check --json', 'cd /r && total-recall tr-preflight --check']) {
      expect(isCheckCommand(command), command).toBe(true);
    }
    for (const command of ['total-recall tr-preflight --ack --task "--check"', 'total-recall tr-preflight --check | tail', 'total-recall context "check"']) {
      expect(isCheckCommand(command), command).toBe(false);
    }
  });
});

describe('a broken gate package keeps its repair open', () => {
  const boom = new Error('broken');
  it('opens a shell command that changes into the package first', () => {
    expect(whenGateFails({ tool: 'shell', cwd: '/elsewhere', command: `cd ${GATE_PACKAGE} && npm install` }, boom)).toMatchObject({ decision: 'allow', rule: 'gate-error:repair' });
    expect(whenGateFails({ tool: 'shell', cwd: '/elsewhere', command: `cd "${GATE_PACKAGE}"; ls node_modules` }, boom)).toMatchObject({ decision: 'allow' });
    expect(whenGateFails({ tool: 'shell', cwd: '/elsewhere', command: 'cd /tmp && rm -rf x' }, boom)).toMatchObject({ decision: 'deny' });
  });
  it('reports a package whose dependency tree was deleted, and only then', async () => {
    const fs = await import('node:fs'); const os = await import('node:os'); const path = await import('node:path');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-gate-pkg-'));
    expect(gatePackageBroken(root)).toBeNull();
    fs.writeFileSync(path.join(root, 'package-lock.json'), '{}');
    expect(gatePackageBroken(root)).toContain("run 'npm install' there");
    fs.mkdirSync(path.join(root, 'node_modules'));
    fs.writeFileSync(path.join(root, 'node_modules', '.package-lock.json'), '{}');
    expect(gatePackageBroken(root)).toBeNull();
    fs.rmSync(root, { recursive: true, force: true });
  });
});
