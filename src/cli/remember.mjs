import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { resolveAgentDir, resolveBrainDir, parseLayerFlag, getBothBrains, defaultLayerForCategory } from './agent-dir.mjs';
import { compileSurface } from '../core/surface.mjs';
import { writeNodeValidatedAsync } from '../core/validated-write.mjs';
import { defaultTitleFromBody } from '../core/memory-title.mjs';

function printHelp() {
  console.log(`
  total-recall remember — Remember rules, preferences, corrections, and facts in real time

  Usage: total-recall remember <category> "<content>" [options]

  Categories:
    invariant     - Mandatory behavioral directive in the canonical vault
    preference    - User style preference in the canonical vault
    correction    - Learned correction in the canonical vault
    fact          - Factual memory node
    concept       - Domain concept node
    pattern       - Positive design/behavior pattern
    anti-pattern  - Negative design/behavior anti-pattern
    decision      - Architectural decision
    lore          - Backstory and system context

  Options (SSSS v2 Frontmatter):
    --tags, -t <list>         Comma-separated list of tags (e.g. "config,server")
    --importance, -i <1-5>    Numerical importance level (default: 3)
    --priority, -p <level>    absolute | high | normal | low (default: normal)
    --modality, -m <type>     must | must_not | should | should_not | descriptive | preference
    --confidence, -c <0-1>    Confidence level (default: 1.0)
    --slug <custom-slug>      Define custom kebab-case slug
    --title <custom-title>    Define custom human-readable title
    --status <state>          active | draft | archived (default: active)
    --subject <string>        SPO Subject (default: system)
    --predicate <string>      SPO Predicate (default: remembers_fact)
    --object <string>         SPO Object (default: brain)
    --related <list>          Comma-separated list of related slugs
    --expires <duration>       TTL for temporary rules (e.g. "7d", "2w", "30d", "6h", "3m")

  Examples:
    npx total-recall remember invariant "Never run tsc directly." --importance 5 --priority absolute
    npx total-recall remember preference "Always use single quotes." --tags "style,js" --modality preference
    npx total-recall remember fact "The server runs on port 3000." --tags "config,port" --importance 4
    npx total-recall remember fact "Uses Drizzle ORM" --project   # Saves to project brain
    npx total-recall remember invariant "No var" --global          # Saves to global brain
`);
}

/**
 * Parse a human-friendly duration string and return a Date in the future.
 * Supported units: h (hours), d (days), w (weeks), m (months).
 * E.g. "7d" → 7 days from now, "2w" → 14 days from now.
 */
function parseDuration(str) {
  if (!str || typeof str !== 'string') {
    throw new Error(`Invalid duration: "${str}". Expected format like "7d", "2w", "30d", "6h", "3m".`);
  }
  const match = str.trim().match(/^(\d+)([hdwm])$/i);
  if (!match) {
    throw new Error(`Invalid duration: "${str}". Expected format like "7d", "2w", "30d", "6h", "3m".`);
  }
  const amount = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const date = new Date();
  switch (unit) {
    case 'h': date.setHours(date.getHours() + amount); break;
    case 'd': date.setDate(date.getDate() + amount); break;
    case 'w': date.setDate(date.getDate() + amount * 7); break;
    case 'm': date.setMonth(date.getMonth() + amount); break;
    default: throw new Error(`Unknown duration unit: "${unit}".`);
  }
  return date;
}

const RULE_SOFT_LIMIT = 300;
const RULE_HARD_LIMIT = 800;

export default async function remember(args) {
  // Parse layer flag first
  const { layer: explicitLayer, remainingArgs: layerArgs } = parseLayerFlag(args);
  const type = layerArgs[0];
  const bodyContent = layerArgs[1];

  if (!type || !bodyContent || type === '--help' || type === '-h') {
    printHelp();
    return;
  }

  const categoryMap = {
    invariant: 'invariants',
    preference: 'preferences',
    correction: 'anti-patterns',
    'anti-pattern': 'anti-patterns',
    pattern: 'patterns',
    decision: 'decisions',
    concept: 'concepts',
    fact: 'facts',
    lore: 'lore'
  };

  const category = categoryMap[type.toLowerCase()];

  if (!category) {
    console.error(`Invalid memory category: "${type}". Run total-recall remember --help for details.`);
    process.exit(1);
  }

  // Resolve layer: explicit flag > category heuristic > auto-detect
  let layer = explicitLayer;
  const project = getBothBrains().project;
  if (layer === 'auto') {
    layer = defaultLayerForCategory(category);
    // Fall back to global if no project brain exists
    // const project moved up
    if (layer === 'project' && !project) {
      layer = 'global';
    }
  }

  // Parse Options
  let tags = [];
  let importance = 3;
  let priority = 'normal';
  let modality = 'should';
  let confidence = 1.0;
  let slug = null;
  let title = null;
  let status = 'active';
  let subject = 'system';
  let predicate = 'remembers_fact';
  let object = 'brain';
  let related = [];
  let expiresAt = null;
  let allowLong = false;

  for (let i = 2; i < layerArgs.length; i++) {
    const arg = layerArgs[i];
    const val = layerArgs[i + 1];

    if (arg === '--tags' || arg === '-t') {
      if (val) {
        tags = val.split(',').map(t => t.trim());
        i++;
      }
    } else if (arg === '--importance' || arg === '-i') {
      if (val) {
        const num = parseInt(val, 10);
        if (!isNaN(num)) importance = num;
        i++;
      }
    } else if (arg === '--priority' || arg === '-p') {
      if (val) {
        priority = val.toLowerCase();
        i++;
      }
    } else if (arg === '--modality' || arg === '-m') {
      if (val) {
        modality = val.toLowerCase();
        i++;
      }
    } else if (arg === '--confidence' || arg === '-c') {
      if (val) {
        const num = parseFloat(val);
        if (!isNaN(num)) confidence = num;
        i++;
      }
    } else if (arg === '--slug') {
      if (val) {
        slug = val.trim();
        i++;
      }
    } else if (arg === '--title') {
      if (val) {
        title = val.trim();
        i++;
      }
    } else if (arg === '--status') {
      if (val) {
        status = val.toLowerCase();
        i++;
      }
    } else if (arg === '--subject') {
      if (val) {
        subject = val.trim();
        i++;
      }
    } else if (arg === '--predicate') {
      if (val) {
        predicate = val.trim();
        i++;
      }
    } else if (arg === '--object') {
      if (val) {
        object = val.trim();
        i++;
      }
    } else if (arg === '--related') {
      if (val) {
        related = val.split(',').map(r => r.trim());
        i++;
      }
    } else if (arg === '--expires') {
      if (val) {
        try {
          expiresAt = parseDuration(val).toISOString();
        } catch (err) {
          console.error(`❌ ${err.message}`);
          process.exit(1);
        }
        i++;
      }
    } else if (arg === '--no-dedup') {
      // Accepted for compatibility; remember never archives another node.
    } else if (arg === '--allow-long') {
      allowLong = true;
    }
  }

  // Rules load into every task capsule, so they must be brief.
  if (['invariants', 'preferences', 'anti-patterns'].includes(category) && !tags.includes('context:policy')) {
    const n = bodyContent.trim().length;
    if (n > RULE_HARD_LIMIT && !allowLong) {
      console.error(`❌ Rule is ${n} characters (limit ${RULE_HARD_LIMIT}). Rules must be brief: one or two sentences, no history, dates, quotes or incident detail (save those as a fact). Shorten it, or pass --allow-long.`);
      process.exit(1);
    }
    if (n > RULE_SOFT_LIMIT) console.error(`⚠️  Rule is ${n} characters. Keep rules brief (under ${RULE_SOFT_LIMIT}): state the constraint only, move history and examples to a fact. Shorten with: total-recall edit <slug> "<shorter>"`);
  }

  const resolvedAgentDir = resolveAgentDir(layer);
  const resolvedBrainDir = resolveBrainDir(layer);
  const skillsDir = path.join(resolvedAgentDir, 'skills');
  const vaultDir = path.join(resolvedBrainDir, 'memory-vault');
  const derivedDir = path.join(resolvedBrainDir, 'memory-derived');
  const instructionsFile = path.join(resolvedAgentDir, 'INSTRUCTIONS.md');
  const layerLabel = layer === 'project' ? '[project]' : '[global]';

  // Create individual SSSS v2 node in the vault
  const contentHash = crypto.createHash('md5').update(bodyContent).digest('hex').slice(0, 8);
  const finalSlug = slug || `${category}-${contentHash}`;
  // Provenance lives in source.type + tags — not a title prefix
  const finalTitle = title || defaultTitleFromBody(bodyContent);
  const finalTags = Array.isArray(tags) ? [...tags] : [];
  if (!finalTags.includes('self-captured') && !title) {
    finalTags.push('self-captured');
  }

  const now = new Date().toISOString();
  
  // Construct schema-compliant SSSS node
  const node = {
    type: 'memory',
    slug: finalSlug,
    category,
    title: finalTitle,
    project: (layer === 'project' && project) ? path.basename(project.projectRoot) : undefined,
    status,
    confidence,
    importance,
    created: now,
    updated: now,
    last_accessed: now,
    source: {
      type: 'remember-cli',
      session_id: process.env.TR_SESSION_ID || 'remember-session',
      evidence_count: 1,
      capture: 'self',
    },
    supersedes: [],
    superseded_by: null,
    contradicts: [],
    tags: finalTags,
    related,
    routes_to_skills: [],
    sentiment_polarity: type.toLowerCase() === 'preference' ? 'preference' : 'descriptive',
    sentiment_target: subject,
    modality,
    subject,
    predicate,
    object,
    decay: {
      half_life_days: 180,
      access_count: 1
    },
    schema_version: 2,
    ...(expiresAt ? { expires_at: expiresAt } : {}),
    x_temporal_context: now,
    body: bodyContent
  };

  // Add absolute invariant properties if priority is absolute
  if (priority === 'absolute') {
    node.priority = 'absolute';
    node.immutable = true;
  }

  // Saving memory never optimizes or archives other canonical documents.

  const vaultResult = await writeNodeValidatedAsync(node, vaultDir);
  if (!vaultResult.success) {
    console.error(`  ❌ Validation failed: ${vaultResult.validation.errors.join('; ')}`);
    if (vaultResult.repair) {
      console.error(`  🔧 Repair hints:`);
      for (const fe of vaultResult.repair.field_errors || []) {
        console.error(`     • ${fe.field}: ${fe.issue}`);
      }
    }
    process.exit(1);
  }
  console.log(`  ✅ Permanent SSSS memory node created ${layerLabel} in vault: memory-vault/${category}/${finalSlug}.md`);

  // The next local recall must see this write. Provider indexing is explicitly
  // selected by `compile`; a memory write never spawns an unowned worker.
  try {
    const { invalidate } = await import('../core/vault-cache.mjs');
    invalidate(vaultDir);
    await compileSurface({ vaultDir, skillsDir, derivedDir, instructionsFile, semantic: false });
    console.log('  ✅ Local memory indexes and instruction surfaces updated.');
  } catch (err) {
    console.error(`  ❌ Memory saved, but local compilation failed: ${err.message}`);
    process.exitCode = 1;
  }
}
