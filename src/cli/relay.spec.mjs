import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ctx = vi.hoisted(() => ({ dir: '', resolve: null }));
vi.mock('../core/config.mjs', async () => {
  const fsm = await import('node:fs'); const osm = await import('node:os'); const pathm = await import('node:path');
  ctx.dir = fsm.mkdtempSync(pathm.join(osm.tmpdir(), 'tr-relay-'));
  return { agentDir: ctx.dir, brainDir: ctx.dir };
});
vi.mock('../core/connection-token.mjs', () => ({ resolveConnectionToken: (...args) => ctx.resolve(...args) }));

import relay from './relay.mjs';

describe('relay.mjs', () => {
  it('exports default', () => {
    expect(relay).toBeDefined();
  });
});

describe('relay status credential', () => {
  let log;
  beforeEach(() => {
    fs.rmSync(path.join(ctx.dir, 'config'), { recursive: true, force: true });
    fs.mkdirSync(path.join(ctx.dir, 'config'), { recursive: true });
    fs.writeFileSync(path.join(ctx.dir, 'config', 'brain.json'), JSON.stringify({ url: 'https://brain.test', token: 'legacy-file-token-canary' }));
    log = vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(() => fs.rmSync(ctx.dir, { recursive: true, force: true }));
  const out = () => log.mock.calls.flat().join('\n');

  it('reports the Auth-resolved token for the configured endpoint, naming the legacy file only as a context', async () => {
    ctx.resolve = vi.fn(async () => ({ token: 'resolved-token', source: 'auth' }));
    await relay(['status']);
    expect(ctx.resolve).toHaveBeenCalledWith({ url: 'https://brain.test', legacyBrainJson: [path.join(ctx.dir, 'config', 'brain.json')] });
    expect(out()).toContain('PAT configured');
    expect(out()).not.toMatch(/resolved-token|legacy-file-token-canary/);
  });

  it('reports Auth unavailable instead of using the legacy file token', async () => {
    ctx.resolve = vi.fn(async () => { throw new Error('Unlock auth to read the encrypted credential store'); });
    await relay(['status']);
    expect(out()).toContain('Auth:  unavailable (Unlock auth');
    expect(out()).not.toContain('PAT configured');
    expect(out()).not.toContain('legacy-file-token-canary');
  });

  it('reports no token when the owner returns none for this origin', async () => {
    ctx.resolve = vi.fn(async () => ({ token: null, source: null, reason: 'origin-mismatch' }));
    await relay(['status']);
    expect(out()).toContain('no token');
  });
});
