export const MEMORY_LAYERS = Object.freeze(['conscious', 'system2', 'research']);

export const DEFAULT_MEMORY_LAYER = 'system2';

const LAYER_ALIASES = new Map([
  ['conscious', 'conscious'],
  ['awareness', 'conscious'],
  ['working-memory', 'conscious'],
  ['working_memory', 'conscious'],
  ['working memory', 'conscious'],
  ['hot', 'conscious'],
  ['system2', 'system2'],
  ['system-2', 'system2'],
  ['system_2', 'system2'],
  ['system 2', 'system2'],
  ['deliberation', 'system2'],
  ['reasoning', 'system2'],
  ['research', 'research'],
  ['knowledge-acquisition', 'research'],
  ['knowledge_acquisition', 'research'],
  ['knowledge acquisition', 'research'],
  ['acquisition', 'research'],
]);

const CONSCIOUS_CATEGORIES = new Set(['invariants', 'patterns', 'anti-patterns', 'preferences']);
const SYSTEM2_CATEGORIES = new Set(['decisions', 'concepts', 'proposals']);
const RESEARCH_CATEGORIES = new Set(['facts', 'research', 'lore']);
const SYSTEM2_TAGS = new Set(['system2', 'system-2', 'deliberation', 'reasoning', 'synthesis', 'validation']);
const RESEARCH_TAGS = new Set(['research', 'web', 'knowledge-acquisition', 'stale-knowledge-refresh']);
const RESEARCH_SOURCES = new Set(['web-search', 'deep-research', 'research', 'external-citation']);

export function normalizeMemoryLayer(layer) {
  if (typeof layer !== 'string') return null;
  const trimmed = layer.trim().toLowerCase();
  if (!trimmed) return null;
  return LAYER_ALIASES.get(trimmed) || null;
}

function normalizedTags(node) {
  if (!Array.isArray(node?.tags)) return new Set();
  return new Set(node.tags.map((tag) => String(tag).trim().toLowerCase()).filter(Boolean));
}

function hasAny(tags, candidates) {
  for (const tag of tags) {
    if (candidates.has(tag)) return true;
  }
  return false;
}

export function inferMemoryLayer(node = {}) {
  const explicit = normalizeMemoryLayer(
    node.x_memory_layer || node.memory_layer || node.cognitive_layer
  );
  if (explicit) return explicit;

  const category = String(node.category || '').trim().toLowerCase();
  const tags = normalizedTags(node);
  const sourceType = String(node.source?.type || '').trim().toLowerCase();

  if (hasAny(tags, RESEARCH_TAGS) || RESEARCH_SOURCES.has(sourceType)) return 'research';
  if (hasAny(tags, SYSTEM2_TAGS)) return 'system2';
  if (node.priority === 'absolute') return 'conscious';
  if (CONSCIOUS_CATEGORIES.has(category)) return 'conscious';
  if (SYSTEM2_CATEGORIES.has(category)) return 'system2';
  if (RESEARCH_CATEGORIES.has(category)) return 'research';

  return DEFAULT_MEMORY_LAYER;
}

export function memoryLayerRoutingWeight(layer) {
  switch (normalizeMemoryLayer(layer) || DEFAULT_MEMORY_LAYER) {
    case 'conscious':
      return 1.25;
    case 'research':
      return 0.75;
    case 'system2':
    default:
      return 1;
  }
}

export function buildMemoryLayerIndex(nodes) {
  return nodes.map((node) => ({
    v: 1,
    slug: node.slug,
    layer: inferMemoryLayer(node),
    category: node.category,
    status: node.status,
    confidence: node.confidence,
    importance: node.importance,
    title: node.title,
    tags: Array.isArray(node.tags) ? node.tags : [],
    updated: node.updated || null,
    routes_to_skills: Array.isArray(node.routes_to_skills) ? node.routes_to_skills : [],
  }));
}
