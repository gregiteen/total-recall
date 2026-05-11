/**
 * schema.ts — Compile-time constants for the Total Recall 3-Tier SSSS Memory Architecture.
 *
 * All values are tunable via totalrecall.config.mjs at runtime. These are the
 * canonical defaults. Do not import workspace-specific values here.
 */

// ─── TIER 1: HOT MEMORY ────────────────────────────────────────────────────────
/** Maximum token budget for compiled INSTRUCTIONS.md (Tier 1). Hard fail if exceeded. */
export const TIER1_TOKEN_CEILING = 1000;

// ─── TIER 2: SKILL INJECTION ──────────────────────────────────────────────────
/** Maximum combined token budget per SKILL.md body (body + injected needs). */
export const SKILL_TOKEN_BUDGET = 4500;

/** Maximum number of memory rules injected into a single SKILL.md. */
export const MAX_RULES_PER_SKILL = 7;

// ─── ROUTING ALGORITHM ────────────────────────────────────────────────────────
/** Weight for BM25 score in hybrid routing formula: combined = BM25_WEIGHT*z(bm25) + TFIDF_WEIGHT*z(tfidf) */
export const BM25_WEIGHT = 0.7;

/** Weight for TF-IDF score in hybrid routing formula. */
export const TFIDF_WEIGHT = 0.3;

/** Minimum combined routing score required to route a node to a skill. */
export const ROUTING_THRESHOLD = 0.35;

/** Maximum number of skills a single node can route to (default top-K). */
export const ROUTING_TOP_K = 3;

/** Max characters of body text used for routing (first N chars). */
export const ROUTING_BODY_CHARS = 240;

/** Maximum FTS5 query tokens (OR-joined). */
export const FTS_MAX_TOKENS = 12;

// ─── CONFLICT DETECTION ───────────────────────────────────────────────────────
/** Minimum combined similarity (Jaccard + cosine) to trigger a fuzzy conflict check. */
export const CONFLICT_SIMILARITY_THRESHOLD = 0.78;

/** Minimum target-noun-phrase Jaccard overlap to confirm a polarity flip conflict. */
export const CONFLICT_NP_OVERLAP_THRESHOLD = 0.5;

// ─── DREAM CYCLE ──────────────────────────────────────────────────────────────
/** Default half-life in days for memory node confidence decay. */
export const DECAY_HALF_LIFE_DEFAULT = 180;

/** Minimum dream score to promote a candidate node to active status. */
export const DREAM_PROMOTION_THRESHOLD = 0.65;

/** Days without access before a node is eligible for passive confidence decay. */
export const DECAY_INACTIVE_DAYS = 90;

/** Confidence delta applied per passive decay cycle. */
export const DECAY_CONFIDENCE_DELTA = 0.02;

/** Confidence delta applied when promoting a node. */
export const PROMOTION_CONFIDENCE_BOOST = 0.05;

/** Maximum confidence value (cap for boosts). */
export const CONFIDENCE_MAX = 0.99;

/** Confidence threshold below which a node is auto-deprecated. */
export const CONFIDENCE_DEPRECATION_THRESHOLD = 0.10;

/** Cron schedule for the Dream Cycle daemon (03:00 UTC nightly). */
export const DREAM_CRON_SCHEDULE = '0 3 * * *';

// ─── TRIGRAM VECTORIZATION ────────────────────────────────────────────────────
/** Dimension of sparse trigram hash vector for cosine similarity. */
export const TRIGRAM_DIM = 256;

// ─── SCHEMA VERSION ───────────────────────────────────────────────────────────
/** Current SSSS node schema version. */
export const SCHEMA_VERSION = 2;

// ─── INJECTION MARKERS ────────────────────────────────────────────────────────
/** Begin marker for injected memory block in SKILL.md files. */
export const INJECTION_BEGIN = '<!-- BEGIN INJECTED MEMORY: do not edit by hand; rebuilt by total-recall surface -->';

/** End marker for injected memory block in SKILL.md files. */
export const INJECTION_END = '<!-- END INJECTED MEMORY -->';

// ─── STOPWORDS ────────────────────────────────────────────────────────────────
/**
 * English stopwords filtered during tokenization.
 * Deliberately concise — do not include domain-specific terms.
 */
export const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be',
  'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
  'would', 'could', 'should', 'may', 'might', 'must', 'can', 'not',
  'no', 'nor', 'so', 'yet', 'both', 'either', 'neither', 'each',
  'every', 'all', 'any', 'few', 'more', 'most', 'other', 'some', 'such',
  'than', 'that', 'this', 'these', 'those', 'it', 'its', 'if', 'then',
  'when', 'where', 'how', 'what', 'which', 'who', 'whom', 'why',
  'he', 'she', 'they', 'we', 'you', 'i', 'me', 'him', 'her', 'us',
  'their', 'our', 'your', 'my', 'his', 'your', 'also', 'just', 'only',
  'up', 'out', 'about', 'into', 'through', 'during', 'before', 'after',
  'above', 'below', 'between', 'same', 'then', 'once',
]);
