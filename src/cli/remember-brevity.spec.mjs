process.env.GOOGLE_API_KEY = 'mock-google-key';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import remember from './remember.mjs';

describe('remember keeps rules brief', () => {
  let dir, origEnv;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-brevity-'));
    origEnv = { ...process.env };
    process.env.AGENT_DIR = dir;
    process.env._TR_TEST_AGENT_DIR = dir;
    fs.mkdirSync(path.join(dir, 'skills', 'total-recall', 'rules'), { recursive: true });
  });
  afterEach(() => { process.env = origEnv; fs.rmSync(dir, { recursive: true, force: true }); vi.restoreAllMocks(); });

  it('warns on a rule over 300 characters but saves it', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await remember(['invariant', 'Never do this. '.repeat(25), '--global', '--slug', 'long-ish', '--no-dedup']);
    expect(err.mock.calls.flat().join('\n')).toMatch(/Keep rules brief/);
  });

  it('refuses a rule over 800 characters unless --allow-long', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit'); });
    await expect(remember(['preference', 'Never do this. '.repeat(60), '--global', '--slug', 'too-long'])).rejects.toThrow('exit');
    expect(exit).toHaveBeenCalledWith(1);
    expect(err.mock.calls.flat().join('\n')).toMatch(/limit 800/);
  });

  it('does not limit facts', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await remember(['fact', 'History detail. '.repeat(80), '--global', '--slug', 'long-fact', '--no-dedup']);
    expect(err.mock.calls.flat().join('\n')).not.toMatch(/brief/);
  });
});
