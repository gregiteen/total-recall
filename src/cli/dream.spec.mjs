import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import dream, { parseDreamArgs, discoverDreamBrains } from './dream.mjs';

describe('dream command', () => {
  let tmp;
  function brain(root, name = '.agent') {
    const dir = path.join(root, name, 'skills/total-recall');
    fs.mkdirSync(path.join(dir, 'memory-vault'), { recursive: true });
    return dir;
  }
  beforeEach(() => {
    tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dream-cli-')));
    vi.spyOn(os, 'homedir').mockReturnValue(tmp);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubEnv('TR_SYNC_REPOS', '');
    process.exitCode = 0;
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(tmp, { recursive: true, force: true }); process.exitCode = 0; });

  it('rejects unknown options with exit 2 through the real CLI', () => {
    const result = spawnSync(process.execPath, ['bin/total-recall.mjs', 'dream', '--all-brians'], { encoding: 'utf8' });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Unknown dream option: --all-brians');
  });
  it.each([['--vault'], ['--project', '--global'], ['--all-brains', '--vault', '/tmp/v'], ['--all-brains', '--project']])('rejects invalid selection %j', (...args) => {
    expect(() => parseDreamArgs(args)).toThrow();
  });

  function fixture() {
    const global = brain(tmp);
    const a = path.join(tmp, 'a'), b = path.join(tmp, 'b');
    brain(a); brain(b, '.agents');
    fs.mkdirSync(path.join(global, 'config'), { recursive: true });
    fs.writeFileSync(path.join(global, 'config/project-registry.json'), JSON.stringify([{ path: a }, { path: a }]));
    vi.stubEnv('TR_SYNC_REPOS', `${a},${b}`);
    // A service's global override must not redirect the project brains.
    vi.stubEnv('AGENT_DIR', path.join(tmp, '.agent'));
    return { global, a, b, discover: () => discoverDreamBrains({ brainDir: global, agentDir: path.join(tmp, '.agent') }) };
  }

  it('runs every registry and env brain sequentially, with separate paths, after a failure', async () => {
    const { global, a, b, discover } = fixture();
    const visited = []; let active = 0;
    const run = vi.fn(async options => {
      expect(active++).toBe(0);
      await Promise.resolve();
      active--;
      visited.push(options);
      if (visited.length === 2) throw new Error('brain failed');
      return { status: 'success' };
    });
    const result = await dream(['--all-brains', '--json'], { discover, run });
    expect(visited.map(row => row.brainDir)).toEqual([global, path.join(a, '.agent/skills/total-recall'), path.join(b, '.agents/skills/total-recall')]);
    for (const row of visited) {
      expect(row.derivedDir).toBe(path.join(row.brainDir, 'memory-derived'));
      expect(row.vaultDir).toBe(path.join(row.brainDir, 'memory-vault'));
    }
    expect(visited[1].instructionsFile).toBe(path.join(a, 'INSTRUCTIONS.md'));
    expect(result.map(row => row.status)).toEqual(['success', 'failed', 'success']);
    expect(JSON.parse(console.log.mock.calls.at(-1)[0])).toEqual(result);
    expect(process.exitCode).toBe(1);
  });

  it('previews real decay candidates without creating derived files or running dream', async () => {
    const { global, discover } = fixture();
    fs.writeFileSync(path.join(global, 'memory-vault', 'old.md'), `---\nslug: old\ntype: memory\ncategory: facts\nstatus: active\nimportance: 2\ncreated: '2020-01-01T00:00:00.000Z'\nupdated: '2020-01-01T00:00:00.000Z'\nlast_accessed: '2020-01-01T00:00:00.000Z'\n---\nOld fact\n`);
    fs.mkdirSync(path.join(global, 'memory-derived'));
    fs.writeFileSync(path.join(global, 'memory-derived/access-ledger.json'), JSON.stringify({ _active_days: Array.from({ length: 60 }, (_, i) => new Date(Date.UTC(2021, 0, i + 1)).toISOString().slice(0, 10)) }));
    const before = fs.readFileSync(path.join(global, 'memory-derived/access-ledger.json'), 'utf8');
    const run = vi.fn();
    const result = await dream(['--all-brains', '--dry-run', '--json'], { discover, run });
    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({ status: 'dry_run', decay_candidates: ['old'] });
    expect(result[1].decay_candidates).toEqual([]);
    expect(run).not.toHaveBeenCalled();
    expect(fs.readFileSync(path.join(global, 'memory-derived/access-ledger.json'), 'utf8')).toBe(before);
    expect(fs.readdirSync(global).sort()).toEqual(['config', 'memory-derived', 'memory-vault']);
    expect(fs.existsSync(result[1].derivedDir)).toBe(false);
    expect(process.exitCode).toBe(0);
  });
});
