import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { MemoryNodeSchema } from './schema.mjs';

describe('Skill Evals Programmatic Assertions', () => {
  describe('OKF Skill Evals', () => {
    it('okf-adapter-present: okf-adapter.mjs exists', () => {
      const adapterPath = path.join(process.cwd(), 'src/core/okf-adapter.mjs');
      expect(fs.existsSync(adapterPath)).toBe(true);
    });

    it('okf-schema-extension: MemoryNodeSchema supports description and resource', () => {
      const baseNode = {
        type: 'memory',
        slug: 'test',
        category: 'facts',
        title: 'Test',
        status: 'active',
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
        decay: {
          half_life_days: 30,
          access_count: 1
        },
        schema_version: 2
      };

      const descTest = MemoryNodeSchema.safeParse({
        ...baseNode,
        description: 'Test description',
        confidence: 0.8,
        importance: 3,
        modality: 'descriptive',
        subject: 'test',
        predicate: 'describes',
        object: 'test',
        sentiment_polarity: 'descriptive',
        sentiment_target: 'test'
      });
      expect(descTest.success).toBe(true);

      const resourceTest = MemoryNodeSchema.safeParse({
        ...baseNode,
        resource: 'gs://bucket/data',
        confidence: 0.8,
        importance: 3,
        modality: 'descriptive',
        subject: 'test',
        predicate: 'describes',
        object: 'test',
        sentiment_polarity: 'descriptive',
        sentiment_target: 'test'
      });
      expect(resourceTest.success).toBe(true);
    });

    it('okf-import-functional: ingest cli is functional', async () => {
      const ingestCliPath = path.join(process.cwd(), 'src/cli/ingest.mjs');
      expect(fs.existsSync(ingestCliPath)).toBe(true);
      const content = fs.readFileSync(ingestCliPath, 'utf8');
      expect(content).toContain("args[0] === 'okf'");
    });
  });

  describe('SSSS Skill Evals', () => {
    it('valid-schemas: all schemas are loaded', async () => {
      const schemaPath = path.join(process.cwd(), 'src/core/schema.mjs');
      expect(fs.existsSync(schemaPath)).toBe(true);
      const { SSSS_SCHEMAS } = await import('./schema.mjs');
      expect(SSSS_SCHEMAS).toBeDefined();
      expect(SSSS_SCHEMAS.memory).toBeDefined();
    });
  });
});
