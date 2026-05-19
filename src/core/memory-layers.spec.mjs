import { describe, expect, it } from 'vitest';
import {
  buildMemoryLayerIndex,
  inferMemoryLayer,
  memoryLayerRoutingWeight,
  normalizeMemoryLayer
} from './memory-layers.mjs';

describe('memory layers', () => {
  it('normalizes user-facing layer names to SSSS layer identifiers', () => {
    expect(normalizeMemoryLayer('conscious')).toBe('conscious');
    expect(normalizeMemoryLayer('system 2')).toBe('system2');
    expect(normalizeMemoryLayer('knowledge-acquisition')).toBe('research');
  });

  it('uses explicit x_memory_layer before inference', () => {
    expect(inferMemoryLayer({
      x_memory_layer: 'research',
      category: 'invariants',
      priority: 'absolute',
    })).toBe('research');
  });

  it('infers the conscious layer for absolute or behavioral memory', () => {
    expect(inferMemoryLayer({ category: 'invariants', priority: 'absolute' })).toBe('conscious');
    expect(inferMemoryLayer({ category: 'preferences' })).toBe('conscious');
  });

  it('infers the research layer for web-backed facts', () => {
    expect(inferMemoryLayer({
      category: 'facts',
      source: { type: 'web-search' },
      tags: ['research'],
    })).toBe('research');
  });

  it('builds a layer index line for each node', () => {
    const index = buildMemoryLayerIndex([
      { slug: 'hot-rule', category: 'invariants', status: 'active', confidence: 1, importance: 5, title: 'Hot rule' },
      { slug: 'research-fact', category: 'facts', status: 'draft', confidence: 0.7, importance: 3, title: 'Research fact' },
    ]);

    expect(index).toHaveLength(2);
    expect(index[0].layer).toBe('conscious');
    expect(index[1].layer).toBe('research');
  });

  it('weights conscious memories higher than research drafts for routing', () => {
    expect(memoryLayerRoutingWeight('conscious')).toBeGreaterThan(memoryLayerRoutingWeight('research'));
  });
});
