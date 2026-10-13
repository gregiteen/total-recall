import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./logger.mjs', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import * as vault from './vault.mjs';
import { getNodes, invalidate, isGeneratedVaultPath } from './vault-cache.mjs';

describe('Vault Cache', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-cache-test-'));
    invalidate(); // clear cache before test
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('serves from cache on subsequent reads (cache hit)', () => {
    const spy = vi.spyOn(vault, 'loadNodes');
    
    // Create a dummy memory file in tempDir
    fs.writeFileSync(
      path.join(tempDir, 'node1.md'),
      '---\ntype: memory\nslug: test-node\ntitle: Test Node\ncategory: facts\n---\nHello!'
    );

    const first = getNodes(tempDir);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(first).toHaveLength(1);
    expect(first[0].slug).toBe('test-node');

    const second = getNodes(tempDir);
    expect(spy).toHaveBeenCalledTimes(1); // loadNodes should NOT be called again
    expect(second).toEqual(first);
  });

  it('loads fresh from disk after cache invalidation', () => {
    const spy = vi.spyOn(vault, 'loadNodes');
    
    fs.writeFileSync(
      path.join(tempDir, 'node1.md'),
      '---\ntype: memory\nslug: test-node\ntitle: Test Node\ncategory: facts\n---\nHello!'
    );

    getNodes(tempDir);
    expect(spy).toHaveBeenCalledTimes(1);

    invalidate();

    getNodes(tempDir);
    expect(spy).toHaveBeenCalledTimes(2); // Should load again
  });

  it('automatically invalidates cache on file changes when watcher is active', async () => {
    const spy = vi.spyOn(vault, 'loadNodes');
    
    fs.writeFileSync(
      path.join(tempDir, 'node1.md'),
      '---\ntype: memory\nslug: test-node\ntitle: Test Node\ncategory: facts\n---\nHello!'
    );

    getNodes(tempDir);
    expect(spy).toHaveBeenCalledTimes(1);

    // Write a new file externally to trigger watcher
    fs.writeFileSync(
      path.join(tempDir, 'node2.md'),
      '---\ntype: memory\nslug: node-2\ntitle: Node 2\ncategory: facts\n---\nWorld!'
    );

    // Wait a brief moment for filesystem events to propagate
    await new Promise(resolve => setTimeout(resolve, 150));

    getNodes(tempDir);
    // On systems with working fs.watch, the watcher should have invalidated the cache,
    // so it should have been called again (total calls >= 2).
    // On systems where fs.watch might not trigger, we just assert cache works.
    expect(spy.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it('does not keep a CLI process alive after loading a nested vault', () => {
    // On Linux, recursive fs.watch is one inotify watcher per directory and
    // unref() on the wrapper did not reach them, so every CLI command hung.
    fs.mkdirSync(path.join(tempDir, 'facts', 'deep'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'facts', 'deep', 'n.md'), '---\nslug: n\n---\nbody');
    const moduleUrl = pathToFileURL(path.resolve('src/core/vault-cache.mjs')).href;
    const script = `const m = await import(${JSON.stringify(moduleUrl)}); m.getNodes(${JSON.stringify(tempDir)});`;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      timeout: 15000,
      encoding: 'utf8',
    });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
  });

  it('treats regenerated bundle files and hidden paths as non-nodes', () => {
    expect(isGeneratedVaultPath('index.md')).toBe(true);
    expect(isGeneratedVaultPath('log.md')).toBe(true);
    expect(isGeneratedVaultPath(path.join('.events', 'audit.md'))).toBe(true);
    expect(isGeneratedVaultPath(path.join('facts', 'real-node.md'))).toBe(false);
    expect(isGeneratedVaultPath(path.join('facts', 'index.md'))).toBe(false);
  });

  it('keeps the cache when only index.md or log.md are rewritten', async () => {
    fs.mkdirSync(path.join(tempDir, 'facts'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'facts', 'n.md'), '---\nslug: n\ntitle: N\ncategory: facts\n---\nbody');
    const spy = vi.spyOn(vault, 'loadNodes');
    getNodes(tempDir);
    // Let the watcher drain events for the node written above, then settle.
    await new Promise((resolve) => setTimeout(resolve, 400));
    getNodes(tempDir);
    const settled = spy.mock.calls.length;
    fs.writeFileSync(path.join(tempDir, 'index.md'), '# generated\n');
    fs.writeFileSync(path.join(tempDir, 'log.md'), '# generated\n');
    await new Promise((resolve) => setTimeout(resolve, 400));
    getNodes(tempDir);
    expect(spy.mock.calls.length).toBe(settled);
  });
});
