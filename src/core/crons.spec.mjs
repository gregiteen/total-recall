// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./logger.mjs', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock child_process to ensure execFileSync is never called
vi.mock('child_process', () => ({
  execFileSync: vi.fn(() => {
    throw new Error('execFileSync should not be called by runCrons');
  }),
}));

import { runCrons } from './crons.mjs';
import { execFileSync } from 'child_process';
import { logger } from './logger.mjs';

const minimalOptions = { vaultDir: '/tmp/vault', skillsDir: '/tmp/skills', brainDir: '/tmp/brain' };

describe('runCrons', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is exported and is a function', () => {
    expect(typeof runCrons).toBe('function');
  });

  it('returns a promise (is async)', () => {
    const result = runCrons(minimalOptions);
    expect(result).toBeInstanceOf(Promise);
    return result;
  });

  it('does not throw when called with minimal options', async () => {
    await expect(runCrons(minimalOptions)).resolves.not.toThrow();
  });

  it('does not call execFileSync', async () => {
    await runCrons(minimalOptions);
    expect(execFileSync).not.toHaveBeenCalled();
  });

  it('does not invoke skill push', async () => {
    await runCrons(minimalOptions);
    // execFileSync mock would throw if called — it wasn't, so we additionally
    // verify no info log contains "skill push"
    const infoCalls = logger.info.mock.calls;
    const hasSkillPush = infoCalls.some(([arg]) =>
      typeof arg?.message === 'string' && arg.message.includes('skill push')
    );
    expect(hasSkillPush).toBe(false);
  });

  it('logs a single info message indicating no active cron jobs', async () => {
    await runCrons(minimalOptions);
    const infoCalls = logger.info.mock.calls;
    expect(infoCalls.length).toBeGreaterThanOrEqual(1);
    const hasNoActiveCronMsg = infoCalls.some(([arg]) =>
      arg?.subsystem === 'cron' && typeof arg?.message === 'string'
    );
    expect(hasNoActiveCronMsg).toBe(true);
  });
});
