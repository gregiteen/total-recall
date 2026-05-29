import { z } from 'zod';
import { MEMORY_LAYERS } from './memory-layers.mjs';

// gray-matter parses ISO 8601 strings into JS Date objects.
// This helper coerces Date → ISO string so Zod validators work
// regardless of whether input comes from parsed YAML or raw JSON.
const ssssDatetime = () =>
  z.preprocess(
    (val) => (val instanceof Date ? val.toISOString() : val),
    z.string().datetime()
  );

const ssssDatetimeNullable = () =>
  z.preprocess(
    (val) => (val instanceof Date ? val.toISOString() : val),
    z.string().datetime().nullable()
  );

// ─── Document Primitives (§5.1 of the SSSS spec) ───────────────────────────

export const MemoryNodeSchema = z.object({
  type: z.literal('memory'),
  slug: z.string(),
  category: z.string(),
  title: z.string(),
  status: z.enum(['active', 'superseded', 'deprecated', 'draft']),
  confidence: z.number().min(0).max(1),
  importance: z.number().int().min(1).max(5),
  created: ssssDatetime(),
  updated: ssssDatetime(),
  last_accessed: ssssDatetime(),
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
  subject: z.string().regex(/^[a-zA-Z0-9_\s.-]+$/),
  predicate: z.string().regex(/^[a-zA-Z0-9_\s.-]+$/),
  object: z.string(),
  decay: z.object({
    half_life_days: z.number(),
    access_count: z.number().int(),
  }),
  schema_version: z.literal(2),
  x_memory_layer: z.enum(MEMORY_LAYERS).optional(),
  x_temporal_context: z.preprocess((val) => (val instanceof Date ? val.toISOString() : val), z.string()).optional(),
  x_citations: z.array(
    z.object({
      source: z.string().optional(),
      title: z.string().optional(),
      url: z.string().optional(),
      published: z.preprocess((val) => (val instanceof Date ? val.toISOString() : val), z.string()).optional(),
      relevance: z.number().optional(),
      accessed: z.preprocess((val) => (val instanceof Date ? val.toISOString() : val), z.string()).optional(),
    })
  ).optional(),
  x_location: z.object({
    lat: z.number(),
    lon: z.number(),
    label: z.string().optional(),
    accuracy: z.number().optional(),
  }).optional().nullable(),
  x_media_refs: z.array(z.object({
    path: z.string(),
    type: z.enum(['image', 'audio', 'video', 'document']),
    description: z.string().optional(),
    size_bytes: z.number().optional(),
  })).optional().nullable(),
  x_browser_context: z.object({
    url: z.string(),
    domain: z.string().optional(),
    title: z.string().optional(),
    tab_group: z.string().optional(),
    visit_count: z.number().optional(),
  }).optional().nullable(),
  // Temporal rule expiration
  expires_at: ssssDatetimeNullable().optional(),
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
  detected_at: ssssDatetime(),
  reason: z.string(),
  resolution: z.string().nullable(),
  resolved_at: ssssDatetimeNullable(),
});

export const TaskSchema = z.object({
  type: z.literal('task'),
  priority: z.number().int(),
  category: z.enum([
    'memory-maintenance',
    'system2-deliberation',
    'skill-engineering',
    'proactive-research',
    'self-evaluation',
    'exploration'
  ]),
  status: z.enum(['pending', 'in_progress', 'done', 'failed']),
  target: z.string().optional(),
  estimated_calls: z.number().int().optional(),
  deadline: z.preprocess(
    (val) => (val instanceof Date ? val.toISOString() : val),
    z.string()
  ).optional(),
  created_by: z.string().optional(),
  reason: z.string().optional(),
  workflow_id: z.string().optional(),
  progress: z.number().optional(),
  x_memory_layer: z.enum(MEMORY_LAYERS).optional(),
});

export const SkillSchema = z.object({
  type: z.literal('skill').optional(), // Optional per spec: real skills may omit type
  name: z.string(),
  description: z.string(),
});

export const AssistantSchema = z.object({
  type: z.literal('assistant'),
  name: z.string(),
  description: z.string().optional(),
  model: z.string().optional(),
});

export const WorkflowSchema = z.object({
  type: z.literal('workflow'),
  name: z.string(),
  description: z.string().optional(),
  triggers: z.array(z.object({
    type: z.string(),
    cron: z.string().optional(),
  })).optional(),
  isActive: z.boolean().optional(),
});

export const RuleSchema = z.object({
  type: z.literal('rule'),
  name: z.string(),
  description: z.string().optional(),
  scope: z.string().optional(),
});

export const ModelSchema = z.object({
  type: z.literal('model'),
  model_id: z.string(),
  provider: z.string(),
  display_name: z.string().optional(),
});

export const ConversationSchema = z.object({
  type: z.literal('conversation'),
  thread_id: z.string(),
  workspace_id: z.string().optional(),
  user_id: z.string().optional(),
  status: z.enum(['active', 'archived', 'closed']).optional(),
  turn_count: z.number().int().optional(),
  created_at: ssssDatetime().optional(),
});

export const RunSchema = z.object({
  type: z.literal('run'),
  run_id: z.string(),
  workflow_id: z.string(),
  status: z.enum(['pending', 'running', 'done', 'failed']).optional(),
  step_count: z.number().int().optional(),
  started_at: ssssDatetime().optional(),
});

export const ProposalSchema = z.object({
  type: z.literal('proposal'),
  proposal_id: z.string(),
  category: z.enum([
    'memory-cleanup',
    'skill-improvement',
    'workflow-repair',
    'model-routing',
    'stale-knowledge-refresh',
    'tool-adapter',
    'schema-friction',
  ]),
  status: z.enum(['draft', 'pending', 'accepted', 'rejected', 'superseded']),
  target_path: z.string().optional(),
  summary: z.string(),
  rationale: z.string().optional(),
  proposed_by: z.string(),
  proposed_at: ssssDatetime(),
  reviewed_at: ssssDatetimeNullable().optional(),
  reviewed_by: z.string().nullable().optional(),
  rejection_reason: z.string().nullable().optional(),
});

export const SchemaProposalSchema = z.object({
  type: z.literal('schema-proposal'),
  proposal_id: z.string(),
  status: z.enum(['draft', 'pending', 'accepted', 'rejected']),
  from_version: z.number().int(),
  to_version: z.number().int(),
  summary: z.string(),
  breaking: z.boolean(),
  migration_path: z.string().optional(),
  proposed_by: z.string(),
  proposed_at: ssssDatetime(),
  reviewed_at: ssssDatetimeNullable().optional(),
  reviewed_by: z.string().nullable().optional(),
});

export const MigrationSchema = z.object({
  type: z.literal('migration'),
  migration_id: z.string(),
  from_version: z.number().int(),
  to_version: z.number().int(),
  status: z.enum(['pending', 'applied', 'rolled-back', 'failed']),
  description: z.string(),
  applied_at: ssssDatetimeNullable().optional(),
  checksum: z.string().optional(),
});

export const ReleaseSchema = z.object({
  type: z.literal('release'),
  release_id: z.string(),
  version: z.string(),
  schema_version: z.number().int(),
  summary: z.string(),
  released_at: ssssDatetime(),
  signed_by: z.string().optional(),
  signature: z.string().optional(),
  changelog: z.string().optional(),
});

// ─── Contract Primitives (§5.2, §6 of the SSSS spec) ───────────────────────

export const OperationEnvelopeSchema = z.object({
  type: z.literal('operation'),
  idempotency_key: z.string().min(8),
  path: z.string(),
  workspace_id: z.string(),
  content: z.string(),
  lease_id: z.string().optional(),
  intent: z.string().optional(),
  dry_run: z.boolean().optional(),
});

export const PatchEnvelopeSchema = z.object({
  type: z.literal('patch'),
  idempotency_key: z.string().min(8),
  path: z.string(),
  workspace_id: z.string(),
  patches: z.record(z.unknown()),
  lease_id: z.string().optional(),
  intent: z.string().optional(),
  dry_run: z.boolean().optional(),
});

export const EventEnvelopeSchema = z.object({
  type: z.literal('event'),
  idempotency_key: z.string().min(8),
  path: z.string(),
  workspace_id: z.string(),
  content: z.string(),
  lease_id: z.string().optional(),
  intent: z.string().optional(),
});

// ─── Operation Response (§6.4 of the SSSS spec) ────────────────────────────

export const OperationResponseSchema = z.object({
  success: z.boolean(),
  type: z.enum(['operation', 'patch', 'event']),
  operation_id: z.string(),
  path: z.string(),
  committed_at: z.string().datetime().nullable(),
  dry_run: z.boolean().optional(),
  validation: z.object({
    valid: z.boolean(),
    type: z.string().optional(),
    errors: z.array(z.string()),
    warnings: z.array(z.string()),
  }),
  replay: z.record(z.unknown()).optional(),
  repair: z.object({
    field_errors: z.array(z.object({
      field: z.string(),
      issue: z.string(),
    })),
  }).optional(),
});

// ─── Derived / Utility Schemas ──────────────────────────────────────────────

export const SubQuerySchema = z.object({
  queries: z.array(z.string().describe("Specific search queries to resolve the user's overarching research request")),
  reasoning: z.string().describe("Explanation for why these sub-queries are necessary")
});

// ─── Schema Registry (§5 of the SSSS spec) ─────────────────────────────────

/** Map from SSSS `type` value to its Zod schema. Used by the operation validator. */
export const SSSS_SCHEMAS = {
  memory: MemoryNodeSchema,
  conflict: ConflictRecordSchema,
  task: TaskSchema,
  skill: SkillSchema,
  assistant: AssistantSchema,
  workflow: WorkflowSchema,
  rule: RuleSchema,
  model: ModelSchema,
  conversation: ConversationSchema,
  run: RunSchema,
  proposal: ProposalSchema,
  'schema-proposal': SchemaProposalSchema,
  migration: MigrationSchema,
  release: ReleaseSchema,
};
