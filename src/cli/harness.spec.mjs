import { describe, it, expect, vi } from 'vitest';
import runHarness from './harness.mjs';
import * as preflightReceipt from '../core/preflight-receipt.mjs';

describe('harness.mjs', () => {
  it('exports default function', () => {
    expect(runHarness).toBeDefined();
    expect(typeof runHarness).toBe('function');
  });

  it('refuses local harness dispatch when preflight receipt is missing or invalid', async () => {
    const origExit = process.exit;
    let exitCode = null;
    process.exit = (code) => { exitCode = code; throw new Error(`exit(${code})`); };
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.spyOn(preflightReceipt, 'checkReceipt').mockReturnValue({
      ok: false,
      problems: ['no preflight receipt for this repository'],
      receipt: null,
      ageMs: null
    });

    try {
      await expect(runHarness(['node', 'total-recall', 'harness', 'dispatch', 'claude', 'some task'])).rejects.toThrow('exit(1)');
      expect(exitCode).toBe(1);
      const errors = errSpy.mock.calls.map(c => c[0]).join('\n');
      expect(errors).toContain('TR-PREFLIGHT gate');
      expect(errors).toContain('no preflight receipt');
    } finally {
      process.exit = origExit;
      vi.restoreAllMocks();
    }
  });

  it('refuses council deliberation when preflight receipt is missing or invalid', async () => {
    const origExit = process.exit;
    let exitCode = null;
    process.exit = (code) => { exitCode = code; throw new Error(`exit(${code})`); };
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.spyOn(preflightReceipt, 'checkReceipt').mockReturnValue({
      ok: false,
      problems: ['preflight receipt is stale; re-run --ack'],
      receipt: null,
      ageMs: null
    });

    try {
      await expect(runHarness(['node', 'total-recall', 'harness', 'council', 'propose arch'])).rejects.toThrow('exit(1)');
      expect(exitCode).toBe(1);
      const errors = errSpy.mock.calls.map(c => c[0]).join('\n');
      expect(errors).toContain('Council deliberation refused by TR-PREFLIGHT gate');
      expect(errors).toContain('stale');
    } finally {
      process.exit = origExit;
      vi.restoreAllMocks();
    }
  });
});
