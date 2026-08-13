import { describe, it, expect } from 'vitest';

import { providerForKeyName, PROVIDER_CATALOG } from './provider-catalog.mjs';
import {
  getRotationPlan,
  planAll,
  summarizePlans,
  generateSecretValue,
  selfGeneratedSpec,
} from './rotation-capability.mjs';
import { ROTATION_RECIPES, getRecipe, valueLooksValid } from './provider-rotation-recipes.mjs';

describe('providerForKeyName — attribution safety', () => {
  it('does not mis-attribute Stripe keys to total-recall via the "TR" stem', () => {
    // Regression: the pattern TR_TOKEN reduced to the 2-char stem "TR", which
    // as a bare substring matched S-TR-IPE_SECRET_KEY. A rotation prompt for a
    // live payments key would have pointed at TR's own GitHub page.
    expect(providerForKeyName('STRIPE_SECRET_KEY')?.id).toBe('stripe');
    expect(providerForKeyName('STRIPE_API_KEY')?.id).toBe('stripe');
    expect(providerForKeyName('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY')?.id).toBe('stripe');
  });

  it('still resolves genuine total-recall keys', () => {
    expect(providerForKeyName('TR_TOKEN')?.id).toBe('total-recall');
    expect(providerForKeyName('TR_SECRETS_PASSWORD')?.id).toBe('total-recall');
    expect(providerForKeyName('TOTAL_RECALL_TOKEN')?.id).toBe('total-recall');
  });

  it('matches stems only on token boundaries, never mid-word', () => {
    // GITHUB stem must not be reachable from an unrelated embedded substring.
    expect(providerForKeyName('MYGITHUBBER_KEY')?.id).not.toBe('github');
    expect(providerForKeyName('GITHUB_APP_CLIENT_SECRET')?.id).toBe('github');
  });

  it('strips packaging prefixes before matching', () => {
    expect(providerForKeyName('DEVELOPER_OPENROUTER_API_KEY')?.id).toBe('openrouter');
    expect(providerForKeyName('VITE_FAL_KEY')?.id).toBe('fal');
  });
});

describe('getRotationPlan — every key gets a method', () => {
  it('classifies self-generated secrets without a provider', () => {
    for (const k of ['JWT_SECRET', 'BETTER_AUTH_SECRET', 'DB_PASSWORD', 'REDIS_PASSWORD']) {
      const p = getRotationPlan(k);
      expect(p.class, k).toBe('self_generated');
      expect(p.automatable, k).toBe(true);
    }
  });

  it('treats key material and recovery codes as manual even when a provider maps', () => {
    expect(getRotationPlan('GITHUB_APP_PRIVATE_KEY').class).toBe('manual');
    expect(getRotationPlan('NPM_RECOVERY_CODE').class).toBe('manual');
    expect(getRotationPlan('DEVELOPER_SSH_KEY').class).toBe('manual');
  });

  it('flags Stripe as high risk', () => {
    const p = getRotationPlan('STRIPE_SECRET_KEY');
    expect(p.provider).toBe('stripe');
    expect(p.class).toBe('provider_browser');
    expect(p.high_risk).toBe(true);
  });

  it('never returns an undefined class, and always gives a reason', () => {
    const keys = ['JWT_SECRET', 'STRIPE_SECRET_KEY', 'DEVELOPER_SSH_KEY', 'TOTALLY_UNKNOWN_THING', '__meta'];
    for (const k of keys) {
      const p = getRotationPlan(k);
      expect(p.class, k).toBeTruthy();
      expect(typeof p.reason, k).toBe('string');
      expect(p.reason.length, k).toBeGreaterThan(0);
    }
  });

  it('marks internal bookkeeping entries as non_secret', () => {
    expect(getRotationPlan('__tr_secrets_meta').class).toBe('non_secret');
  });
});

describe('generateSecretValue', () => {
  it('produces unique, sufficiently long values', () => {
    const seen = new Set();
    for (let i = 0; i < 50; i++) {
      const v = generateSecretValue('JWT_SECRET');
      expect(v.length).toBeGreaterThanOrEqual(32);
      expect(seen.has(v)).toBe(false);
      seen.add(v);
    }
  });

  it('emits shell-safe values for password-shaped keys', () => {
    const v = generateSecretValue('DB_PASSWORD');
    expect(selfGeneratedSpec('DB_PASSWORD').kind).toBe('password');
    // base64url — safe to drop into a .env projection unquoted
    expect(v).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe('rotation recipes — safety invariants', () => {
  it('only verified recipes may drive the console autonomously', () => {
    // An unverified recipe with a create() would blind-click guessed selectors
    // on someone's billing dashboard. That must never ship.
    for (const [id, r] of Object.entries(ROTATION_RECIPES)) {
      if (!r.verified) {
        expect(typeof r.create, `${id} is unverified but has create()`).not.toBe('function');
      }
    }
  });

  it('every recipe has a console_url and a create_hint', () => {
    for (const [id, r] of Object.entries(ROTATION_RECIPES)) {
      expect(r.console_url, id).toMatch(/^https:\/\//);
      expect(r.create_hint, id).toBeTruthy();
    }
  });

  it('every catalog provider with a console_url has a recipe', () => {
    const missing = PROVIDER_CATALOG.filter((p) => p.console_url && !getRecipe(p.id)).map((p) => p.id);
    expect(missing).toEqual([]);
  });

  it('valueLooksValid rejects garbage and enforces provider shape', () => {
    const or = getRecipe('openrouter');
    expect(valueLooksValid(or, '')).toBe(false);
    expect(valueLooksValid(or, 'short')).toBe(false);
    expect(valueLooksValid(or, 'Copy to clipboard')).toBe(false);
    expect(valueLooksValid(or, 'sk-or-v1-' + 'a'.repeat(64))).toBe(true);
  });

  it('rejects a wrong-provider value that would overwrite a working credential', () => {
    expect(valueLooksValid(getRecipe('stripe'), 'ghp_' + 'a'.repeat(36))).toBe(false);
  });
});

describe('summarizePlans', () => {
  it('accounts for every key exactly once', () => {
    const keys = ['JWT_SECRET', 'STRIPE_SECRET_KEY', 'DEVELOPER_SSH_KEY', '__tr_secrets_meta'];
    const plans = planAll(keys);
    const sum = summarizePlans(plans);
    expect(sum.total).toBe(keys.length);
    expect(sum.automatable + sum.manual).toBe(keys.length);
    expect(Object.values(sum.byClass).reduce((a, b) => a + b, 0)).toBe(keys.length);
  });
});
