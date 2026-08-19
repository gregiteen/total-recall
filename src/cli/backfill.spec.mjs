import { describe, it, expect, vi, beforeEach } from 'vitest';
import backfill from './backfill.mjs';
import * as vaultBackfill from '../core/vault-backfill.mjs';

describe('cli: backfill', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('prints usage when --help or -h is passed', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await backfill(['--help']);
    expect(logSpy).toHaveBeenCalled();
    const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('total-recall backfill [options]');
  });

  it('performs a dry-run analysis by default', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(vaultBackfill, 'analyzeVault').mockResolvedValue({
      vaultDir: '/tmp/test-vault',
      total: 10,
      valid: 8,
      invalid: 2,
      repairable: 2,
      unfixable: [],
      unreadable: [],
      fieldCounts: { ssss_version: 2 },
      shapeRepairs: {},
      errorCounts: {},
      nodes: [],
    });

    await backfill(['--vault', '/tmp/test-vault']);
    expect(logSpy).toHaveBeenCalled();
    const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('Dry run');
  });

  it('invokes backfillVault when --apply is passed', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const backfillSpy = vi.spyOn(vaultBackfill, 'backfillVault').mockResolvedValue({
      vaultDir: '/tmp/test-vault',
      total: 10,
      valid: 8,
      invalid: 2,
      repairable: 2,
      unfixable: [],
      unreadable: [],
      fieldCounts: {},
      shapeRepairs: {},
      errorCounts: {},
      nodes: [],
      snapshotId: 'snap-123',
      repaired: 2,
      failed: [],
    });

    await backfill(['--apply', '--vault', '/tmp/test-vault']);
    expect(backfillSpy).toHaveBeenCalled();
    const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('Backfilling');
    expect(output).toContain('snap-123');
  });
});
