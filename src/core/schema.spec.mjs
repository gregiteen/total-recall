import { describe, it, expect } from 'vitest';
import {
  MemoryNodeSchema,
  ConflictRecordSchema,
  TaskSchema,
  ProposalSchema,
  SchemaProposalSchema,
  MigrationSchema,
  ReleaseSchema,
} from './schema.mjs';

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
        schema_version: 2,
        x_memory_layer: 'conscious'
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

    it('rejects an unknown memory layer', () => {
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
        schema_version: 2,
        x_memory_layer: 'unknown-layer'
      };

      const result = MemoryNodeSchema.safeParse(node);
      expect(result.success).toBe(false);
    });

    it('validates strict symbolic subject and predicate and rejects non-conforming prose', () => {
      const baseNode = {
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

      const validCases = [
        { subject: 'agent-1', predicate: 'do_thing' },
        { subject: 'user.profile', predicate: 'has memory' },
        { subject: 'AI_Core', predicate: 'is-active' }
      ];
      for (const tc of validCases) {
        const result = MemoryNodeSchema.safeParse({ ...baseNode, ...tc });
        expect(result.success).toBe(true);
      }

      const invalidCases = [
        { subject: 'agent@home', predicate: 'do_thing' },
        { subject: 'agent', predicate: 'do_thing!' },
        { subject: 'user (with parenthetical text)', predicate: 'reads' }
      ];
      for (const tc of invalidCases) {
        const result = MemoryNodeSchema.safeParse({ ...baseNode, ...tc });
        expect(result.success).toBe(false);
      }
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

    it('validates a System 2 deliberation task', () => {
      const task = {
        type: 'task',
        priority: 2,
        category: 'system2-deliberation',
        target: 'memory-layer-synthesis',
        status: 'pending',
        x_memory_layer: 'system2',
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

  describe('ProposalSchema', () => {
    it('validates a correct proposal', () => {
      const proposal = {
        type: 'proposal',
        proposal_id: 'prop-2026-05-15-001',
        category: 'memory-cleanup',
        status: 'pending',
        target_path: '.agent/memory-vault/patterns/stale-node.md',
        summary: 'Remove stale node with 0 access in 90 days',
        rationale: 'Confidence decayed below 0.1',
        proposed_by: 'dream-cycle',
        proposed_at: new Date().toISOString(),
        reviewed_at: null,
        reviewed_by: null,
        rejection_reason: null,
      };
      const result = ProposalSchema.safeParse(proposal);
      expect(result.success).toBe(true);
    });

    it('rejects invalid proposal category', () => {
      const result = ProposalSchema.safeParse({
        type: 'proposal',
        proposal_id: 'p1',
        category: 'invalid-cat',
        status: 'pending',
        summary: 'test',
        proposed_by: 'test',
        proposed_at: new Date().toISOString(),
      });
      expect(result.success).toBe(false);
    });
  });

  describe('SchemaProposalSchema', () => {
    it('validates a correct schema proposal', () => {
      const schemaProposal = {
        type: 'schema-proposal',
        proposal_id: 'sp-2026-05-15-001',
        status: 'draft',
        from_version: 2,
        to_version: 3,
        summary: 'Add vector_embedding field to memory nodes',
        breaking: false,
        proposed_by: 'admin',
        proposed_at: new Date().toISOString(),
      };
      const result = SchemaProposalSchema.safeParse(schemaProposal);
      expect(result.success).toBe(true);
    });

    it('rejects incomplete schema proposal', () => {
      const result = SchemaProposalSchema.safeParse({ type: 'schema-proposal' });
      expect(result.success).toBe(false);
    });
  });

  describe('MigrationSchema', () => {
    it('validates a correct migration', () => {
      const migration = {
        type: 'migration',
        migration_id: 'mig-v2-to-v3',
        from_version: 2,
        to_version: 3,
        status: 'pending',
        description: 'Add vector_embedding field with null default',
      };
      const result = MigrationSchema.safeParse(migration);
      expect(result.success).toBe(true);
    });

    it('rejects incomplete migration', () => {
      const result = MigrationSchema.safeParse({ type: 'migration' });
      expect(result.success).toBe(false);
    });
  });

  describe('ReleaseSchema', () => {
    it('validates a correct release', () => {
      const release = {
        type: 'release',
        release_id: 'rel-3.1.0',
        version: '3.1.0',
        schema_version: 3,
        summary: 'Added proposal and migration file types',
        released_at: new Date().toISOString(),
      };
      const result = ReleaseSchema.safeParse(release);
      expect(result.success).toBe(true);
    });

    it('rejects incomplete release', () => {
      const result = ReleaseSchema.safeParse({ type: 'release' });
      expect(result.success).toBe(false);
    });
  });
});
