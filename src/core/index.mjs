/**
 * index.mjs — Total Recall Public API
 *
 * Main entry point for the Total Recall engine.
 * Re-exports all core modules for programmatic usage.
 */

// Core utilities
export { parseFrontmatter, walkMarkdown, slugify, extractTitle, loadConfig, resolvePaths } from './utils.mjs';

// Layer 2: Search Index
export { openDatabase, ensureSchema, reindex, search, graphTraverse, getStats } from './fts5.mjs';

// Layer 3: Knowledge Graph
export { loadNodes, createNode, lint, heal } from './wiki.mjs';

// Signal Scoring
export { computeSignalScore, rankNodes } from './ranking.mjs';

// Layer 4: Behavioral Surface
export { compileSurface, writeSurface } from './surface.mjs';

// Steering
export * from './steering.mjs';
