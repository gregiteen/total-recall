import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { resolveAgentDir, resolveBrainDir, parseLayerFlag, getBothBrains, defaultLayerForCategory } from './agent-dir.mjs';
import { compileSurface } from '../core/surface.mjs';
import { writeNode } from '../core/vault.mjs';

function printHelp() {
  console.log(`
  total-recall remember — Remember rules, preferences, corrections, and facts in real time

  Usage: total-recall remember <category> "<content>" [options]

  Categories:
    invariant     - Mandatory behavioral directive (appends to rules/invariants.md & writes to vault)
    preference    - User style preference (appends to rules/preferences.md & writes to vault)
    correction    - Learned correction (appends to rules/corrections.md & writes to vault)
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
  if (layer === 'auto') {
    layer = defaultLayerForCategory(category);
    // Fall back to global if no project brain exists
    const project = getBothBrains().project;
    if (layer === 'project' && !project) {
      layer = 'global';
    }
  }

  // Parse Options
  let tags = [];
  let importance = 3;
  let priority = 'normal';
  let modality = 'descriptive';
  let confidence = 1.0;
  let slug = null;
  let title = null;
  let status = 'active';
  let subject = 'system';
  let predicate = 'remembers_fact';
  let object = 'brain';
  let related = [];
  let expiresAt = null;

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
    }
  }

  const resolvedAgentDir = resolveAgentDir(layer);
  const resolvedBrainDir = resolveBrainDir(layer);
  const skillsDir = path.join(resolvedAgentDir, 'skills');
  const vaultDir = path.join(resolvedBrainDir, 'memory-vault');
  const derivedDir = path.join(resolvedBrainDir, 'memory-derived');
  const instructionsFile = path.join(resolvedAgentDir, 'INSTRUCTIONS.md');
  const layerLabel = layer === 'project' ? '[project]' : '[global]';

  // Rule sheet mapping (for push rules projection)
  const ruleFiles = {
    invariant:  { file: 'invariants.md' },
    preference: { file: 'preferences.md' },
    correction: { file: 'corrections.md' }
  };

  const ruleConfig = ruleFiles[type.toLowerCase()];

  if (ruleConfig) {
    const rulePath = path.join(skillsDir, 'total-recall', 'rules', ruleConfig.file);
    if (fs.existsSync(rulePath)) {
      let fileContent = fs.readFileSync(rulePath, 'utf8').trimEnd();
      const normalizedBody = bodyContent.startsWith('-') ? bodyContent : `- ${bodyContent}`;
      fileContent += `\n${normalizedBody}\n`;
      fs.writeFileSync(rulePath, fileContent, 'utf8');
      console.log(`  ✅ Rule successfully appended to rules sheet: ${ruleConfig.file}`);
    }
  }

  // Create individual SSSS v2 node in the vault
  const finalSlug = slug || `${category}-${crypto.randomBytes(4).toString('hex')}`;
  const truncatedContent = bodyContent.slice(0, 50) + (bodyContent.length > 50 ? '...' : '');
  const finalTitle = title || `Self-captured memory: ${truncatedContent.replace(/\n/g, ' ')}`;

  const now = new Date().toISOString();
  
  // Construct schema-compliant SSSS node
  const node = {
    type: 'memory',
    slug: finalSlug,
    category,
    title: finalTitle,
    status,
    confidence,
    importance,
    created: now,
    updated: now,
    last_accessed: now,
    source: {
      type: 'remember-cli',
      session_id: process.env.TR_SESSION_ID || 'remember-session',
      evidence_count: 1
    },
    supersedes: [],
    superseded_by: null,
    contradicts: [],
    tags,
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

  writeNode(node, vaultDir);
  console.log(`  ✅ Permanent SSSS memory node created ${layerLabel} in vault: memory-vault/${category}/${finalSlug}.md`);

  // Instantly recompile instructions and vector indexes in the exact same turn!
  console.log('  ⏳ Recompiling active memory surfaces and indexes...');
  try {
    const compileResult = await compileSurface({
      vaultDir,
      skillsDir,
      derivedDir,
      instructionsFile
    });
    console.log(`  ✅ Recompilation successful! Processed ${compileResult.nodesProcessed} SSSS nodes.`);
  } catch (err) {
    console.warn(`  ⚠️  Memory saved, but surface recompilation failed: ${err.message}`);
  }
}
