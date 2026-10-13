import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mintStepUpToken, verifyStepUpToken } from './auth.mjs';

const saved = process.env.TR_SECRETS_PASSWORD;
beforeAll(async () => {
  process.env.TR_SECRETS_PASSWORD = 'fixture-step-up-master';
  const { loadPluginModule } = await import('../core/plugin-runtime.mjs');
  const { createSessionCredentials } = await loadPluginModule('auth', 'session-credentials');
  createSessionCredentials({ brainDir: (await import('../core/config.mjs')).brainDir }).rotateSession();
});
afterAll(() => { if (saved === undefined) delete process.env.TR_SECRETS_PASSWORD; else process.env.TR_SECRETS_PASSWORD = saved; });
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
