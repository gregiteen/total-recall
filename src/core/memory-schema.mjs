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
  // SSSS 0.9 universal frontmatter (§4.2) is `type`/`title`/`description`/
  // `timestamp`. `timestamp` was not declared here at all, so nothing in this
  // schema could notice its absence — which is how 743 of the 912 nodes in the
  // global vault ended up without one, and how all four scaffold seeds shipped
  // failing the package validator.
  //
  // Kept `.optional()` deliberately: writeNodeValidated() fills both fields
  // before this schema ever runs, so new writes are conformant, while the
  // historical nodes that predate that backfill still parse on READ. Tighten to
  // required only once those are migrated — otherwise recall breaks on the vault
  // it is meant to read.
  description: z.string().optional(),
  // ssssDatetime(), not z.string(): YAML parses an unquoted ISO timestamp into a
  // Date, so a plain string check rejects the very frontmatter the vault writes.
  // The preprocessor normalizes Date -> ISO string, which is why every other
  // datetime field in this file uses it.
  timestamp: ssssDatetime().optional(),
  resource: z.string().optional(),
  // `archived` is a first-class Total Recall status, not a legacy artifact:
  // repo-sync rewrites ingested nodes to it, clarity-rewriter sets it when a
  // correction deletes a fact, fact-seeker and remember use it, and dream and
  // the API both read it. The enum simply never listed it, so 574 nodes — the
  // most common status in the vault — failed validation against a rule the
  // host's own writers contradict. SSSS 0.9 puts no enum on memory.status at
  // all, so this is a host restriction, not a spec requirement.
  status: z.enum(['active', 'superseded', 'deprecated', 'draft', 'archived']),
  confidence: z.number().min(0).max(1).optional(),
  importance: z.number().int().min(1).max(5).optional(),
  created: ssssDatetime().optional(),
  updated: ssssDatetime().optional(),
  last_accessed: ssssDatetime().optional(),
  source: z.object({
    type: z.string(),
    session_id: z.string(),
    agent: z.string().optional(),
    evidence_count: z.number().int(),
  }).optional(),
  supersedes: z.array(z.string()).optional(),
  superseded_by: z.string().nullable().optional(),
  contradicts: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  related: z.array(z.string()).optional(),
  routes_to_skills: z.array(z.string()).optional(),
  sentiment_polarity: z.enum(['directive_must', 'directive_must_not', 'descriptive', 'preference']).optional(),
  sentiment_target: z.string().optional(),
  modality: z.enum(['must', 'must_not', 'should', 'should_not', 'descriptive', 'preference']).optional(),
  subject: z.string().regex(/^[a-zA-Z0-9_\s.-]+$/).optional(),
  predicate: z.string().regex(/^[a-zA-Z0-9_\s.-]+$/).optional(),
  object: z.string().optional(),
  decay: z.object({
    half_life_days: z.number(),
    access_count: z.number().int(),
  }).optional(),
  schema_version: z.literal(2),
  x_memory_layer: z.enum(MEMORY_LAYERS).optional(),
  project: z.string().optional(),
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
  priority: z.enum(['absolute', 'high', 'normal', 'low']).optional(),
  immutable: z.boolean().optional(),
  feedback_scope: z.enum(['local_thread', 'workspace', 'account', 'system_candidate', 'system_promoted']).optional()
}).superRefine((node, ctx) => {
  if (node.schema_version !== 2) return;
  for (const field of [
    'confidence',
    'importance',
    'modality',
    'subject',
    'predicate',
    'object',
    'sentiment_polarity',
  ]) {
    if (node[field] === undefined || node[field] === null || node[field] === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [field],
        message: `Required when schema_version is 2`,
      });
    }
  }
});

