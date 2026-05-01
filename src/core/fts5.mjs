/**
 * fts5.mjs — SQLite FTS5 Search Index (Total Recall Layer 2)
 *
 * Full-text search across all memory tiers using SQLite FTS5 with
 * BM25 ranking. Provides schema migration, reindexing, search,
 * and graph traversal.
 *
 * This is the search engine for the brain. The .md files are the source
 * of truth — this index is disposable and rebuilt on demand.
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { parseFrontmatter, walkMarkdown, slugify, extractTitle } from './utils.mjs';

// ─── DATABASE CONNECTION ────────────────────────────────────────────────────────

export function openDatabase(dbPath) {
  if (!fs.existsSync(dbPath)) {
    // Create parent directory if it doesn't exist
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  ensureSchema(db);
  return db;
}

// ─── SCHEMA MIGRATION ──────────────────────────────────────────────────────────
// Idempotent — safe to run multiple times.

export function ensureSchema(db) {
  const hasMemoryFts = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='memory_fts'"
  ).get();

  const hasWikiEdges = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='wiki_edges'"
  ).get();

  if (!hasMemoryFts) {
    db.exec(`
      CREATE VIRTUAL TABLE memory_fts USING fts5(
        source,
        source_id,
        title,
        content,
        category,
        tokenize='porter unicode61'
      );
    `);
  }

  if (!hasWikiEdges) {
    db.exec(`
      CREATE TABLE wiki_edges (
        source_slug TEXT NOT NULL,
        target_slug TEXT NOT NULL,
        edge_type TEXT DEFAULT 'related',
        created_at TEXT DEFAULT (datetime('now')),
        PRIMARY KEY (source_slug, target_slug)
      );
    `);
  }

  // Ensure learnings table exists (for standalone init)
  const hasLearnings = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='learnings'"
  ).get();

  if (!hasLearnings) {
    db.exec(`
      CREATE TABLE learnings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        category TEXT DEFAULT 'general',
        importance INTEGER DEFAULT 5 CHECK(importance >= 1 AND importance <= 10),
        access_count INTEGER DEFAULT 0,
        last_accessed TEXT
      );
      CREATE UNIQUE INDEX idx_learnings_content ON learnings(substr(content, 1, 200));
    `);
  }

  // Ensure category_distillation table
  const hasCatDistill = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='category_distillation'"
  ).get();

  if (!hasCatDistill) {
    db.exec(`
      CREATE TABLE category_distillation (
        category TEXT PRIMARY KEY,
        base_summary TEXT NOT NULL DEFAULT '',
        last_distilled_id INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  }

  // Ensure rolling_distillation table
  const hasRollingDistill = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='rolling_distillation'"
  ).get();

  if (!hasRollingDistill) {
    db.exec(`
      CREATE TABLE rolling_distillation (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        base_summary TEXT NOT NULL,
        last_distilled_id INTEGER NOT NULL,
        learning_count_at_distill INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
  }
}

// ─── REINDEX ────────────────────────────────────────────────────────────────────
// Rebuilds the FTS5 index from all filesystem sources.

export function reindex(db, paths) {
  let totalIndexed = 0;

  // Clear existing FTS5 data
  db.exec('DELETE FROM memory_fts');
  db.exec('DELETE FROM wiki_edges');

  const insertFts = db.prepare(`
    INSERT INTO memory_fts (source, source_id, title, content, category)
    VALUES (?, ?, ?, ?, ?)
  `);

  const insertEdge = db.prepare(`
    INSERT OR IGNORE INTO wiki_edges (source_slug, target_slug, edge_type)
    VALUES (?, ?, ?)
  `);

  // ── 1. Index wiki nodes ──────────────────────────────────────────────────
  if (fs.existsSync(paths.wikiDir)) {
    const wikiFiles = walkMarkdown(paths.wikiDir);
    let wikiCount = 0;

    for (const filePath of wikiFiles) {
      const filename = path.basename(filePath);
      const content = fs.readFileSync(filePath, 'utf-8');
      const { body, meta } = parseFrontmatter(content);
      const slug = slugify(filename);
      const title = extractTitle(body, filename.replace(/\.md$/, ''));

      let category = meta.type || meta.Category || meta.category || 'uncategorized';
      if (category === 'uncategorized') {
        const catMatch = body.match(/>\s*\*\*Category\*\*:\s*(.+)/i);
        if (catMatch) category = catMatch[1].trim().toLowerCase();
      }

      const relativePath = path.relative(paths.root, filePath);
      insertFts.run('wiki', relativePath, title, body, category);
      wikiCount++;

      // Extract cross-links from YAML frontmatter
      const related = meta.related || [];
      for (const link of related) {
        const targetSlug = slugify(link.replace(/^\[\[/, '').replace(/\]\]$/, ''));
        if (targetSlug && targetSlug !== slug) {
          insertEdge.run(slug, targetSlug, 'related');
          insertEdge.run(targetSlug, slug, 'related');
        }
      }

      // Extract cross-links from legacy inline format
      const crossLinkMatch = body.match(/>\s*\*\*Cross-Links?\*\*:\s*(.+)/i);
      if (crossLinkMatch) {
        const linkText = crossLinkMatch[1];
        const wikiLinks = linkText.match(/\[\[([^\]]+)\]\]/g) || [];
        for (const wl of wikiLinks) {
          const targetSlug = slugify(wl.replace(/^\[\[/, '').replace(/\]\]$/, ''));
          if (targetSlug && targetSlug !== slug) {
            insertEdge.run(slug, targetSlug, 'related');
            insertEdge.run(targetSlug, slug, 'related');
          }
        }
      }

      // Parse supersedes → wiki_edges
      if (meta.supersedes && meta.supersedes !== 'null') {
        const supersededSlug = slugify(meta.supersedes);
        if (supersededSlug) {
          insertEdge.run(slug, supersededSlug, 'supersedes');
        }
      }
    }
    totalIndexed += wikiCount;
  }

  // ── 2. Index learnings from existing DB table ────────────────────────────
  const hasLearnings = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='learnings'"
  ).get();

  let learningCount = 0;
  if (hasLearnings) {
    const learnings = db.prepare('SELECT id, content, category, importance FROM learnings').all();
    for (const l of learnings) {
      insertFts.run(
        'learning',
        `learning:${l.id}`,
        `Learning #${l.id} [${l.category}/${l.importance}]`,
        l.content,
        l.category || 'general'
      );
      learningCount++;
    }
  }
  totalIndexed += learningCount;

  // ── 3. Index daily logs ──────────────────────────────────────────────────
  let logCount = 0;
  if (fs.existsSync(paths.dailyLogsDir)) {
    const logFiles = walkMarkdown(paths.dailyLogsDir, []);
    for (const filePath of logFiles) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const filename = path.basename(filePath);
      const relativePath = path.relative(paths.root, filePath);
      const { body } = parseFrontmatter(content);
      const title = extractTitle(body, filename.replace(/\.md$/, ''));
      insertFts.run('daily-log', relativePath, title, body, 'daily-log');
      logCount++;
    }
  }
  totalIndexed += logCount;

  // ── 4. Index episodes ────────────────────────────────────────────────────
  let episodeCount = 0;
  if (fs.existsSync(paths.episodesDir)) {
    const episodeFiles = walkMarkdown(paths.episodesDir, []);
    for (const filePath of episodeFiles) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const filename = path.basename(filePath);
      const relativePath = path.relative(paths.root, filePath);
      const { body, meta } = parseFrontmatter(content);
      const title = extractTitle(body, filename.replace(/\.md$/, ''));
      insertFts.run('episode', relativePath, title, body, meta.type || 'episode');
      episodeCount++;
    }
  }
  totalIndexed += episodeCount;

  // ── 5. Index handoff archives ────────────────────────────────────────────
  let handoffCount = 0;
  if (fs.existsSync(paths.handoffsDir)) {
    const handoffFiles = walkMarkdown(paths.handoffsDir, []);
    for (const filePath of handoffFiles) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const filename = path.basename(filePath);
      const relativePath = path.relative(paths.root, filePath);
      const { body } = parseFrontmatter(content);
      const title = extractTitle(body, filename.replace(/\.md$/, ''));
      insertFts.run('handoff', relativePath, title, body, 'handoff');
      handoffCount++;
    }
  }
  totalIndexed += handoffCount;

  const edgeCount = db.prepare('SELECT COUNT(*) as c FROM wiki_edges').get().c;

  return {
    totalIndexed,
    breakdown: {
      wiki: totalIndexed - learningCount - logCount - episodeCount - handoffCount,
      learnings: learningCount,
      dailyLogs: logCount,
      episodes: episodeCount,
      handoffs: handoffCount,
    },
    edgeCount,
  };
}

// ─── SEARCH ─────────────────────────────────────────────────────────────────────
// FTS5 full-text search with BM25 ranking.

export function search(db, term, { source = null, limit = 20 } = {}) {
  // Build FTS5 query — escape special characters for safety
  const safeTerms = term
    .replace(/['"]/g, '')
    .split(/\s+/)
    .filter(t => t.length > 0)
    .map(t => `"${t}"`)
    .join(' OR ');

  let query, params;
  if (source) {
    query = `
      SELECT source, source_id, title, snippet(memory_fts, 3, '→', '←', '...', 40) as snippet,
             category, rank
      FROM memory_fts
      WHERE memory_fts MATCH ? AND source = ?
      ORDER BY rank
      LIMIT ?
    `;
    params = [safeTerms, source, limit];
  } else {
    query = `
      SELECT source, source_id, title, snippet(memory_fts, 3, '→', '←', '...', 40) as snippet,
             category, rank
      FROM memory_fts
      WHERE memory_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `;
    params = [safeTerms, limit];
  }

  try {
    return { results: db.prepare(query).all(...params), error: null };
  } catch (err) {
    // FTS5 query syntax error — fall back to LIKE search on learnings
    const fallback = db.prepare(
      'SELECT * FROM learnings WHERE content LIKE ? ORDER BY importance DESC LIMIT ?'
    ).all(`%${term}%`, limit);
    return { results: fallback, error: err.message, fallback: true };
  }
}

// ─── GRAPH TRAVERSAL ────────────────────────────────────────────────────────────
// BFS traversal via wiki_edges table.

export function graphTraverse(db, inputSlug, { depth = 2 } = {}) {
  const slug = slugify(inputSlug);
  const visited = new Set();
  const queue = [{ slug, level: 0 }];
  const results = [];

  while (queue.length > 0) {
    const { slug: currentSlug, level } = queue.shift();
    if (visited.has(currentSlug) || level > depth) continue;
    visited.add(currentSlug);

    const edges = db.prepare(`
      SELECT source_slug, target_slug, edge_type
      FROM wiki_edges
      WHERE source_slug = ? OR target_slug = ?
    `).all(currentSlug, currentSlug);

    const node = db.prepare(`
      SELECT title, category, source_id
      FROM memory_fts
      WHERE source = 'wiki' AND (title LIKE ? OR source_id LIKE ?)
      LIMIT 1
    `).get(`%${currentSlug.replace(/-/g, ' ')}%`, `%${currentSlug}%`);

    results.push({
      slug: currentSlug,
      level,
      title: node?.title || currentSlug,
      category: node?.category || 'unknown',
      edges: edges.map(e => ({
        connected: e.source_slug === currentSlug ? e.target_slug : e.source_slug,
        type: e.edge_type,
        direction: e.source_slug === currentSlug ? '→' : '←'
      }))
    });

    for (const e of edges) {
      const neighbor = e.source_slug === currentSlug ? e.target_slug : e.source_slug;
      if (!visited.has(neighbor)) {
        queue.push({ slug: neighbor, level: level + 1 });
      }
    }
  }

  return results;
}

// ─── STATS ──────────────────────────────────────────────────────────────────────

export function getStats(db, paths) {
  const totalLearnings = db.prepare('SELECT COUNT(*) as c FROM learnings').get().c;
  const categories = db.prepare(
    'SELECT category, COUNT(*) as c, AVG(importance) as avg_imp FROM learnings GROUP BY category ORDER BY c DESC'
  ).all();
  const ftsCount = db.prepare('SELECT COUNT(*) as c FROM memory_fts').get().c;
  const ftsBySource = db.prepare(
    "SELECT source, COUNT(*) as c FROM memory_fts GROUP BY source ORDER BY c DESC"
  ).all();
  const edgeCount = db.prepare('SELECT COUNT(*) as c FROM wiki_edges').get().c;
  const wikiFiles = fs.existsSync(paths.wikiDir) ? walkMarkdown(paths.wikiDir) : [];
  const dailyLogs = fs.existsSync(paths.dailyLogsDir) ? walkMarkdown(paths.dailyLogsDir, []) : [];
  const episodes = fs.existsSync(paths.episodesDir) ? walkMarkdown(paths.episodesDir, []) : [];

  return {
    totalLearnings,
    categories,
    ftsCount,
    ftsBySource,
    edgeCount,
    wikiNodes: wikiFiles.length,
    dailyLogs: dailyLogs.length,
    episodes: episodes.length,
  };
}
