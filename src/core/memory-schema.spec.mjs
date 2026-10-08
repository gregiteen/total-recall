import { it, expect } from 'vitest';
import { MemoryNodeSchema } from './memory-schema.mjs';
import { MemoryNodeSchema as legacySchema } from './schema.mjs';
import { validateMemoryNode } from './total-recall-memory-validator.mjs';

it('shares memory validation with existing consumers and normalizes YAML dates', () => {
  expect(legacySchema).toBe(MemoryNodeSchema);
  const node = {
    type: 'memory', slug: 'portable', category: 'facts', title: 'Portable memory',
    status: 'active', schema_version: 2, confidence: 1, importance: 3,
    modality: 'descriptive', subject: 'memory', predicate: 'is', object: 'portable',
    sentiment_polarity: 'descriptive', sentiment_target: 'memory', timestamp: new Date(),
  };
  expect(validateMemoryNode(node).success).toBe(true);
  expect(MemoryNodeSchema.parse(node).timestamp).toBe(node.timestamp.toISOString());
  expect(validateMemoryNode({ ...node, confidence: 2 }).success).toBe(false);
  expect(validateMemoryNode({ ...node, modality: undefined }).success).toBe(false);
});
