import { describe, it, expect } from 'vitest';
import { atomicWrite, safeStringify, walkMd, loadNodes, loadMergedNodes, writeNode, deleteNode, createMemoryNode, loadSkills } from './vault.mjs';

describe('vault.mjs', () => {
  it('exports atomicWrite', () => {
    expect(atomicWrite).toBeDefined();
  });
  it('exports safeStringify', () => {
    expect(safeStringify).toBeDefined();
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
