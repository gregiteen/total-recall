import { it, expect } from 'vitest';
import { authGuard } from './auth-guard.mjs';
import { watchdog } from './watchdog.mjs';

it('keeps authentication quarantine shared with the legacy monitoring owner', () => {
  expect(watchdog.recordAuthFailure).toBe(authGuard.recordAuthFailure);
  expect(watchdog.resetAuthFailures).toBe(authGuard.resetAuthFailures);
  expect(watchdog.isIpBlocked).toBe(authGuard.isIpBlocked);
  authGuard.recordAuthFailure('203.0.113.23');
  expect(authGuard.isIpBlocked('203.0.113.23')).toBe(false);
  authGuard.resetAuthFailures('203.0.113.23');
});
