import { describe, it, expect, vi } from 'vitest';
import runAgent, { parseSpawnArgs } from './agent.mjs';
import * as preflightReceipt from '../core/preflight-receipt.mjs';

describe('agent.mjs', () => {
  it('exports default function', () => {
    expect(runAgent).toBeDefined();
    expect(typeof runAgent).toBe('function');
  });

  it('refuses local agent spawn when preflight receipt is missing or invalid', async () => {
    const origExit = process.exit;
    let exitCode = null;
    process.exit = (code) => { exitCode = code; throw new Error(`exit(${code})`); };
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.spyOn(preflightReceipt, 'checkAnyReceipt').mockReturnValue({
      ok: false,
      problems: ['no preflight receipt for this repository'],
      receipt: null,
      ageMs: null
    });

    try {
      await expect(runAgent(['node', 'total-recall', 'agent', 'spawn', 'agy', 'some task'])).rejects.toThrow('exit(1)');
      expect(exitCode).toBe(1);
      const errors = errSpy.mock.calls.map(c => c[0]).join('\n');
      expect(errors).toContain('TR-PREFLIGHT gate');
      expect(errors).toContain('no preflight receipt');
    } finally {
      process.exit = origExit;
      vi.restoreAllMocks();
    }
  });
});

describe('parseSpawnArgs', () => {
  it('keeps option values out of the task text', () => {
    const p = parseSpawnArgs(['agy', 'Crawl', 'preprints', '--name', 'Quantum Scout', '--node', 'build-box']);
    expect(p).toMatchObject({ harness: 'agy', task: 'Crawl preprints', name: 'Quantum Scout', targetNode: 'build-box' });
  });

  it('accepts --cwd, --tools (including an empty value) and their aliases', () => {
    expect(parseSpawnArgs(['claude', 't', '--cwd', '/w', '--tools', ''])).toMatchObject({ cwd: '/w', tools: '' });
    expect(parseSpawnArgs(['claude', 't', '--allow-tools=Bash,Read'])).toMatchObject({ tools: 'Bash,Read' });
    expect(parseSpawnArgs(['claude', 't', '--no-tools'])).toMatchObject({ tools: 'none' });
    expect(parseSpawnArgs(['claude', 't', '--setting-sources', 'local', '--no-detach', '--json'])).toMatchObject({
      settingSources: 'local', detach: false, isJson: true,
    });
  });

  it('rejects unknown options and missing values instead of folding them into the task', () => {
    expect(() => parseSpawnArgs(['claude', 't', '--bogus'])).toThrow(/Unknown option/);
    expect(() => parseSpawnArgs(['claude', 't', '--cwd'])).toThrow(/requires a value/);
  });
});
