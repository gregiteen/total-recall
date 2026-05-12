import { z } from 'zod';

export const MemoryNodeSchema = z.object({
  type: z.literal('memory'),
  slug: z.string(),
  category: z.string(),
  title: z.string(),
  status: z.enum(['active', 'superseded', 'deprecated', 'draft']),
  confidence: z.number().min(0).max(1),
  importance: z.number().int().min(1).max(5),
  created: z.string().datetime(),
  updated: z.string().datetime(),
  last_accessed: z.string().datetime(),
  source: z.object({
    type: z.string(),
    session_id: z.string(),
    agent: z.string().optional(),
    evidence_count: z.number().int(),
  }),
  supersedes: z.array(z.string()),
  superseded_by: z.string().nullable(),
  contradicts: z.array(z.string()),
  tags: z.array(z.string()),
  related: z.array(z.string()),
  routes_to_skills: z.array(z.string()),
  sentiment_polarity: z.enum(['directive_must', 'directive_must_not', 'descriptive', 'preference']),
  sentiment_target: z.string(),
  modality: z.enum(['must', 'must_not', 'should', 'should_not']),
  subject: z.string(),
  predicate: z.string(),
  object: z.string(),
  decay: z.object({
    half_life_days: z.number(),
    access_count: z.number().int(),
  }),
  schema_version: z.literal(2),
  // Absolute Invariant Extensions
  priority: z.literal('absolute').optional(),
  immutable: z.boolean().optional()
});

export const ConflictRecordSchema = z.object({
  type: z.literal('conflict'),
  conflict_id: z.string(),
  status: z.enum(['pending', 'resolved']),
  new_slug: z.string(),
  existing_slug: z.string(),
  similarity: z.number(),
  polarity_flip: z.boolean(),
  detected_at: z.string().datetime(),
  reason: z.string(),
  resolution: z.string().nullable(),
  resolved_at: z.string().datetime().nullable(),
});

export const TaskSchema = z.object({
  type: z.literal('task'),
  priority: z.number().int(),
  category: z.enum([
    'memory-maintenance',
    'skill-engineering',
    'proactive-research',
    'self-evaluation',
    'exploration'
  ]),
  target: z.string(),
  estimated_calls: z.number().int(),
  deadline: z.string(),
  created_by: z.string(),
  reason: z.string(),
  status: z.enum(['pending', 'in-progress', 'completed', 'failed']),
  progress: z.number()
});

export const SubQuerySchema = z.object({
  queries: z.array(z.string().describe("Specific search queries to resolve the user's overarching research request")),
  reasoning: z.string().describe("Explanation for why these sub-queries are necessary")
});
