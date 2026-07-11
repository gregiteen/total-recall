import { describe, it, expect } from 'vitest';
import { mintStepUpToken, verifyStepUpToken } from './auth.mjs';

describe('step-up tokens', () => {
  it('mints and verifies secrets:reveal tokens', () => {
    const token = mintStepUpToken({ purpose: 'secrets:reveal', ttlSeconds: 60, actor: 'passkey' });
    expect(typeof token).toBe('string');
    const ok = verifyStepUpToken(token, 'secrets:reveal');
    expect(ok.ok).toBe(true);
    expect(ok.payload?.step_up).toBe(true);
    expect(ok.payload?.actor).toBe('passkey');
  });

  it('rejects wrong purpose and garbage', () => {
    const token = mintStepUpToken({ purpose: 'secrets:reveal' });
    expect(verifyStepUpToken(token, 'other').ok).toBe(false);
    expect(verifyStepUpToken('not-a-jwt', 'secrets:reveal').ok).toBe(false);
    expect(verifyStepUpToken('', 'secrets:reveal').ok).toBe(false);
  });
});
