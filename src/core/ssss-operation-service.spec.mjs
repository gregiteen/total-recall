import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { deleteVfsDocument, patchVfsDocument, writeVfsDocument } from './ssss-operation-service.mjs';

const roots = [];
function tempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-ssss-service-'));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('ssss-operation-service', () => {
  it('writes, patches, and deletes a host extension document through the package kernel', async () => {
    const vaultRoot = tempRoot();
    const vfsPath = 'system/network-policy.md';
    const options = { vaultRoot, actorRole: 'system' };
    const created = await writeVfsDocument(vfsPath, {
      type: 'network_policy',
      id: 'network-policy',
      title: 'Network Policy',
      description: 'Test network policy',
      timestamp: '2026-07-16T00:00:00Z',
      status: 'active',
      blocked_domains: [],
      allowed_domains: [],
      domain_limits: {},
    }, 'Test policy.', options);
    expect(created.success).toBe(true);

    const patched = await patchVfsDocument(vfsPath, { blocked_domains: ['blocked.example'] }, options);
    expect(patched.success).toBe(true);
    expect(fs.readFileSync(path.join(vaultRoot, vfsPath), 'utf8')).toContain('blocked.example');

    const deleted = await deleteVfsDocument(vfsPath, options);
    expect(deleted.success).toBe(true);
    expect(fs.existsSync(path.join(vaultRoot, vfsPath))).toBe(false);
  });
});
