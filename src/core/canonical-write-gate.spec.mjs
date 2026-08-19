// @vitest-environment node
/**
 * Regression gate: no module may write a vault node without going through the
 * SSSS Core Contract.
 *
 * The previous version of this detector was wrong in both directions. It
 * flagged `writeNode(` — which IS the contract path, since vault.writeNode
 * delegates to writeNodeValidatedAsync — so eleven compliant modules reported
 * as violations and the list read as noise. Meanwhile it only matched
 * `atomicWrite(..."....md")`, so every bypass with a variable target slipped
 * through, including the two that mattered most: dream.writeDailyNote
 * (hand-assembled YAML) and conclusion-writer.promoteToVault (the doorway every
 * research-derived fact enters the vault through).
 *
 * A detector nobody believes is worse than no detector, so this asserts both
 * halves: the real bypasses are gone, AND the gate still catches one.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import matter from 'gray-matter';
import { fileURLToPath } from 'node:url';
import { listUnapprovedCanonicalWriters } from './ssss-kernel-bridge.mjs';
import { updateNodeInPlace, resolveVaultDir } from './validated-write.mjs';
import { isSafeVaultName, deleteNode } from './vault.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('canonical write gate', () => {
  it('reports zero vault-node bypasses in src/core', () => {
    const writers = listUnapprovedCanonicalWriters(path.join(ROOT, 'src', 'core'));
    const detail = writers
      .flatMap((w) => w.offenses.map((o) => `${w.file}:${o.line} ${o.source}`))
      .join('\n');
    expect(detail).toBe('');
    expect(writers).toHaveLength(0);
  });

  it('catches a raw vault write that has no waiver', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-gate-'));
    fs.writeFileSync(path.join(dir, 'offender.mjs'), [
      "export function save(node, vaultDir) {",
      "  atomicWrite(path.join(vaultDir, 'facts', `${node.slug}.md`), render(node));",
      "}",
      '',
    ].join('\n'));

    const writers = listUnapprovedCanonicalWriters(dir);
    expect(writers).toHaveLength(1);
    expect(writers[0].offenses[0].line).toBe(2);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('honours a per-site waiver but not a neighbouring write', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-gate-'));
    fs.writeFileSync(path.join(dir, 'mixed.mjs'), [
      "export function save(a, b, vaultDir) {",
      "  // ssss-raw-write: bundle manifest, not a node",
      "  fs.writeFileSync(path.join(vaultDir, 'index.md'), a);",
      "  fs.writeFileSync(path.join(vaultDir, 'facts', 'b.md'), b);",
      "}",
      '',
    ].join('\n'));

    const writers = listUnapprovedCanonicalWriters(dir);
    expect(writers).toHaveLength(1);
    expect(writers[0].offenses).toHaveLength(1);
    expect(writers[0].offenses[0].line).toBe(4);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('updateNodeInPlace', () => {
  let vaultDir;

  beforeEach(() => {
    vaultDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tr-vault-')), 'memory-vault');
    fs.mkdirSync(path.join(vaultDir, 'facts'), { recursive: true });
    fs.mkdirSync(path.join(vaultDir, 'daily'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(path.dirname(vaultDir), { recursive: true, force: true });
  });

  function seed(category, slug, extra = {}) {
    const file = path.join(vaultDir, category, `${slug}.md`);
    fs.writeFileSync(file, matter.stringify('body text', {
      type: 'memory', slug, category, title: slug, confidence: 0.5, ...extra,
    }));
    return file;
  }

  it('backfills the universal fields a legacy node is missing', async () => {
    const file = seed('facts', 'legacy-node');
    const result = await updateNodeInPlace(file, (data) => { data.confidence = 0.9; });

    expect(result.success).toBe(true);
    const { data } = matter(fs.readFileSync(file, 'utf8'));
    expect(data.confidence).toBe(0.9);
    expect(data.description).toBeTruthy();
    expect(data.timestamp).toBeTruthy();
  });

  it('keeps a node in its original folder when the category is remapped', async () => {
    // `daily` is outside the closed memory-category enum, so the contract
    // remaps it to `facts` + a folder: tag. Without the path override the node
    // would be rewritten under facts/ and the original left as an orphan.
    const file = seed('daily', '2026-08-18');
    const result = await updateNodeInPlace(file, (data) => { data.confidence = 1.0; });

    expect(result.success).toBe(true);
    expect(fs.existsSync(file)).toBe(true);
    expect(fs.existsSync(path.join(vaultDir, 'facts', '2026-08-18.md'))).toBe(false);
    const { data } = matter(fs.readFileSync(file, 'utf8'));
    expect(data.tags).toContain('folder:daily');
  });

  it('returns a failure instead of throwing for a missing file', async () => {
    const result = await updateNodeInPlace(path.join(vaultDir, 'facts', 'nope.md'), () => {});
    expect(result.success).toBe(false);
  });

  it('resolves the vault root from a node path', () => {
    expect(resolveVaultDir(path.join(vaultDir, 'facts', 'x.md'))).toBe(vaultDir);
  });
});

describe('isSafeVaultName', () => {
  // The slug becomes a path segment in path.join(vaultDir, category, slug+'.md'),
  // so the property under test is that nothing can escape that directory. The
  // original rule enforced that by banning dots entirely, which also rejected
  // thousands of real nodes ingested from repos with domain-style names.
  it('accepts a dot inside the name', () => {
    expect(isSafeVaultName('example.com-modules-apis')).toBe(true);
    expect(isSafeVaultName('repo-example.com-aider-rules')).toBe(true);
  });

  it('accepts ordinary slugs', () => {
    expect(isSafeVaultName('some-node_1')).toBe(true);
  });

  it('rejects every traversal construct', () => {
    const bad = ['..', '.', '../etc', 'a/../b', 'a..b', '.hidden', '-leading',
      'a/b', 'a\\b', '', 'a b', 'a:b'];
    for (const value of bad) {
      expect(isSafeVaultName(value), `expected ${JSON.stringify(value)} to be rejected`).toBe(false);
    }
  });

  it('refuses to delete through a traversing slug', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-del-'));
    const vault = path.join(dir, 'memory-vault');
    fs.mkdirSync(path.join(vault, 'facts'), { recursive: true });
    const outside = path.join(dir, 'secret.md');
    fs.writeFileSync(outside, 'do not delete');

    expect(deleteNode('../../secret', vault)).toBe(false);
    expect(fs.existsSync(outside)).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
