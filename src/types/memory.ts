/**
 * memory.ts — Type definitions for the Total Recall 3-Tier SSSS Memory Architecture
 *
 * These types correspond 1:1 with the SSSS frontmatter schemas defined in
 * docs/projects/in-progress/total-recall-hardening/total-recall-hardening_ARCHITECTURE.md
 *
 * Schema version: 2
 */

// ─── ENUMS ───────────────────────────────────────────────────────────────────────

export enum SentimentPolarity {
  DirectiveMust = 'directive_must',
  DirectiveMustNot = 'directive_must_not',
  Descriptive = 'descriptive',
  Preference = 'preference',
}

export enum Priority {
  Absolute = 'absolute',
  High = 'high',
  Normal = 'normal',
}

export enum NodeStatus {
  Active = 'active',
  Superseded = 'superseded',
  Deprecated = 'deprecated',
  Draft = 'draft',
}

export enum NodeModality {
  Must = 'must',
  MustNot = 'must_not',
  Should = 'should',
  ShouldNot = 'should_not',
}

export enum SourceType {
  Chat = 'chat',
  Manual = 'manual',
  Mined = 'mined',
  Import = 'import',
}

export enum NodeCategory {
  Invariants = 'invariants',
  Preferences = 'preferences',
  AntiPatterns = 'anti-patterns',
  Patterns = 'patterns',
  Decisions = 'decisions',
  Concepts = 'concepts',
}

// ─── CORE INTERFACES ──────────────────────────────────────────────────────────────

/** Decay metadata for a memory node */
export interface DecayInfo {
  half_life_days: number;
  access_count: number;
}

/** Source provenance (append-only log) */
export interface SourceInfo {
  type: SourceType;
  session_id?: string;
  agent?: string;
  evidence_count?: number;
  ref?: string; // e.g., "migration-from-memory-wiki"
}

/**
 * MemoryNode — the canonical SSSS vault node (schema_version: 2).
 * Maps to: `.agent/memory-vault/<category>/<slug>.md`
 */
export interface MemoryNode {
  // Identity
  type: 'memory';
  slug: string;               // globally unique, kebab-case, == filename without .md
  category: NodeCategory;     // matches parent directory name
  schema_version: 2;

  // Content
  title: string;
  body?: string;              // markdown body text (not frontmatter)

  // Status & scoring
  status: NodeStatus;
  confidence: number;         // 0..1, adjusted by Dream Cycle
  importance: number;         // 1..5, set by user or distillation
  priority?: Priority;        // only set for invariants

  // Temporal
  created: string;            // ISO 8601
  updated: string;            // ISO 8601
  last_accessed: string;      // ISO 8601

  // Provenance
  source: SourceInfo;

  // Supersession chain
  supersedes: string[];       // slugs this node replaces
  superseded_by: string | null; // slug that replaces this node

  // Conflict tracking
  contradicts: string[];      // slugs flagged by conflict detector

  // Discovery
  tags: string[];
  related: string[];
  routes_to_skills: string[]; // written by surface.mjs router

  // Semantic classification
  sentiment_polarity: SentimentPolarity;
  sentiment_target: string;   // noun phrase this rule constrains
  modality: NodeModality;

  // SPO triple for O(1) ontology conflict detection
  subject: string;            // who is constrained (usually "agent")
  predicate: string;          // what action (verb phrase as snake_case)
  object: string;             // on what target

  // Decay
  decay: DecayInfo;

  // Absolute-invariant extras (optional, only on invariants)
  immutable?: boolean;        // surface.mjs refuses to overwrite without --force
}

/**
 * SkillManifest — parsed representation of a SKILL.md file.
 * Maps to: `.agent/skills/<skill>/SKILL.md`
 */
export interface SkillManifest {
  name: string;
  description: string;
  path: string;               // absolute filesystem path
  needs: string[];            // slug list injected by surface.mjs
  body: string;               // full markdown body (below frontmatter)
  token_budget: number;       // enforced < 5000 by surface.mjs
  raw_frontmatter: Record<string, unknown>;
  last_compiled?: string;     // ISO 8601
  schema_version?: number;
}

/**
 * ConflictRecord — a quarantined collision between two nodes.
 * Maps to: `.agent/memory-inbox/conflicts/<conflict-id>.md`
 */
export interface ConflictRecord {
  conflict_id: string;        // e.g., "conflict-2026-05-10-001"
  status: 'pending' | 'resolved';
  new_slug: string;
  existing_slug: string;
  similarity: number;         // combined Jaccard + cosine score (0..1)
  polarity_flip: boolean;
  detected_at: string;        // ISO 8601
  reason: string;
  resolution: 'keep-existing' | 'supersede-new' | 'merged' | null;
  resolved_at: string | null; // ISO 8601
}

/**
 * SessionEntry — one node in a branching JSONL session DAG.
 * Maps to: `.agent/sessions/<id>.jsonl` (one JSON object per line)
 */
export interface SessionEntry {
  id: string;
  parentId: string | null;
  type: 'task' | 'tool_call' | 'branch_summary' | 'observation';
  ts: string;                 // ISO 8601
  content: string;
}

/**
 * RouteScore — a routing decision produced by the hybrid BM25+TF-IDF router.
 * Written to: `.agent/memory-derived/skill-routes.jsonl`
 */
export interface RouteScore {
  slug: string;               // memory node slug
  skill: string;              // skill name (directory basename)
  bm25: number;               // raw BM25 score (negated)
  tfidf: number;              // raw TF-IDF score
  combined: number;           // 0.7 * z(bm25) + 0.3 * z(tfidf)
}

/**
 * CompileResult — the full output of a compileSurface() invocation.
 */
export interface CompileResult {
  nodes: MemoryNode[];
  skills: SkillManifest[];
  routes: RouteScore[];
  indexJsonl: string;         // serialized graph-index.jsonl content
  tier1Instructions: string;  // compiled INSTRUCTIONS.md content
  ftsRebuilt: boolean;        // whether FTS5 index was rebuilt
  compiledAt: string;         // ISO 8601
}

/**
 * DreamReport — execution summary appended to dream-report.jsonl by the Dream Cycle daemon.
 */
export interface DreamReport {
  phase: 'light-sleep' | 'rem' | 'deep-sleep' | 'recover';
  timestamp: string;          // ISO 8601
  nodes_processed: number;
  conflicts_found: number;
  nodes_decayed: number;
  nodes_promoted: number;
  errors: string[];
  duration_ms: number;
}

// ─── INDEX NODE (graph-index.jsonl) ─────────────────────────────────────────────

/**
 * IndexNode — serialized form of a MemoryNode for the disposable JSONL index.
 * Maps to: `.agent/memory-derived/graph-index.jsonl` (one object per line)
 */
export interface IndexNode {
  v: 2;
  slug: string;
  path: string;               // relative path from repo root
  type: 'memory';
  title: string;
  category: NodeCategory;
  status: NodeStatus;
  confidence: number;
  importance: number;
  tags: string[];
  routes_to_skills: string[];
  sentiment_polarity: SentimentPolarity;
  sentiment_target: string;
  modality: NodeModality;
  subject: string;
  predicate: string;
  object: string;
  token_count: number;
  updated: string;            // ISO 8601
  content_sha256: string;     // truncated to 16 hex chars
}
