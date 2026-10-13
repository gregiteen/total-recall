import { describe, it, expect } from 'vitest';
import { loadPluginModule } from '../core/plugin-runtime.mjs';
describe('secret compatibility owner', () => {
  it('requires the auth command owner', async () => {
    expect((await loadPluginModule('auth', 'commands')).run).toBeTypeOf('function');
  });
});
