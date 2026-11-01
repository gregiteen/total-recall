import { describe, it, expect } from 'vitest';
import { loadPluginModule } from '../core/plugin-runtime.mjs';
import { spawnSync } from 'node:child_process';
describe('auth credential command ownership', () => {
  it('requires the auth command owner', async () => {
    expect((await loadPluginModule('auth', 'commands')).run).toBeTypeOf('function');
  });
  it('routes credential aliases directly to the auth owner', () => {
    for (const command of ['secret', 'secrets']) {
      const result = spawnSync(process.execPath, ['bin/total-recall.mjs', command, '--help'], { encoding: 'utf8' });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('total-recall auth secret');
      const invalid = spawnSync(process.execPath, ['bin/total-recall.mjs', command, 'not-a-secret-operation'], { encoding: 'utf8' });
      expect(invalid.status).not.toBe(0);
    }
  });
});
