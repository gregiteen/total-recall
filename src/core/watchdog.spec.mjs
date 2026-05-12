import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { logger, logEvents } from './logger.mjs';
import { watchdog, attachLogMonitor, detachLogMonitor } from './watchdog.mjs';

describe('watchdog log monitor wiring', () => {
  beforeEach(() => {
    watchdog.resetSandboxFailures();
    attachLogMonitor();
  });

  afterEach(() => {
    detachLogMonitor();
  });

  it('records a sandbox failure when sandbox subsystem logs an error', () => {
    expect(watchdog.isSandboxQuarantined()).toBe(false);
    logger.error('sandbox', 'simulated execution failure #1');
    logger.error('sandbox', 'simulated execution failure #2');
    logger.error('sandbox', 'simulated execution failure #3');
    expect(watchdog.isSandboxQuarantined()).toBe(true);
  });

  it('records an auth failure when auth subsystem warns with an IP', () => {
    logger.warn('auth', 'invalid PAT', { ip: '203.0.113.7' });
    // Single warning should not yet block
    expect(watchdog.isIpBlocked('203.0.113.7')).toBe(false);
  });

  it('does not react to its own log entries (no recursion)', () => {
    const before = watchdog.isSandboxQuarantined();
    // Emitting a watchdog-subsystem error must not feed back into itself.
    logEvents.emit('log', { subsystem: 'watchdog', level: 'error', message: 'self test' });
    expect(watchdog.isSandboxQuarantined()).toBe(before);
  });
});
