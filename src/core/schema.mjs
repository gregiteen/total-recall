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
  confidence: z.number().min(0).max(1).optional(),
  importance: z.number().int().min(1).max(5).optional(),
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
  sentiment_polarity: z.enum(['directive_must', 'directive_must_not', 'descriptive', 'preference']).optional(),
  sentiment_target: z.string().optional(),
  modality: z.enum(['must', 'must_not', 'should', 'should_not', 'descriptive', 'preference']).optional(),
  subject: z.string().regex(/^[a-zA-Z0-9_\s.-]+$/).optional(),
  predicate: z.string().regex(/^[a-zA-Z0-9_\s.-]+$/).optional(),
  object: z.string().optional(),
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
  priority: z.enum(['absolute', 'high', 'normal', 'low']).optional(),
  immutable: z.boolean().optional(),
  feedback_scope: z.enum(['local_thread', 'workspace', 'account', 'system_candidate', 'system_promoted']).optional()
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

// ─── Document Primitives (§5.1 of the SSSS spec) ───────────────────────────

export const ContactSchema = z.object({
  type: z.literal('contact'),
  name: z.string(),
  first_name: z.string().optional().nullable(),
  last_name: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  company: z.string().optional().nullable(),
  job_title: z.string().optional().nullable(),
  tags: z.array(z.unknown()).optional().nullable(),
  notes: z.string().optional().nullable(),
  source: z.string().optional().nullable(),
  contact_type: z.string().optional().nullable(),
  priority: z.string().optional().nullable(),
  relationship_strength: z.number().optional().nullable(),
  custom_fields: z.record(z.unknown()).optional().nullable(),
  db_id: z.string().optional().nullable(),
  owner_user_id: z.string().optional().nullable(),
  workspace_id: z.string().optional().nullable(),
});

export const CompanySchema = z.object({
  type: z.literal('company'),
  name: z.string(),
  domain: z.string().optional().nullable(),
  industry: z.string().optional().nullable(),
  website: z.string().optional().nullable(),
  db_id: z.string().optional().nullable(),
  workspace_id: z.string().optional().nullable(),
});

export const DealSchema = z.object({
  type: z.literal('deal'),
  name: z.string(),
  value: z.number(),
  stage: z.string(),
  contact_id: z.string().optional().nullable(),
  company_id: z.string().optional().nullable(),
  currency: z.string().optional().nullable(),
  probability: z.number().optional().nullable(),
  expected_close_date: z.string().optional().nullable(),
  is_archived: z.boolean().optional().nullable(),
  description: z.string().optional().nullable(),
  source: z.string().optional().nullable(),
  tags: z.array(z.unknown()).optional().nullable(),
  custom_fields: z.record(z.unknown()).optional().nullable(),
  db_id: z.string().optional().nullable(),
  workspace_id: z.string().optional().nullable(),
});

export const BrandSchema = z.object({
  type: z.literal('brand'),
  name: z.string(),
  version: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  colors: z.record(z.unknown()).optional().nullable(),
  typography: z.record(z.unknown()).optional().nullable(),
  rounded: z.record(z.unknown()).optional().nullable(),
  spacing: z.record(z.unknown()).optional().nullable(),
  components: z.record(z.unknown()).optional().nullable(),
  vibe: z.string().optional().nullable(),
  locale: z.string().optional().nullable(),
  assets: z.record(z.unknown()).optional().nullable(),
  brand_voice: z.array(z.unknown()).optional().nullable(),
  accessibility_palettes: z.record(z.unknown()).optional().nullable(),
  tagline: z.string().optional().nullable(),
});

export const DeploymentSchema = z.object({
  type: z.literal('deployment'),
  name: z.string(),
  slug: z.string(),
  status: z.string().optional().nullable(),
  runtime_url: z.string().optional().nullable(),
  mcp_config: z.record(z.unknown()).optional().nullable(),
  container_settings: z.record(z.unknown()).optional().nullable(),
  workspace_id: z.string().optional().nullable(),
  db_id: z.string().optional().nullable(),
});

export const ListingSchema = z.object({
  type: z.literal('listing'),
  name: z.string(),
  pricing_model: z.string(),
  credits_charge_rate: z.number().optional().nullable(),
  connected_stripe_account: z.string().optional().nullable(),
  is_published: z.boolean().optional().nullable(),
  workspace_id: z.string().optional().nullable(),
  db_id: z.string().optional().nullable(),
});

export const KnowledgeSchema = z.object({
  type: z.literal('knowledge'),
  name: z.string(),
  slug: z.string(),
  description: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  is_public: z.boolean().optional().nullable(),
  is_active: z.boolean().optional().nullable(),
  is_system_managed: z.boolean().optional().nullable(),
  shared_across_workspaces: z.boolean().optional().nullable(),
  settings: z.record(z.unknown()).optional().nullable(),
  workspace_id: z.string().optional().nullable(),
  db_id: z.string().optional().nullable(),
  user_id: z.string().optional().nullable(),
});

export const KnowledgeSourceSchema = z.object({
  type: z.literal('knowledge_source'),
  title: z.string(),
  knowledge_base_slug: z.string(),
  content: z.string().optional().nullable(),
  content_type: z.string().optional().nullable(),
  source_url: z.string().optional().nullable(),
  metadata: z.record(z.unknown()).optional().nullable(),
  embedding_vector: z.array(z.unknown()).optional().nullable(),
  workspace_id: z.string().optional().nullable(),
  db_id: z.string().optional().nullable(),
});

export const CalendarEventSchema = z.object({
  type: z.literal('calendar_event'),
  title: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  start_time: z.string(),
  end_time: z.string().optional().nullable(),
  timezone: z.string().optional().nullable(),
  all_day: z.boolean().optional().nullable(),
  event_type: z.string(),
  calendar_id: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  meeting_url: z.string().optional().nullable(),
  attendees: z.array(z.unknown()).optional().nullable(),
  location_context: z.record(z.unknown()).optional().nullable(),
  db_id: z.string().optional().nullable(),
  workspace_id: z.string().optional().nullable(),
  user_id: z.string().optional().nullable(),
  created_at: z.string().optional().nullable(),
  updated_at: z.string().optional().nullable(),
});

export const EventSchema = z.object({
  type: z.literal('event'),
  event_type: z.string(),
  thread_id: z.string().optional().nullable(),
  turn_index: z.number().optional().nullable(),
  rating: z.number().optional().nullable(),
  comment: z.string().optional().nullable(),
  comment_lang: z.string().optional().nullable(),
  timestamp: z.string().optional().nullable(),
  feedback_scope: z.enum(['local_thread', 'workspace', 'account', 'system_candidate', 'system_promoted']).optional().nullable(),
});

export const LanguageConventionSchema = z.object({
  type: z.literal('language_convention'),
  locale: z.string(),
  language_name: z.string(),
  keys: z.record(z.unknown()),
});

export const ProfileSchema = z.object({
  type: z.literal('profile'),
  user_id: z.string(),
  locale: z.string(),
  display_name: z.string().optional().nullable(),
  timezone: z.string().optional().nullable(),
  workspaces: z.array(z.unknown()).optional().nullable(),
  notification_preferences: z.record(z.unknown()).optional().nullable(),
});

export const SharingGroupSchema = z.object({
  type: z.literal('sharing_group'),
  name: z.string(),
  color: z.string(),
  description: z.string().optional().nullable(),
  owner_user_id: z.string(),
  members: z.array(z.unknown()).optional().nullable(),
  share_credits: z.boolean().optional().nullable(),
  share_skills: z.boolean().optional().nullable(),
  share_assistants: z.boolean().optional().nullable(),
  share_email_accounts: z.boolean().optional().nullable(),
  share_email_domains: z.boolean().optional().nullable(),
  share_phone_numbers: z.boolean().optional().nullable(),
  share_api_keys: z.boolean().optional().nullable(),
  share_knowledge_base: z.boolean().optional().nullable(),
  share_credentials: z.boolean().optional().nullable(),
  share_team_members: z.boolean().optional().nullable(),
  share_workflows: z.boolean().optional().nullable(),
  share_templates: z.boolean().optional().nullable(),
  share_branding: z.boolean().optional().nullable(),
  share_crm: z.boolean().optional().nullable(),
  share_integrations: z.boolean().optional().nullable(),
  share_notifications: z.boolean().optional().nullable(),
  share_deployments: z.boolean().optional().nullable(),
});

export const PageSchema = z.object({
  type: z.literal('page'),
  slug: z.string(),
  name: z.string(),
  icon: z.string().optional().nullable(),
  layout: z.string().optional().nullable(),
  sandbox_entry: z.string(),
  is_active: z.boolean().optional().nullable(),
  workspace_id: z.string().optional().nullable(),
  db_id: z.string().optional().nullable(),
});

export const VoicemailSchema = z.object({
  type: z.literal('voicemail'),
  mailbox_id: z.string(),
  caller_id: z.string().optional().nullable(),
  caller_name: z.string().optional().nullable(),
  duration_seconds: z.number(),
  recording_url: z.string(),
  recording_path: z.string().optional().nullable(),
  recording_size_bytes: z.number().optional().nullable(),
  transcript: z.string().optional().nullable(),
  transcript_confidence: z.number().optional().nullable(),
  transcription_status: z.string().optional().nullable(),
  is_urgent: z.boolean().optional().nullable(),
  is_read: z.boolean().optional().nullable(),
  is_deleted: z.boolean().optional().nullable(),
  folder: z.string().optional().nullable(),
  callback_number: z.string().optional().nullable(),
  inbox_item_id: z.string().optional().nullable(),
  workspace_id: z.string().optional().nullable(),
  user_id: z.string().optional().nullable(),
  db_id: z.string().optional().nullable(),
  created_at: z.string().optional().nullable(),
});

export const PersonalizationProfileSchema = z.object({
  type: z.literal('personalization_profile'),
  name: z.string(),
  slug: z.string(),
  user_id: z.string(),
  profile_type: z.string(),
  description: z.string().optional().nullable(),
  personalization_text: z.string().optional().nullable(),
  is_default: z.boolean().optional().nullable(),
  is_active: z.boolean().optional().nullable(),
  scope: z.string().optional().nullable(),
  workspace_id: z.string().optional().nullable(),
  attached_files: z.array(z.unknown()).optional().nullable(),
  active_times: z.array(z.unknown()).optional().nullable(),
});

export const AccountAssistantSchema = z.object({
  type: z.literal('account_assistant'),
  name: z.string(),
  user_id: z.string(),
  scope: z.string(),
  enabled: z.boolean(),
  description: z.string().optional().nullable(),
  system_message: z.string().optional().nullable(),
  avatar_url: z.string().optional().nullable(),
  color_theme: z.string().optional().nullable(),
  voice_id: z.string().optional().nullable(),
  is_receptionist_enabled: z.boolean().optional().nullable(),
  auto_answer_calls: z.boolean().optional().nullable(),
  verification_pin: z.string().optional().nullable(),
  greeting_known: z.string().optional().nullable(),
  greeting_unknown: z.string().optional().nullable(),
  routing_rules: z.array(z.unknown()).optional().nullable(),
  enabled_tabs: z.array(z.unknown()).optional().nullable(),
});

export const AccountMemorySchema = z.object({
  type: z.literal('account_memory'),
  title: z.string(),
  user_id: z.string(),
  category: z.string(),
  confidence: z.number().optional().nullable(),
  source: z.string().optional().nullable(),
});

export const AccountWorkflowSchema = z.object({
  type: z.literal('account_workflow'),
  name: z.string(),
  slug: z.string(),
  user_id: z.string(),
  scope: z.string(),
  description: z.string().optional().nullable(),
  enabled: z.boolean().optional().nullable(),
  trigger_type: z.string().optional().nullable(),
  trigger_config: z.record(z.unknown()).optional().nullable(),
  steps: z.array(z.unknown()).optional().nullable(),
  actions: z.array(z.unknown()).optional().nullable(),
  target_workspaces: z.array(z.unknown()).optional().nullable(),
  last_run: z.string().optional().nullable(),
  run_count: z.number().optional().nullable(),
});

export const WorkspaceTransferSchema = z.object({
  type: z.literal('workspace_transfer'),
  transfer_id: z.string(),
  source_user_id: z.string(),
  target_email: z.string(),
  workspace_id: z.string(),
  status: z.string(),
  initiated_at: z.string(),
  target_user_id: z.string().optional().nullable(),
  workspace_name: z.string().optional().nullable(),
  resolved_at: z.string().optional().nullable(),
  expires_at: z.string().optional().nullable(),
});

export const ExtensionSchema = z.object({
  type: z.literal('extension'),
  extension: z.string(),
  display_name: z.string(),
  owner_user_id: z.string().optional().nullable(),
  workspace_id: z.string().optional().nullable(),
  assistant_id: z.string().optional().nullable(),
  status: z.string(),
  voicemail_enabled: z.boolean().optional().nullable(),
  metadata: z.record(z.unknown()).optional().nullable(),
});

export const PhoneNumberSchema = z.object({
  type: z.literal('phone_number'),
  phone_number: z.string(),
  provider: z.string(),
  provider_number_id: z.string().optional().nullable(),
  receptionist_id: z.string().optional().nullable(),
  status: z.string(),
  workspace_id: z.string().optional().nullable(),
  user_id: z.string().optional().nullable(),
});

export const DomainSchema = z.object({
  type: z.literal('domain'),
  domain_name: z.string(),
  registrar: z.string(),
  status: z.string(),
  payment_status: z.string(),
  workspace_id: z.string().optional().nullable(),
  user_id: z.string().optional().nullable(),
  base_price_usd: z.number().optional().nullable(),
  purchase_price_usd: z.number().optional().nullable(),
  annual_renewal_usd: z.number().optional().nullable(),
  markup_amount_usd: z.number().optional().nullable(),
  markup_rate: z.number().optional().nullable(),
  expires_at: z.string().optional().nullable(),
  payment_method: z.string().optional().nullable(),
  vercel_domain_id: z.string().optional().nullable(),
  stripe_payment_intent_id: z.string().optional().nullable(),
  stripe_checkout_session_id: z.string().optional().nullable(),
  credits_charged: z.number().optional().nullable(),
  credit_transaction_id: z.string().optional().nullable(),
});

export const WorkspaceSchema = z.object({
  type: z.literal('workspace'),
  name: z.string(),
  slug: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  business_type: z.string().optional().nullable(),
  domain: z.string().optional().nullable(),
  provisioning_mode: z.string().optional().nullable(),
  canonical_version: z.number().optional().nullable(),
  content_hash: z.string().optional().nullable(),
  brand_ref: z.string().optional().nullable(),
  page_refs: z.array(z.unknown()).optional().nullable(),
  assistant_refs: z.array(z.unknown()).optional().nullable(),
  workflow_refs: z.array(z.unknown()).optional().nullable(),
  knowledge_refs: z.array(z.unknown()).optional().nullable(),
  commerce_ref: z.string().optional().nullable(),
  cms_refs: z.array(z.unknown()).optional().nullable(),
  social_refs: z.array(z.unknown()).optional().nullable(),
  ticketing_refs: z.array(z.unknown()).optional().nullable(),
  comms_refs: z.array(z.unknown()).optional().nullable(),
  economy: z.record(z.unknown()).optional().nullable(),
  demo_fixtures_ref: z.string().optional().nullable(),
  capabilities: z.array(z.unknown()).optional().nullable(),
  workspace_id: z.string().optional().nullable(),
  db_id: z.string().optional().nullable(),
  created_at: z.string().optional().nullable(),
  updated_at: z.string().optional().nullable(),
});

export const CommerceCatalogSchema = z.object({
  type: z.literal('commerce_catalog'),
  name: z.string(),
  currency: z.string().optional().nullable(),
  tax_behavior: z.string().optional().nullable(),
  shipping_zones: z.array(z.unknown()).optional().nullable(),
  collections: z.array(z.unknown()).optional().nullable(),
  fulfillment: z.record(z.unknown()).optional().nullable(),
  stripe_account_ref: z.string().optional().nullable(),
  workspace_id: z.string().optional().nullable(),
  db_id: z.string().optional().nullable(),
});

export const ProductSchema = z.object({
  type: z.literal('product'),
  name: z.string(),
  slug: z.string(),
  description: z.string().optional().nullable(),
  product_type: z.string().optional().nullable(),
  status: z.string().optional().nullable(),
  variants: z.array(z.unknown()).optional().nullable(),
  prices: z.array(z.unknown()).optional().nullable(),
  subscription: z.record(z.unknown()).optional().nullable(),
  collection: z.string().optional().nullable(),
  media_refs: z.array(z.unknown()).optional().nullable(),
  inventory: z.record(z.unknown()).optional().nullable(),
  metadata: z.record(z.unknown()).optional().nullable(),
  workspace_id: z.string().optional().nullable(),
  db_id: z.string().optional().nullable(),
});

export const CmsCollectionSchema = z.object({
  type: z.literal('cms_collection'),
  name: z.string(),
  slug: z.string(),
  description: z.string().optional().nullable(),
  fields: z.array(z.unknown()).optional().nullable(),
  ordering: z.string().optional().nullable(),
  is_published: z.boolean().optional().nullable(),
  workspace_id: z.string().optional().nullable(),
  db_id: z.string().optional().nullable(),
});

export const CmsEntrySchema = z.object({
  type: z.literal('cms_entry'),
  title: z.string(),
  slug: z.string(),
  collection_slug: z.string(),
  status: z.string().optional().nullable(),
  publish_at: z.string().optional().nullable(),
  order: z.number().optional().nullable(),
  fields: z.record(z.unknown()).optional().nullable(),
  media_refs: z.array(z.unknown()).optional().nullable(),
  excerpt: z.string().optional().nullable(),
  seo: z.record(z.unknown()).optional().nullable(),
  workspace_id: z.string().optional().nullable(),
  db_id: z.string().optional().nullable(),
});

export const SocialSchema = z.object({
  type: z.literal('social'),
  name: z.string(),
  platform: z.string().optional().nullable(),
  handle: z.string().optional().nullable(),
  connection_ref: z.string().optional().nullable(),
  posting_calendar: z.array(z.unknown()).optional().nullable(),
  creative_refs: z.array(z.unknown()).optional().nullable(),
  status: z.string().optional().nullable(),
  workspace_id: z.string().optional().nullable(),
  db_id: z.string().optional().nullable(),
});

export const TicketedEventSchema = z.object({
  type: z.literal('ticketed_event'),
  name: z.string(),
  slug: z.string(),
  start_time: z.string(),
  description: z.string().optional().nullable(),
  status: z.string().optional().nullable(),
  end_time: z.string().optional().nullable(),
  timezone: z.string().optional().nullable(),
  venue: z.record(z.unknown()).optional().nullable(),
  sessions: z.array(z.unknown()).optional().nullable(),
  ticket_tiers: z.array(z.unknown()).optional().nullable(),
  capacity: z.number().optional().nullable(),
  stripe_account_ref: z.string().optional().nullable(),
  media_refs: z.array(z.unknown()).optional().nullable(),
  workspace_id: z.string().optional().nullable(),
  db_id: z.string().optional().nullable(),
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
  contact: ContactSchema,
  company: CompanySchema,
  deal: DealSchema,
  brand: BrandSchema,
  deployment: DeploymentSchema,
  listing: ListingSchema,
  knowledge: KnowledgeSchema,
  knowledge_source: KnowledgeSourceSchema,
  calendar_event: CalendarEventSchema,
  event: EventSchema,
  language_convention: LanguageConventionSchema,
  profile: ProfileSchema,
  sharing_group: SharingGroupSchema,
  page: PageSchema,
  voicemail: VoicemailSchema,
  personalization_profile: PersonalizationProfileSchema,
  account_assistant: AccountAssistantSchema,
  account_memory: AccountMemorySchema,
  account_workflow: AccountWorkflowSchema,
  workspace_transfer: WorkspaceTransferSchema,
  extension: ExtensionSchema,
  phone_number: PhoneNumberSchema,
  domain: DomainSchema,
  workspace: WorkspaceSchema,
  commerce_catalog: CommerceCatalogSchema,
  product: ProductSchema,
  cms_collection: CmsCollectionSchema,
  cms_entry: CmsEntrySchema,
  social: SocialSchema,
  ticketed_event: TicketedEventSchema,
};
