import { describe, it, expect } from 'vitest';
import { MemoryNodeSchema, ConflictRecordSchema, TaskSchema } from './schema.mjs';

describe('Schema Validations', () => {
  describe('MemoryNodeSchema', () => {
    it('validates a correct memory node', () => {
      const node = {
        type: 'memory',
        slug: 'test-node',
        category: 'test',
        title: 'Test Node',
        status: 'active',
        confidence: 0.9,
        importance: 3,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        last_accessed: new Date().toISOString(),
        source: {
          type: 'user',
          session_id: '123',
          evidence_count: 1
        },
        supersedes: [],
        superseded_by: null,
        contradicts: [],
        tags: ['test'],
        related: [],
        routes_to_skills: [],
        sentiment_polarity: 'descriptive',
        sentiment_target: 'system',
        modality: 'should',
        subject: 'agent',
        predicate: 'tests',
        object: 'code',
        decay: {
          half_life_days: 30,
          access_count: 5
        },
        schema_version: 2
      };
      
      const result = MemoryNodeSchema.safeParse(node);
      expect(result.success).toBe(true);
    });

    it('rejects invalid memory node', () => {
      const node = {
        type: 'memory',
        slug: 'test-node',
        // missing required fields
      };
      const result = MemoryNodeSchema.safeParse(node);
      expect(result.success).toBe(false);
    });
  });

  describe('ConflictRecordSchema', () => {
    it('validates a correct conflict record', () => {
      const conflict = {
        type: 'conflict',
        conflict_id: 'c-1',
        status: 'pending',
        new_slug: 'node-2',
        existing_slug: 'node-1',
        similarity: 0.95,
        polarity_flip: true,
        detected_at: new Date().toISOString(),
        reason: 'high jaccard similarity with polarity flip',
        resolution: null,
        resolved_at: null,
      };
      const result = ConflictRecordSchema.safeParse(conflict);
      expect(result.success).toBe(true);
    });
    
    it('rejects invalid conflict record', () => {
      const result = ConflictRecordSchema.safeParse({ type: 'conflict' });
      expect(result.success).toBe(false);
    });
  });

  describe('TaskSchema', () => {
    it('validates a correct task', () => {
      const task = {
        type: 'task',
        priority: 1,
        category: 'memory-maintenance',
        target: 'vault',
        estimated_calls: 5,
        deadline: new Date().toISOString(),
        created_by: 'watchdog',
        reason: 'cleanup',
        status: 'pending',
        progress: 0
      };
      const result = TaskSchema.safeParse(task);
      expect(result.success).toBe(true);
    });
    
    it('rejects invalid category', () => {
      const task = {
        type: 'task',
        priority: 1,
        category: 'unknown-category', // Invalid
        target: 'vault',
        estimated_calls: 5,
        deadline: new Date().toISOString(),
        created_by: 'watchdog',
        reason: 'cleanup',
        status: 'pending',
        progress: 0
      };
      const result = TaskSchema.safeParse(task);
      expect(result.success).toBe(false);
    });
  });
});
