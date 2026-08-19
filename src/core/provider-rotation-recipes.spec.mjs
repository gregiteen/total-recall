import { describe, it, expect } from 'vitest';
import {
  ROTATION_RECIPES,
  getRecipe,
  listVerifiedRecipes,
  valueLooksValid,
} from './provider-rotation-recipes.mjs';

describe('core: provider-rotation-recipes', () => {
  it('loads recipe by provider ID case-insensitively', () => {
    const r1 = getRecipe('github');
    expect(r1).toBeDefined();
    expect(r1.provider).toBe('github');

    const r2 = getRecipe('GITHUB');
    expect(r2).toBe(r1);

    expect(getRecipe('nonexistent-provider')).toBeNull();
  });

  it('lists verified recipes', () => {
    const verified = listVerifiedRecipes();
    expect(Array.isArray(verified)).toBe(true);
    expect(verified).toContain('openrouter');
  });

  it('validates secret shapes using valueLooksValid', () => {
    const openrouterRecipe = getRecipe('openrouter');
    expect(valueLooksValid(openrouterRecipe, 'too-short')).toBe(false);
    expect(valueLooksValid(openrouterRecipe, 'sk-or-v1-invalid-not-64-hex')).toBe(false);
    expect(valueLooksValid(openrouterRecipe, `sk-or-v1-${'a'.repeat(64)}`)).toBe(true);

    const genericRecipe = getRecipe('elevenlabs');
    expect(valueLooksValid(genericRecipe, '1234567890123')).toBe(true);
    expect(valueLooksValid(genericRecipe, 'short')).toBe(false);
  });
});
