import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { readDrawerConfig, validateDrawerConfig, writeDrawerConfig } from './workspace-drawers.mjs';

it('preserves both drawer layouts and rejects a stale write', async () => {
  const brain = await fs.mkdtemp(path.join(os.tmpdir(), 'tr-drawers-'));
  try {
    const initial = readDrawerConfig(brain, 'bottom');
    const config = validateDrawerConfig({
      html: '<h2>My workspace</h2>',
      chunks: ['phone:call-workbench'],
      shortcuts: [{ label: 'Vault', href: '/memory' }],
    });
    const written = await writeDrawerConfig(brain, 'bottom', config, initial.version);
    await expect(writeDrawerConfig(brain, 'bottom', {}, initial.version)).rejects.toThrow('Plugin state version conflict');
    expect(readDrawerConfig(brain, 'bottom')).toEqual(written);
    expect(readDrawerConfig(brain, 'right')).toEqual(initial);
  } finally {
    await fs.rm(brain, { recursive: true, force: true });
  }
});

it('rejects relative addresses that normalize to a different origin when followed', () => {
  expect(() => validateDrawerConfig({
    shortcuts: [{ label: 'Outside', href: '/account/..//example.org' }],
  })).toThrow('Use a dashboard path or an HTTPS address');
});
