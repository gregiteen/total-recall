/**
 * wiki.mjs — Knowledge Graph Operations (Total Recall Layer 3)
 *
 * CRUD operations for wiki nodes, validation (lint), and
 * graph integrity checks. Each wiki node is a standalone .md file
 * with YAML frontmatter following SCHEMA.md.
 */

import fs from 'fs';
import path from 'path';
import { parseFrontmatter, walkMarkdown, slugify, extractTitle } from './utils.mjs';

const VALID_TYPES = ['preference', 'pattern', 'anti-pattern', 'concept', 'decision', 'project', 'conclusion'];
const VALID_SENTIMENTS = ['positive', 'negative', 'neutral', 'corrective'];
const VALID_CONFIDENCE = ['high', 'medium', 'low'];

// Type-specific staleness thresholds (days)
const STALE_THRESHOLDS = {
  preference: 90,
  'anti-pattern': 60,
  pattern: 30,
  concept: 30,
  decision: 45,
  project: 14,
  conclusion: 30,
};

// ─── LOAD ALL WIKI NODES ────────────────────────────────────────────────────────

export function loadNodes(wikiDir, root) {
  const files = walkMarkdown(wikiDir);
  const nodes = [];

  for (const fp of files) {
    const content = fs.readFileSync(fp, 'utf-8');
    const { body, meta } = parseFrontmatter(content);
    
    // Auto-heal missing frontmatter to prevent context drops
    if (!meta.type) meta.type = 'concept';
    if (!meta.provenance) meta.provenance = ['auto-healed'];
    if (!meta.sentiment) meta.sentiment = 'neutral';
    if (!meta.sentiment_intensity) meta.sentiment_intensity = 5;
    if (!meta.confidence) meta.confidence = 'medium';

    const filename = path.basename(fp);
    const slug = slugify(filename);
    const title = extractTitle(body, filename.replace(/\.md$/, ''));

    // Extract the full alert block for the compiled rule text
    const alertMatch = body.match(/>\s*\[!(CAUTION|TIP|IMPORTANT|NOTE)\]\s*\n((?:>\s*.+\n?)+)/);
    let ruleText;
    if (alertMatch) {
      ruleText = alertMatch[2]
        .split('\n')
        .map(l => l.replace(/^>\s*/, '').trim())
        .filter(l => l.length > 0)
        .join(' ');
    } else {
      ruleText = title;
    }

    const prov = Array.isArray(meta.provenance) ? meta.provenance : (meta.provenance ? [meta.provenance] : []);
    const isSteer = prov.some(
      (p) => p.includes('steer:') || p.includes('surface')
    );

    nodes.push({
      slug,
      title,
      body,
      ruleText,
      alertType: alertMatch ? alertMatch[1] : 'NOTE',
      isSteer,
      path: root ? path.relative(root, fp) : fp,
      fullPath: fp,
      // Metadata
      type: meta.type,
      confidence: meta.confidence || 'medium',
      sentiment: meta.sentiment || 'neutral',
      sentiment_intensity: meta.sentiment_intensity || 5,
      access_count: meta.access_count || 0,
      last_verified: meta.last_verified,
      created: meta.created,
      provenance: meta.provenance || [],
      related: meta.related || [],
      supersedes: meta.supersedes,
      superseded_by: meta.superseded_by,
    });
  }

  return nodes;
}

// ─── CREATE WIKI NODE ───────────────────────────────────────────────────────────

export function createNode(wikiDir, { slug, type, sentiment, intensity, directive, provenance, related = [] }) {
  const TYPE_MAP = {
    'anti-pattern': 'anti-patterns',
    pattern: 'patterns',
    concept: 'concepts',
    preference: 'preferences',
    decision: 'decisions',
    project: 'projects',
    conclusion: 'conclusions',
  };

  const ALERT_MAP = {
    'anti-pattern': 'CAUTION',
    pattern: 'TIP',
    concept: 'IMPORTANT',
    preference: 'TIP',
    decision: 'NOTE',
    project: 'NOTE',
    conclusion: 'IMPORTANT',
  };

  const categoryDir = path.join(wikiDir, TYPE_MAP[type] || type);
  if (!fs.existsSync(categoryDir)) {
    fs.mkdirSync(categoryDir, { recursive: true });
  }

  const today = new Date().toISOString().split('T')[0];
  const alertType = ALERT_MAP[type] || 'NOTE';
  const filePath = path.join(categoryDir, `${slug}.md`);
  const exists = fs.existsSync(filePath);

  const content = `---
type: ${type}
confidence: high
sentiment: ${sentiment}
sentiment_intensity: ${intensity}
last_verified: ${today}
created: ${today}
access_count: 0
provenance:
${provenance.map(p => `  - "${p}"`).join('\n')}
related: ${related.length > 0 ? '\n' + related.map(r => `  - "[[${r}]]"`).join('\n') : '[]'}
supersedes: null
superseded_by: null
---

# ${directive}

> [!${alertType}]
> ${directive}

## Source
- Created on ${today}
- Intensity: ${intensity}/10
- Sentiment: ${sentiment}

## Evidence
- [${today}] "${directive}"
`;

  fs.writeFileSync(filePath, content);
  return { filePath, exists, slug };
}

// ─── LINT WIKI ──────────────────────────────────────────────────────────────────

export function lint(wikiDir) {
  const pages = walkMarkdown(wikiDir);
  const issues = { errors: [], warnings: [], info: [] };

  if (pages.length === 0) {
    return { pages: 0, issues };
  }

  // Build slug map
  const allSlugs = new Set();
  const pageData = new Map();

  for (const fp of pages) {
    const filename = path.basename(fp);
    const slug = slugify(filename);
    allSlugs.add(slug);

    const content = fs.readFileSync(fp, 'utf-8');
    const { body, meta } = parseFrontmatter(content);
    const relativePath = path.relative(wikiDir, fp);
    pageData.set(slug, { body, meta, relativePath, fullPath: fp });
  }

  // Build cross-link graph
  const inboundLinks = new Map();
  for (const slug of allSlugs) inboundLinks.set(slug, []);

  for (const [slug, { body, meta }] of pageData) {
    const wikiLinks = body.match(/\[\[([^\]]+)\]\]/g) || [];
    for (const wl of wikiLinks) {
      const target = slugify(wl.replace(/^\[\[/, '').replace(/\]\]$/, ''));
      if (allSlugs.has(target) && target !== slug) {
        inboundLinks.get(target).push(slug);
      } else if (!allSlugs.has(target) && target !== slug) {
        issues.warnings.push({ type: 'broken-link', slug, detail: `→ [[${target}]] not found` });
      }
    }

    const related = meta.related || [];
    for (const link of related) {
      const target = slugify(link);
      if (allSlugs.has(target) && target !== slug) {
        inboundLinks.get(target).push(slug);
      }
    }
  }

  // Check each page
  const today = new Date();

  for (const [slug, { body, meta }] of pageData) {
    const hasFrontmatter = Object.keys(meta).length > 0;

    if (!hasFrontmatter) {
      issues.warnings.push({ type: 'no-frontmatter', slug, detail: 'No YAML frontmatter found (auto-healed in runtime)' });
    } else {
      if (!meta.type) {
        issues.warnings.push({ type: 'missing-type', slug, detail: 'Missing required field: type (auto-healed in runtime)' });
      } else if (!VALID_TYPES.includes(meta.type)) {
        issues.warnings.push({ type: 'invalid-type', slug, detail: `type="${meta.type}" not in ${VALID_TYPES.join(', ')}` });
      }

      const provenance = meta.provenance;
      if (!provenance || (Array.isArray(provenance) && provenance.length === 0)) {
        issues.warnings.push({ type: 'missing-provenance', slug, detail: 'Missing required field: provenance (auto-healed in runtime)' });
      }

      if (!meta.sentiment) {
        issues.warnings.push({ type: 'missing-sentiment', slug, detail: 'Missing sentiment' });
      } else if (!VALID_SENTIMENTS.includes(meta.sentiment)) {
        issues.warnings.push({ type: 'invalid-sentiment', slug, detail: `sentiment="${meta.sentiment}"` });
      }

      if (!meta.sentiment_intensity) {
        issues.warnings.push({ type: 'missing-intensity', slug, detail: 'Missing sentiment_intensity' });
      }

      if (!meta.confidence) {
        issues.warnings.push({ type: 'missing-confidence', slug, detail: 'Missing confidence' });
      } else if (!VALID_CONFIDENCE.includes(meta.confidence)) {
        issues.warnings.push({ type: 'invalid-confidence', slug, detail: `confidence="${meta.confidence}"` });
      }

      // Staleness check
      if (meta.last_verified && meta.type) {
        const lastVerified = new Date(meta.last_verified);
        const daysSince = Math.floor((today - lastVerified) / 86400000);
        const threshold = STALE_THRESHOLDS[meta.type] || 30;
        if (daysSince > threshold) {
          issues.warnings.push({ type: 'stale', slug, detail: `${daysSince}d ago (threshold: ${threshold}d)` });
        }
      }
    }

    // Orphaned nodes
    if ((inboundLinks.get(slug) || []).length === 0) {
      issues.info.push({ type: 'orphaned', slug, detail: 'No inbound links' });
    }

    // Thin nodes
    const wordCount = body.split(/\s+/).filter(w => w.length > 0).length;
    if (wordCount < 50) {
      issues.info.push({ type: 'thin', slug, detail: `${wordCount} words (< 50)` });
    }

    // Missing evidence
    if (!body.includes('## Evidence')) {
      issues.info.push({ type: 'no-evidence', slug, detail: 'No ## Evidence section' });
    }
  }

  return {
    pages: pages.length,
    issues,
    hasErrors: issues.errors.length > 0,
  };
}
