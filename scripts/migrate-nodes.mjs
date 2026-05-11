/**
 * migrate-nodes.mjs — Migrate legacy memory-wiki nodes to the 3-Tier SSSS Vault format
 *
 * Usage:
 *   node scripts/migrate-nodes.mjs --dry-run      # Preview migrations without writing
 *   node scripts/migrate-nodes.mjs --execute      # Write migrated nodes to vault
 *   node scripts/migrate-nodes.mjs --execute --vault /path/to/.agent/memory-vault
 *
 * This script is idempotent — running it multiple times will not create duplicates
 * because it uses the source file slug as the output filename.
 */

import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { parseArgs } from 'node:util';

const require = createRequire(import.meta.url);
const matter = require('gray-matter');

// ─── CLI ARGS ────────────────────────────────────────────────────────────────────

const { values: args } = parseArgs({
  options: {
    'dry-run': { type: 'boolean', default: false },
    'execute': { type: 'boolean', default: false },
    'source': { type: 'string' },   // path to legacy memory-wiki dir
    'vault': { type: 'string' },    // path to new .agent/memory-vault dir
  },
  strict: false,
});

const isDryRun = args['dry-run'] || !args['execute'];

// ─── SCHEMA HELPERS ───────────────────────────────────────────────────────────────

const CATEGORY_KEYWORDS = {
  'invariants':     ['never', 'always', 'must', 'absolute', 'invariant', 'required', 'forbidden'],
  'anti-patterns':  ['avoid', 'anti', 'bad', 'wrong', 'dont', "don't", 'no ', 'not ', 'ban'],
  'patterns':       ['prefer', 'use ', 'do ', 'follow', 'apply', 'ensure', 'keep'],
  'preferences':    ['prefer', 'style', 'format', 'convention', 'taste', 'like'],
  'decisions':      ['decided', 'chose', 'selected', 'adopted', 'switched', 'migrated'],
  'concepts':       ['what', 'how', 'why', 'definition', 'explain', 'concept', 'architecture'],
};

/**
 * Categorize a legacy node into the new vault category.
 * Uses content heuristics — title + body keyword matching.
 * @param {{ title?: string, body?: string, type?: string, sentiment?: string }} data
 * @returns {string} category slug
 */
function categorize(data) {
  // Legacy type-based mapping first
  const legacyTypeMap = {
    'anti-pattern': 'anti-patterns',
    'pattern':      'patterns',
    'preference':   'preferences',
    'concept':      'concepts',
    'decision':     'decisions',
    'rule':         'invariants',
  };
  if (data.type && legacyTypeMap[data.type]) return legacyTypeMap[data.type];
  if (data.sentiment === 'negative') return 'anti-patterns';
  if (data.sentiment === 'corrective') return 'patterns';

  // Keyword search in title + body
  const text = `${data.title ?? ''} ${data.body ?? ''}`.toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(kw => text.includes(kw))) return category;
  }

  return 'concepts'; // fallback
}

/**
 * Infer modality from legacy type/sentiment.
 * @param {{ type?: string, sentiment?: string, title?: string }} data
 * @returns {'must'|'must_not'|'should'|'should_not'}
 */
function inferModality(data) {
  if (data.type === 'anti-pattern' || data.sentiment === 'negative') return 'must_not';
  if (data.type === 'rule' || data.sentiment === 'corrective') return 'must';
  if (data.type === 'preference') return 'should';
  // Title-based heuristic
  const lower = (data.title ?? '').toLowerCase();
  if (lower.startsWith('never') || lower.startsWith('do not') || lower.startsWith("don't")) return 'must_not';
  if (lower.startsWith('always') || lower.startsWith('must') || lower.startsWith('require')) return 'must';
  if (lower.startsWith('prefer') || lower.startsWith('try ')) return 'should';
  return 'should';
}

/**
 * Infer sentiment_polarity from modality.
 * @param {'must'|'must_not'|'should'|'should_not'} modality
 * @returns {string}
 */
function inferPolarity(modality) {
  if (modality === 'must') return 'directive_must';
  if (modality === 'must_not') return 'directive_must_not';
  return 'descriptive';
}

/**
 * Extract the primary noun phrase from a title as the sentiment_target.
 * Very simple heuristic — drop leading verbs.
 * @param {string} title
 * @returns {string}
 */
function extractTarget(title) {
  return title
    .replace(/^(never|always|must|should|do not|don't|prefer|use|avoid)\s+/i, '')
    .slice(0, 60)
    .trim()
    .toLowerCase();
}

/**
 * Convert a legacy node's data into the new SSSS schema_version 2 shape.
 * @param {{ slug: string, meta: object, body: string, filePath: string }} legacy
 * @returns {object} new frontmatter + body
 */
function mapToNewSchema(legacy) {
  const { slug, meta, body } = legacy;
  const now = new Date().toISOString();
  const category = categorize({ ...meta, body });
  const modality = inferModality(meta);
  const polarity = inferPolarity(modality);
  const title = meta.title ?? meta.ruleText ?? slug.replace(/-/g, ' ');
  const target = extractTarget(title);

  return {
    meta: {
      type: 'memory',
      slug,
      category,
      schema_version: 2,
      title,
      status: meta.status ?? 'active',
      confidence: meta.confidence ?? (meta.intensity ? meta.intensity / 10 : 0.75),
      importance: meta.importance ?? meta.intensity ?? 3,
      created: meta.created ?? meta.date ?? now,
      updated: meta.updated ?? now,
      last_accessed: meta.last_accessed ?? now,
      source: {
        type: 'import',
        ref: 'migration-from-memory-wiki',
        evidence_count: meta.evidence_count ?? 1,
      },
      supersedes: meta.supersedes ?? [],
      superseded_by: meta.superseded_by ?? null,
      contradicts: meta.contradicts ?? [],
      tags: meta.tags ?? [],
      related: meta.related ?? [],
      routes_to_skills: [],
      sentiment_polarity: polarity,
      sentiment_target: target,
      modality,
      subject: meta.subject ?? 'agent',
      predicate: meta.predicate ?? slug.replace(/-/g, '_'),
      object: meta.object ?? target.replace(/\s+/g, '_').slice(0, 30),
      decay: {
        half_life_days: meta.half_life_days ?? 180,
        access_count: meta.access_count ?? 0,
      },
    },
    body,
  };
}

// ─── WALK LEGACY DIRECTORY ───────────────────────────────────────────────────────

/**
 * Recursively find all .md files in the legacy memory-wiki directory.
 * @param {string} dir
 * @returns {string[]}
 */
function walkMd(dir) {
  if (!fs.existsSync(dir)) return [];
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...walkMd(full));
    else if (entry.isFile() && entry.name.endsWith('.md')) results.push(full);
  }
  return results;
}

// ─── MAIN ────────────────────────────────────────────────────────────────────────

async function main() {
  // Resolve paths — fall back to totalrecall.config.mjs if not provided
  let sourceDir = args.source;
  let vaultDir = args.vault;

  if (!sourceDir || !vaultDir) {
    // Try to load config from cwd
    const configPath = path.join(process.cwd(), 'totalrecall.config.mjs');
    if (fs.existsSync(configPath)) {
      const { default: cfg } = await import(configPath);
      const dataDir = path.join(process.cwd(), cfg.dataDir ?? '.agent');
      sourceDir ??= path.join(dataDir, 'memory-wiki');
      vaultDir ??= path.join(dataDir, 'memory-vault');
    }
  }

  if (!sourceDir) {
    console.error('❌ --source <legacy-wiki-dir> is required (or set in totalrecall.config.mjs)');
    process.exit(1);
  }
  if (!vaultDir) {
    console.error('❌ --vault <new-vault-dir> is required (or set in totalrecall.config.mjs)');
    process.exit(1);
  }

  console.log(`\n📦 Total Recall — Node Migration Script`);
  console.log(`   Source: ${sourceDir}`);
  console.log(`   Vault:  ${vaultDir}`);
  console.log(`   Mode:   ${isDryRun ? 'DRY RUN (no writes)' : 'EXECUTE'}\n`);

  const files = walkMd(sourceDir);
  if (files.length === 0) {
    console.log('⚠️  No .md files found in source directory. Nothing to migrate.');
    return;
  }

  console.log(`Found ${files.length} files to process.\n`);

  let migrated = 0;
  let skipped = 0;
  let errors = 0;
  const categoryCount = {};

  for (const filePath of files) {
    const slug = path.basename(filePath, '.md');

    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const { data: meta, content: body } = matter(raw);

      // Skip files that already have schema_version: 2
      if (meta.schema_version === 2) {
        console.log(`  ⏭  ${slug} — already schema_version 2, skipping`);
        skipped++;
        continue;
      }

      const { meta: newMeta, body: newBody } = mapToNewSchema({ slug, meta, body, filePath });
      const category = newMeta.category;
      categoryCount[category] = (categoryCount[category] ?? 0) + 1;

      const targetDir = path.join(vaultDir, category);
      const targetPath = path.join(targetDir, `${slug}.md`);

      console.log(`  ${isDryRun ? '📋' : '✅'} ${slug}`);
      console.log(`     → ${category}/${slug}.md`);
      console.log(`     modality: ${newMeta.modality} | importance: ${newMeta.importance} | confidence: ${newMeta.confidence}`);

      if (!isDryRun) {
        fs.mkdirSync(targetDir, { recursive: true });
        const fileContent = matter.stringify(newBody, newMeta);
        // Atomic write
        const tmpPath = `${targetPath}.tmp.${process.pid}`;
        fs.writeFileSync(tmpPath, fileContent, 'utf-8');
        fs.renameSync(tmpPath, targetPath);
      }

      migrated++;
    } catch (err) {
      console.error(`  ❌ ${slug}: ${err.message}`);
      errors++;
    }
  }

  console.log('\n─────────────────────────────────────────');
  console.log(`✅ Migrated:  ${migrated}`);
  console.log(`⏭  Skipped:   ${skipped}`);
  console.log(`❌ Errors:    ${errors}`);
  console.log('\n📂 Category breakdown:');
  for (const [cat, count] of Object.entries(categoryCount).sort()) {
    console.log(`   ${cat.padEnd(15)} ${count}`);
  }

  if (isDryRun) {
    console.log('\n⚠️  DRY RUN — no files written. Run with --execute to apply.\n');
  } else {
    console.log(`\n✅ Migration complete. Vault: ${vaultDir}\n`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
