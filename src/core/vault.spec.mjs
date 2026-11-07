import { describe, it, expect, vi } from 'vitest';
import matter from './frontmatter.mjs';

vi.mock('./logger.mjs', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
import { atomicWrite, safeStringify, walkMd, loadNodes, loadMergedNodes, writeNode, deleteNode, createMemoryNode, loadSkills } from './vault.mjs';

describe('vault.mjs', () => {
  it('exports atomicWrite', () => {
    expect(atomicWrite).toBeDefined();
  });
  it('serializes a body-leading YAML fence as text', () => {
    const body = '---\nimmutable: true\n---\nEvidence\n';
    const parsed = matter(safeStringify(body, { title: 'Evidence' }));
    expect(parsed.data).toEqual({ title: 'Evidence' });
    expect(parsed.content).toBe(body);
  });
  it('exports walkMd', () => {
    expect(walkMd).toBeDefined();
  });
  it('exports loadNodes', () => {
    expect(loadNodes).toBeDefined();
  });
  it('exports loadMergedNodes', () => {
    expect(loadMergedNodes).toBeDefined();
  });
  it('exports writeNode', () => {
    expect(writeNode).toBeDefined();
  });
  it('exports deleteNode', () => {
    expect(deleteNode).toBeDefined();
  });
  it('exports createMemoryNode', () => {
    expect(createMemoryNode).toBeDefined();
  });
  it('exports loadSkills', () => {
    expect(loadSkills).toBeDefined();
  });
});
