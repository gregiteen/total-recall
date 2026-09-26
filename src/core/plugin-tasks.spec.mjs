import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseCron, cronMatches, latestDueSlot, minuteSlot, runDuePluginTasks } from './plugin-tasks.mjs';
import { projectPluginsDir } from './plugin-loader.mjs';

describe('cron parsing', () => {
  it('matches steps, ranges and lists', () => {
    const c = parseCron('*/15 9-17 * * 1-5');
    expect(cronMatches(c, new Date(2026, 8, 22, 9, 30))).toBe(true); // Tuesday
    expect(cronMatches(c, new Date(2026, 8, 22, 9, 31))).toBe(false);
    expect(cronMatches(c, new Date(2026, 8, 20, 9, 30))).toBe(false); // Sunday
  });

  it('treats day-of-week 7 as Sunday', () => {
    expect(cronMatches(parseCron('0 0 * * 7'), new Date(2026, 8, 20, 0, 0))).toBe(true);
  });

  it('ORs day-of-month and day-of-week when both are restricted', () => {
    const c = parseCron('0 0 1 * 1');
    expect(cronMatches(c, new Date(2026, 8, 1, 0, 0))).toBe(true);  // 1st (a Tuesday)
    expect(cronMatches(c, new Date(2026, 8, 21, 0, 0))).toBe(true); // a Monday
    expect(cronMatches(c, new Date(2026, 8, 22, 0, 0))).toBe(false);
  });

  it.each(['* * * *', '60 * * * *', '* 24 * * *', '*/0 * * * *', '5-1 * * * *'])('rejects %s', (expr) => {
    expect(() => parseCron(expr)).toThrow();
  });
});

describe('latestDueSlot', () => {
  const hourly = parseCron('0 * * * *');

  it('returns the most recent missed slot once', () => {
    const now = new Date(2026, 8, 22, 14, 20);
    expect(latestDueSlot(hourly, '2026-09-22T12:00', now)).toBe('2026-09-22T14:00');
    expect(latestDueSlot(hourly, '2026-09-22T14:00', now)).toBeNull();
  });

  it('formats local minute slots', () => {
    expect(minuteSlot(new Date(2026, 0, 2, 3, 4))).toBe('2026-01-02T03:04');
  });
});

describe('runDuePluginTasks', () => {
  let root;
  let prevAgentDir;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-tasks-'));
    prevAgentDir = process.env._TR_TEST_AGENT_DIR;
    process.env._TR_TEST_AGENT_DIR = path.join(root, 'home-agent');
    const dir = path.join(projectPluginsDir(root), 'ticker');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'cli.mjs'), 'export async function run() {}');
    fs.writeFileSync(path.join(dir, 'plugin.json'), JSON.stringify({
      id: 'ticker', name: 'Ticker', version: '1.0.0', description: 'Scheduled task fixture',
      cli: { command: 'ticker', handler: './cli.mjs' },
      tasks: [{ intent: 'Tick', schedule: '*/10 * * * *', command: 'tick' }]
    }));
  });

  afterEach(() => {
    if (prevAgentDir === undefined) delete process.env._TR_TEST_AGENT_DIR;
    else process.env._TR_TEST_AGENT_DIR = prevAgentDir;
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('does not run on first sight, then runs each due slot exactly once', async () => {
    const calls = [];
    const runner = async (plugin, opts) => {
      calls.push(`${plugin.id}:${opts.subcommand}`);
      return { ok: true, exitCode: 0, output: '', durationMs: 1 };
    };

    expect(await runDuePluginTasks({ projectRoot: root, now: new Date(2026, 8, 22, 12, 5), runner })).toEqual([]);
    const second = await runDuePluginTasks({ projectRoot: root, now: new Date(2026, 8, 22, 12, 12), runner });
    expect(second).toEqual([{ plugin: 'ticker', command: 'tick', slot: '2026-09-22T12:10', ok: true, exitCode: 0 }]);
    expect(await runDuePluginTasks({ projectRoot: root, now: new Date(2026, 8, 22, 12, 13), runner })).toEqual([]);
    expect(calls).toEqual(['ticker:tick']);

    const record = fs.readFileSync(
      path.join(root, '.agent', 'skills', 'total-recall', 'memory-vault', 'system', 'plugins', 'ticker.md'),
      'utf8'
    );
    expect(record).toMatch(/tick: "?2026-09-22T12:10"?/);
  });
});
