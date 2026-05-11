/**
 * surface.mjs — 3-Tier SSSS Memory Surface Compiler (Total Recall)
 *
 * Implements the Routing Algorithm from the SSSS architecture spec:
 *   1. Tokenize vault nodes
 *   2. BM25 scoring via SQLite FTS5
 *   3. TF-IDF scoring (pure JS fallback)
 *   4. Z-normalize + combine (0.7 * bm25 + 0.3 * tfidf)
 *   5. Inject top-K slugs into each SKILL.md
 *   6. Compile absolute-priority rules into INSTRUCTIONS.md (Tier 1)
 *   7. Emit graph-index.jsonl + skill-routes.jsonl
 *
 * Zero workspace-specific references. Configured entirely by caller-supplied paths.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { loadNodes, loadSkills, atomicWrite } from './vault.mjs';
import {
  STOPWORDS,
  BM25_WEIGHT,
  TFIDF_WEIGHT,
  ROUTING_THRESHOLD,
  ROUTING_TOP_K,
  ROUTING_BODY_CHARS,
  FTS_MAX_TOKENS,
  MAX_RULES_PER_SKILL,
  SKILL_TOKEN_BUDGET,
  TIER1_TOKEN_CEILING,
  INJECTION_BEGIN,
  INJECTION_END,
} from '../constants/schema.mjs';

// ─── TOKENIZATION ────────────────────────────────────────────────────────────────

/**
 * Tokenize a string: lowercase, strip punctuation, filter stopwords.
 * @param {string} text
 * @returns {string[]}
 */
export function tokenize(text) {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOPWORDS.has(t));
}

/**
 * Approximate token count (1 token ≈ 4 characters).
 * @param {string} text
 * @returns {number}
 */
export function approxTokenCount(text) {
  return Math.ceil((text ?? '').length / 4);
}

/**
 * SHA-256 hash of text, truncated to 16 hex chars.
 * @param {string} text
 * @returns {string}
 */
export function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
}

// ─── TF-IDF ENGINE ───────────────────────────────────────────────────────────────

/**
 * Build a TF-IDF model from an array of documents.
 * @param {{ id: string, text: string }[]} docs
 * @returns {{ tf: Map<string, Map<string, number>>, idf: Map<string, number>, N: number }}
 */
export function buildTfidf(docs) {
  const N = docs.length;
  const tf = new Map();   // docId → (term → frequency)
  const df = new Map();   // term → document frequency

  for (const { id, text } of docs) {
    const tokens = tokenize(text);
    const termFreq = new Map();
    for (const t of tokens) {
      termFreq.set(t, (termFreq.get(t) ?? 0) + 1);
    }
    // Normalize TF by document length
    for (const [t, count] of termFreq) {
      termFreq.set(t, count / tokens.length);
    }
    tf.set(id, termFreq);
    for (const t of termFreq.keys()) {
      df.set(t, (df.get(t) ?? 0) + 1);
    }
  }

  const idf = new Map();
  for (const [term, docFreq] of df) {
    idf.set(term, Math.log(1 + N / docFreq));
  }

  return { tf, idf, N };
}

/**
 * Compute TF-IDF score for a query against a document.
 * @param {string} query
 * @param {string} docId
 * @param {{ tf: Map, idf: Map }} model
 * @returns {number}
 */
export function tfidfScore(query, docId, model) {
  const queryTokens = tokenize(query);
  const docTf = model.tf.get(docId);
  if (!docTf) return 0;

  let score = 0;
  for (const t of queryTokens) {
    const tf = docTf.get(t) ?? 0;
    const idf = model.idf.get(t) ?? 0;
    score += tf * idf;
  }
  return score;
}

// ─── BM25 VIA FTS5 ───────────────────────────────────────────────────────────────

/**
 * Sanitize and format a query for FTS5 MATCH expression.
 * OR-joins quoted tokens, capped at FTS_MAX_TOKENS.
 * @param {string} query
 * @returns {string}
 */
export function sanitizeFtsQuery(query) {
  const tokens = tokenize(query).slice(0, FTS_MAX_TOKENS);
  if (tokens.length === 0) return '';
  return tokens.map(t => `"${t}"`).join(' OR ');
}

/**
 * Build the FTS5 skill index in SQLite.
 * Drops and recreates the table, then inserts one row per skill.
 * @param {import('better-sqlite3').Database} db
 * @param {import('../types/memory.js').SkillManifest[]} skills
 */
export function buildSkillIndex(db, skills) {
  db.exec(`DROP TABLE IF EXISTS skill_fts`);
  db.exec(`
    CREATE VIRTUAL TABLE skill_fts USING fts5(
      skill_name,
      description,
      body,
      content=''
    )
  `);

  const insert = db.prepare(`INSERT INTO skill_fts (skill_name, description, body) VALUES (?, ?, ?)`);
  const insertMany = db.transaction(rows => {
    for (const row of rows) insert.run(row.name, row.description, row.body);
  });
  insertMany(skills);
}

/**
 * Query the FTS5 index for BM25 scores against a text query.
 * FTS5 BM25 scores are negative (more negative = better match) — we negate them.
 * @param {import('better-sqlite3').Database} db
 * @param {string} query
 * @param {number} [limit=20]
 * @returns {{ skill_name: string, score: number }[]}
 */
export function bm25Query(db, query, limit = 20) {
  const ftsQuery = sanitizeFtsQuery(query);
  if (!ftsQuery) return [];

  try {
    return db.prepare(`
      SELECT skill_name, -bm25(skill_fts) AS score
      FROM skill_fts
      WHERE skill_fts MATCH ?
      ORDER BY score DESC
      LIMIT ?
    `).all(ftsQuery, limit);
  } catch {
    return [];
  }
}

// ─── Z-NORMALIZATION ─────────────────────────────────────────────────────────────

/**
 * Z-normalize an array of (id, score) pairs.
 * Returns a Map<id, normalized_score>. Handles zero-variance gracefully.
 * @param {{ id: string, score: number }[]} scored
 * @returns {Map<string, number>}
 */
function zNormalize(scored) {
  if (scored.length === 0) return new Map();

  const values = scored.map(s => s.score);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  const std = Math.sqrt(variance) || 1; // avoid division by zero

  return new Map(scored.map(s => [s.id, (s.score - mean) / std]));
}

// ─── HYBRID ROUTER ───────────────────────────────────────────────────────────────

/**
 * Route a set of memory nodes to skills using the hybrid BM25+TF-IDF algorithm.
 *
 * @param {import('../types/memory.js').MemoryNode[]} nodes
 * @param {import('../types/memory.js').SkillManifest[]} skills
 * @param {import('better-sqlite3').Database | null} db
 * @param {{ topK?: number, threshold?: number }} [opts]
 * @returns {import('../types/memory.js').RouteScore[]}
 */
export function routeNodesToSkills(nodes, skills, db, opts = {}) {
  const topK = opts.topK ?? ROUTING_TOP_K;
  const threshold = opts.threshold ?? ROUTING_THRESHOLD;

  // Build TF-IDF model over skill corpus
  const skillDocs = skills.map(s => ({
    id: s.name,
    text: `${s.name} ${s.description} ${s.body}`,
  }));
  const tfidfModel = buildTfidf(skillDocs);

  // Build FTS5 index if db is available
  let ftsAvailable = false;
  if (db) {
    try {
      buildSkillIndex(db, skills);
      ftsAvailable = true;
    } catch {
      // FTS5 unavailable — fall back to TF-IDF only
    }
  }

  const allRoutes = [];

  for (const node of nodes) {
    // Build routing text: title + tags + first 240 chars of body
    const routingText = [
      node.title,
      node.tags.join(' '),
      (node.body ?? '').slice(0, ROUTING_BODY_CHARS),
    ].join(' ');

    // Step 1: BM25 scores
    const bm25Scores = ftsAvailable
      ? bm25Query(db, routingText).map(r => ({ id: r.skill_name, score: r.score }))
      : skills.map(s => ({ id: s.name, score: 0 }));

    // Step 2: TF-IDF scores
    const tfidfScores = skills.map(s => ({
      id: s.name,
      score: tfidfScore(routingText, s.name, tfidfModel),
    }));

    // Step 3: Z-normalize
    const zBm25 = zNormalize(bm25Scores);
    const zTfidf = zNormalize(tfidfScores);

    // Step 4: Combine
    const combined = skills.map(s => ({
      slug: node.slug,
      skill: s.name,
      bm25: zBm25.get(s.name) ?? 0,
      tfidf: zTfidf.get(s.name) ?? 0,
      combined: BM25_WEIGHT * (zBm25.get(s.name) ?? 0) + TFIDF_WEIGHT * (zTfidf.get(s.name) ?? 0),
    }));

    // Step 5: Filter by threshold + top-K
    const qualified = combined
      .filter(r => r.combined >= threshold)
      .sort((a, b) => b.combined - a.combined)
      .slice(0, topK);

    // Step 6: Union with explicit routes_to_skills from frontmatter
    const explicit = (node.routes_to_skills ?? []).map(skillName => ({
      slug: node.slug,
      skill: skillName,
      bm25: 0,
      tfidf: 0,
      combined: 1.0, // explicit overrides always included
    }));

    const merged = [...explicit];
    for (const r of qualified) {
      if (!merged.some(e => e.skill === r.skill)) merged.push(r);
    }

    allRoutes.push(...merged);
  }

  return allRoutes;
}

// ─── SKILL INJECTION ─────────────────────────────────────────────────────────────

/**
 * Render the injected memory block for a SKILL.md.
 * @param {import('../types/memory.js').MemoryNode[]} nodes - Nodes routed to this skill
 * @param {string} generatedAt - ISO 8601 timestamp
 * @returns {string}
 */
function renderInjectionBlock(nodes, generatedAt) {
  const lines = [
    INJECTION_BEGIN,
    `<!-- @route: hybrid-bm25-tfidf, generated_at: ${generatedAt} -->`,
    '',
  ];

  // Sort by combined score (desc), then importance, then slug for determinism
  const sorted = [...nodes].sort((a, b) => {
    if (b.importance !== a.importance) return b.importance - a.importance;
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return a.slug.localeCompare(b.slug);
  });

  for (const node of sorted.slice(0, MAX_RULES_PER_SKILL)) {
    const bodySnippet = (node.body ?? '').replace(/\n+/g, ' ').slice(0, 160);
    lines.push(`- **${node.slug}** (confidence ${node.confidence.toFixed(2)}, importance ${node.importance}):`);
    lines.push(`  ${bodySnippet}`);
  }

  lines.push('');
  lines.push(INJECTION_END);
  return lines.join('\n');
}

/**
 * Inject memory capsule into a SKILL.md file.
 * Replaces existing block if present, or inserts after "## Authoritative Rules".
 * Uses atomicWrite to prevent corruption.
 *
 * @param {import('../types/memory.js').SkillManifest} skill
 * @param {import('../types/memory.js').MemoryNode[]} nodes - Nodes to inject
 * @param {string} generatedAt - ISO 8601 timestamp
 */
export function injectIntoSkillManifest(skill, nodes, generatedAt) {
  const raw = fs.readFileSync(skill.path, 'utf-8');
  const block = renderInjectionBlock(nodes, generatedAt);

  let updated;
  const beginIdx = raw.indexOf(INJECTION_BEGIN);
  const endIdx = raw.indexOf(INJECTION_END);

  if (beginIdx !== -1 && endIdx !== -1) {
    // Replace existing block
    updated = raw.slice(0, beginIdx) + block + raw.slice(endIdx + INJECTION_END.length);
  } else {
    // Insert after "## Authoritative Rules" or at end
    const insertAfter = '## Authoritative Rules';
    const insertIdx = raw.indexOf(insertAfter);
    if (insertIdx !== -1) {
      const afterHeader = raw.indexOf('\n', insertIdx) + 1;
      updated = raw.slice(0, afterHeader) + '\n' + block + '\n' + raw.slice(afterHeader);
    } else {
      updated = raw + '\n\n' + block + '\n';
    }
  }

  atomicWrite(skill.path, updated);
}

// ─── TIER 1 COMPILATION ──────────────────────────────────────────────────────────

/**
 * Compile absolute-priority rules into a Tier 1 INSTRUCTIONS.md section.
 * Hard-fails if token count exceeds TIER1_TOKEN_CEILING.
 *
 * @param {import('../types/memory.js').MemoryNode[]} nodes - All vault nodes
 * @returns {string} Compiled Tier 1 instructions block
 * @throws {Error} If the compiled block exceeds TIER1_TOKEN_CEILING tokens
 */
export function compileTier1Instructions(nodes) {
  const absoluteRules = nodes
    .filter(n => n.status === 'active' && n.priority === 'absolute')
    .sort((a, b) => a.slug.localeCompare(b.slug)); // deterministic order

  const lines = [
    '# Behavioral Rules (Tier 1 — Absolute Invariants)',
    '',
    '> These rules are compiled from `memory-vault/invariants/` and are always active.',
    '> They are immutable — do not edit this block by hand.',
    '',
  ];

  for (const rule of absoluteRules) {
    const prefix = rule.modality === 'must_not' ? '🛑 NEVER' : '✅ ALWAYS';
    lines.push(`**${rule.slug}**: ${prefix} — ${(rule.body ?? rule.title).replace(/\n+/g, ' ').slice(0, 240)}`);
    lines.push('');
  }

  const content = lines.join('\n');
  const tokenCount = approxTokenCount(content);

  if (tokenCount > TIER1_TOKEN_CEILING) {
    throw new Error(
      `Tier 1 compilation exceeded token ceiling: ${tokenCount} tokens > ${TIER1_TOKEN_CEILING}. ` +
      `Remove absolute rules or increase TIER1_TOKEN_CEILING. Absolute rules: ${absoluteRules.map(r => r.slug).join(', ')}`
    );
  }

  return content;
}

// ─── INDEX EMISSION ──────────────────────────────────────────────────────────────

/**
 * Serialize a MemoryNode as an IndexNode for graph-index.jsonl.
 * @param {import('../types/memory.js').MemoryNode} node
 * @param {string} vaultDir - Used to compute relative path
 * @returns {object}
 */
function toIndexNode(node, vaultDir) {
  const bodyText = node.body ?? node.title ?? '';
  return {
    v: 2,
    slug: node.slug,
    path: path.join('.agent/memory-vault', node.category, `${node.slug}.md`),
    type: 'memory',
    title: node.title,
    category: node.category,
    status: node.status,
    confidence: node.confidence,
    importance: node.importance,
    tags: node.tags,
    routes_to_skills: node.routes_to_skills,
    sentiment_polarity: node.sentiment_polarity,
    sentiment_target: node.sentiment_target,
    modality: node.modality,
    subject: node.subject,
    predicate: node.predicate,
    object: node.object,
    token_count: approxTokenCount(bodyText),
    updated: node.updated,
    content_sha256: sha256(bodyText),
  };
}

// ─── ORCHESTRATOR ────────────────────────────────────────────────────────────────

/**
 * Full surface compilation: load → route → inject → compile Tier 1 → emit indexes.
 *
 * @param {{
 *   vaultDir: string,
 *   skillsDir: string,
 *   derivedDir: string,
 *   instructionsFile: string,
 *   db?: import('better-sqlite3').Database | null,
 * }} paths
 * @returns {import('../types/memory.js').CompileResult}
 */
export async function compileSurface({ vaultDir, skillsDir, derivedDir, instructionsFile, db = null }) {
  const generatedAt = new Date().toISOString();

  // 1. Load nodes and skills
  const nodes = loadNodes(vaultDir);
  const skills = loadSkills(skillsDir);

  if (nodes.length === 0) {
    console.warn('⚠️  surface: no active nodes found in vault. Skipping injection.');
  }

  // 2. Route nodes to skills
  const routes = skills.length > 0
    ? routeNodesToSkills(nodes, skills, db)
    : [];

  // 3. Build skill → nodes map (capped at MAX_RULES_PER_SKILL)
  const skillNodeMap = new Map(); // skill name → MemoryNode[]
  for (const route of routes) {
    const list = skillNodeMap.get(route.skill) ?? [];
    const node = nodes.find(n => n.slug === route.slug);
    if (node && !list.some(n => n.slug === node.slug)) {
      list.push(node);
    }
    skillNodeMap.set(route.skill, list);
  }

  // 4. Inject into each SKILL.md
  for (const skill of skills) {
    const injectedNodes = (skillNodeMap.get(skill.name) ?? [])
      .sort((a, b) => b.importance - a.importance)
      .slice(0, MAX_RULES_PER_SKILL);

    if (injectedNodes.length > 0) {
      try {
        injectIntoSkillManifest(skill, injectedNodes, generatedAt);
        // Update routes_to_skills on each node
        for (const node of injectedNodes) {
          if (!node.routes_to_skills.includes(skill.name)) {
            node.routes_to_skills.push(skill.name);
          }
        }
      } catch (err) {
        console.error(`surface: failed to inject into ${skill.name}: ${err.message}`);
      }
    }
  }

  // 5. Compile Tier 1
  let tier1Instructions = '';
  try {
    tier1Instructions = compileTier1Instructions(nodes);
  } catch (err) {
    console.error(`surface: Tier 1 compilation failed: ${err.message}`);
    throw err;
  }

  // 6. Emit indexes
  fs.mkdirSync(derivedDir, { recursive: true });

  const indexLines = nodes.map(n => JSON.stringify(toIndexNode(n, vaultDir)));
  atomicWrite(path.join(derivedDir, 'graph-index.jsonl'), indexLines.join('\n') + '\n');

  const routeLines = routes.map(r => JSON.stringify(r));
  atomicWrite(path.join(derivedDir, 'skill-routes.jsonl'), routeLines.join('\n') + '\n');

  // 7. Write Tier 1 to INSTRUCTIONS.md
  if (instructionsFile) {
    atomicWrite(instructionsFile, tier1Instructions);
  }

  return {
    nodes,
    skills,
    routes,
    indexJsonl: indexLines.join('\n'),
    tier1Instructions,
    ftsRebuilt: !!db,
    compiledAt: generatedAt,
  };
}

/**
 * Write a full CompileResult to the filesystem.
 * All writes are atomic to prevent corruption.
 *
 * @param {import('../types/memory.js').CompileResult} result
 * @param {{ derivedDir: string, instructionsFile: string }} paths
 */
export function writeSurface(result, paths) {
  const { derivedDir, instructionsFile } = paths;
  fs.mkdirSync(derivedDir, { recursive: true });

  atomicWrite(path.join(derivedDir, 'graph-index.jsonl'), result.indexJsonl);
  atomicWrite(instructionsFile, result.tier1Instructions);
}
