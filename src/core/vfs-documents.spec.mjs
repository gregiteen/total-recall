import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  findVfsDocumentByPath,
  findVfsDocumentByType,
  listVfsDocuments,
  listVfsDocumentsUnder,
} from './vfs-documents.mjs';

const roots = [];

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-vfs-docs-'));
  roots.push(root);
  fs.mkdirSync(path.join(root, 'system'), { recursive: true });
  fs.writeFileSync(path.join(root, 'system', 'network-policy.md'), `---
type: network_policy
title: Network Policy
description: Test policy
timestamp: 2026-07-16T00:00:00Z
status: active
blocked_domains: []
allowed_domains: []
domain_limits: {}
---
Policy body
`);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('vfs-documents', () => {
  it('loads host extension documents instead of filtering to memory nodes', () => {
    const root = fixture();
    const docs = listVfsDocuments(root);
    expect(docs).toHaveLength(1);
    expect(docs[0].frontmatter.type).toBe('network_policy');
    expect(docs[0].vfs_path).toBe('system/network-policy.md');
  });

  it('finds by type and canonical path', () => {
    const root = fixture();
    expect(findVfsDocumentByType('network_policy', root)?.title).toBe('Network Policy');
    expect(findVfsDocumentByPath('system/network-policy.md', root)?.body).toBe('Policy body');
    expect(listVfsDocumentsUnder('system', root)).toHaveLength(1);
    expect(findVfsDocumentByPath('../outside.md', root)).toBeNull();
  });
});
