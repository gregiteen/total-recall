import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  HARNESS_SPECS,
  detectHarnesses,
  dispatchTask,
  buildHarnessArgs,
  normalizeToolSelection,
  resolveHarnessEnv,
  shellQuote,
  getInstalledHarnessVersion,
  getLatestHarnessVersion,
  queryHarnessUsage,
} from './meta-harness.mjs';

describe('Meta Harness & Multi-Agent Manager', () => {
  it('defines all canonical harness specs with verified flags', () => {
    expect(HARNESS_SPECS).toHaveProperty('agy');
    expect(HARNESS_SPECS).toHaveProperty('claude');
    expect(HARNESS_SPECS).toHaveProperty('codex');
    expect(HARNESS_SPECS).toHaveProperty('gemini');
    expect(HARNESS_SPECS).toHaveProperty('ollama');
    expect(HARNESS_SPECS).toHaveProperty('grok');

    expect(HARNESS_SPECS.agy.defaultFlags).toContain('-p');
    expect(HARNESS_SPECS.claude.defaultFlags).toContain('--permission-mode');
    expect(HARNESS_SPECS.codex.defaultFlags).toContain('exec');
    expect(HARNESS_SPECS.gemini.defaultFlags).toContain('--sandbox=false');
    expect(HARNESS_SPECS.ollama.defaultFlags).toContain('run');
    expect(HARNESS_SPECS.grok.defaultFlags).toContain('-p');
  });

  it('detects available harnesses without crashing', () => {
    const detected = detectHarnesses();
    expect(Array.isArray(detected)).toBe(true);
    expect(detected.length).toBe(6);
    for (const h of detected) {
      expect(h).toHaveProperty('id');
      expect(h).toHaveProperty('name');
      expect(h).toHaveProperty('available');
    }
  });

  it('throws error when dispatching to an unknown harness', async () => {
    await expect(dispatchTask('non-existent-harness', 'test prompt')).rejects.toThrow(
      'Unknown harness ID: "non-existent-harness"',
    );
  });
});

describe('harness tool selection', () => {
  const claude = HARNESS_SPECS.claude;

  it('leaves Claude Code its built-in tools by default', () => {
    expect(claude.defaultFlags).not.toContain('--tools');
    expect(claude.defaultFlags).not.toContain('--setting-sources');
    expect(buildHarnessArgs(claude)).toEqual(claude.defaultFlags);
    expect(buildHarnessArgs(claude, { tools: 'default' })).toEqual(claude.defaultFlags);
  });

  it('disables every tool on request, with -p kept last', () => {
    for (const tools of ['none', '', []]) {
      const args = buildHarnessArgs(claude, { tools });
      expect(args.slice(-3)).toEqual(['--tools', '', '-p']);
    }
  });

  it('passes an explicit tool list and settings layers', () => {
    const args = buildHarnessArgs(claude, { tools: ['Bash', 'WebFetch'], settingSources: 'local' });
    expect(args.slice(-5)).toEqual(['--tools', 'Bash,WebFetch', '--setting-sources', 'local', '-p']);
    expect(buildHarnessArgs(claude, { tools: 'Read, Grep' })).toContain('Read,Grep');
  });

  it('refuses a tool selection on a harness that cannot honour it', () => {
    expect(() => buildHarnessArgs(HARNESS_SPECS.codex, { tools: 'none' })).toThrow(/does not support choosing its tool set/);
    expect(() => buildHarnessArgs(HARNESS_SPECS.gemini, { settingSources: 'local' })).toThrow(/setting-sources/);
    expect(buildHarnessArgs(HARNESS_SPECS.codex)).toEqual(HARNESS_SPECS.codex.defaultFlags);
  });

  it('normalises selections', () => {
    expect(normalizeToolSelection(undefined)).toBeNull();
    expect(normalizeToolSelection('all')).toBeNull();
    expect(normalizeToolSelection('none')).toBe('');
    expect(normalizeToolSelection(' Bash , Edit ')).toBe('Bash,Edit');
  });
});

describe('shellQuote', () => {
  it('neutralises shell metacharacters and keeps empty values as real arguments', () => {
    expect(shellQuote('')).toBe("''");
    expect(shellQuote("it's $(rm -rf ~) `x`")).toBe(`'it'\\''s $(rm -rf ~) \`x\`'`);
    const out = spawnSync('sh', ['-c', `printf '%s|' ${shellQuote("a b")} ${shellQuote('')} ${shellQuote("$HOME 'q'")}`], { encoding: 'utf8' });
    expect(out.stdout).toBe("a b||$HOME 'q'|");
  });
});

describe('resolveHarnessEnv', () => {
  const claude = HARNESS_SPECS.claude;

  it('fills the OAuth token from the secret store when the environment lacks it', async () => {
    const asked = [];
    const env = await resolveHarnessEnv(claude, { PATH: '/bin' }, {
      readSecret: async (key) => { asked.push(key); return 'tok-from-store'; },
    });
    expect(asked).toEqual(['CLAUDE_CODE_OAUTH_TOKEN']);
    expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBe('tok-from-store');
    expect(env.PATH).toBe('/bin');
  });

  it('never overrides a token the caller already supplied', async () => {
    const env = await resolveHarnessEnv(claude, { CLAUDE_CODE_OAUTH_TOKEN: 'mine' }, {
      readSecret: async () => { throw new Error('must not be asked'); },
    });
    expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBe('mine');
  });

  it('falls back to the harness login when the store is locked or empty', async () => {
    const locked = await resolveHarnessEnv(claude, {}, { readSecret: async () => { throw new Error('locked'); } });
    expect(locked).not.toHaveProperty('CLAUDE_CODE_OAUTH_TOKEN');
    const empty = await resolveHarnessEnv(claude, {}, { readSecret: async () => null });
    expect(empty).not.toHaveProperty('CLAUDE_CODE_OAUTH_TOKEN');
  });

  it('asks nothing for harnesses without declared auth secrets', async () => {
    const env = await resolveHarnessEnv(HARNESS_SPECS.codex, { A: '1' }, {
      readSecret: async () => { throw new Error('must not be asked'); },
    });
    expect(env).toEqual({ A: '1' });
  });
});

describe('Harness version currency and quota usage inspection', () => {
  it('detects installed harness versions safely', () => {
    const ver = getInstalledHarnessVersion('agy');
    expect(typeof ver).toBe('string');
  });

  it('queries harness usage and returns 5h and weekly quota percentages', async () => {
    const reports = await queryHarnessUsage();
    expect(Array.isArray(reports)).toBe(true);
    expect(reports.length).toBe(6);

    for (const r of reports) {
      expect(r).toHaveProperty('id');
      expect(r).toHaveProperty('name');
      expect(r).toHaveProperty('version');
      expect(r).toHaveProperty('latestVersion');
      expect(r).toHaveProperty('isCurrent');
      expect(r).toHaveProperty('rolling5hRemainingPct');
      expect(r).toHaveProperty('weeklyRemainingPct');
      expect(r).toHaveProperty('status');

      if (r.available) {
        expect(typeof r.rolling5hRemainingPct).toBe('string');
        expect(typeof r.weeklyRemainingPct).toBe('string');
      }
    }

    const agy = reports.find((h) => h.id === 'agy');
    expect(agy).toBeDefined();
    if (agy.available && agy.authed) {
      expect(agy.rolling5hRemainingPct).toContain('%');
      expect(agy.weeklyRemainingPct).toContain('%');
    }
  });
});
