/**
 * schema.mjs — Compile-time constants for the Total Recall 3-Tier SSSS Memory Architecture.
 *
 * All values are tunable via totalrecall.config.mjs at runtime. These are the
 * canonical defaults. Do not import workspace-specific values here.
 */

// ─── TIER 1: HOT MEMORY ────────────────────────────────────────────────────────
export const TIER1_TOKEN_CEILING = 1000;

// ─── TIER 2: SKILL INJECTION ──────────────────────────────────────────────────
export const SKILL_TOKEN_BUDGET = 4500;
export const MAX_RULES_PER_SKILL = 7;

// ─── ROUTING ALGORITHM ────────────────────────────────────────────────────────
export const BM25_WEIGHT = 0.7;
export const TFIDF_WEIGHT = 0.3;
export const ROUTING_THRESHOLD = 0.35;
export const ROUTING_TOP_K = 3;
export const ROUTING_BODY_CHARS = 240;
export const FTS_MAX_TOKENS = 12;

// ─── CONFLICT DETECTION ───────────────────────────────────────────────────────
export const CONFLICT_SIMILARITY_THRESHOLD = 0.78;
export const CONFLICT_NP_OVERLAP_THRESHOLD = 0.5;

// ─── DREAM CYCLE ──────────────────────────────────────────────────────────────
export const DECAY_HALF_LIFE_DEFAULT = 180;
export const DREAM_PROMOTION_THRESHOLD = 0.65;
export const DECAY_INACTIVE_DAYS = 90;
export const DECAY_CONFIDENCE_DELTA = 0.02;
export const PROMOTION_CONFIDENCE_BOOST = 0.05;
export const CONFIDENCE_MAX = 0.99;
export const CONFIDENCE_DEPRECATION_THRESHOLD = 0.10;
export const DREAM_CRON_SCHEDULE = '0 3 * * *';

// ─── TRIGRAM VECTORIZATION ────────────────────────────────────────────────────
export const TRIGRAM_DIM = 256;

// ─── SCHEMA VERSION ───────────────────────────────────────────────────────────
export const SCHEMA_VERSION = 2;

// ─── INJECTION MARKERS ────────────────────────────────────────────────────────
export const INJECTION_BEGIN = '<!-- BEGIN INJECTED MEMORY: do not edit by hand; rebuilt by total-recall surface -->';
export const INJECTION_END = '<!-- END INJECTED MEMORY -->';

// ─── STOPWORDS ────────────────────────────────────────────────────────────────
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
  'their', 'our', 'your', 'my', 'his', 'also', 'just', 'only',
  'up', 'out', 'about', 'into', 'through', 'during', 'before', 'after',
  'above', 'below', 'between', 'same', 'once',
]);
