import { describe, it, expect } from 'vitest';
import { resolveWebAuthnPath, listPasskeys, hasPasskeys, resolveRpFromRequest, beginRegistration, finishRegistration, beginAuthentication, finishAuthentication, deletePasskey, _clearChallengesForTests } from './webauthn-store.mjs';

describe('webauthn-store.mjs', () => {
  it('exports resolveWebAuthnPath', () => {
    expect(resolveWebAuthnPath).toBeDefined();
  });
  it('exports listPasskeys', () => {
    expect(listPasskeys).toBeDefined();
  });
  it('exports hasPasskeys', () => {
    expect(hasPasskeys).toBeDefined();
  });
  it('exports resolveRpFromRequest', () => {
    expect(resolveRpFromRequest).toBeDefined();
  });
  it('exports beginRegistration', () => {
    expect(beginRegistration).toBeDefined();
  });
  it('exports finishRegistration', () => {
    expect(finishRegistration).toBeDefined();
  });
  it('exports beginAuthentication', () => {
    expect(beginAuthentication).toBeDefined();
  });
  it('exports finishAuthentication', () => {
    expect(finishAuthentication).toBeDefined();
  });
  it('exports deletePasskey', () => {
    expect(deletePasskey).toBeDefined();
  });
  it('exports _clearChallengesForTests', () => {
    expect(_clearChallengesForTests).toBeDefined();
  });
});
