import { describe, it, expect } from 'vitest';
import { PROVIDER_CATALOG, getProvider, providerForKeyName, listProviders } from './provider-catalog.mjs';

describe('provider-catalog.mjs', () => {
  it('exports PROVIDER_CATALOG', () => {
    expect(PROVIDER_CATALOG).toBeDefined();
  });
  it('exports getProvider', () => {
    expect(getProvider).toBeDefined();
  });
  it('exports providerForKeyName', () => {
    expect(providerForKeyName).toBeDefined();
  });
  it('exports listProviders', () => {
    expect(listProviders).toBeDefined();
  });
});
