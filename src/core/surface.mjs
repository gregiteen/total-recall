import fs from 'fs';
import path from 'path';
import natural from 'natural';
import { loadNodes, loadSkills, atomicWrite } from './vault.mjs';
import { readEmergencyAlerts } from './emergency-alerts.mjs';
import { protectIDEInstructions } from './protect-instructions.mjs';
import {
  buildMemoryLayerIndex,
  inferMemoryLayer,
  memoryLayerRoutingWeight
} from './memory-layers.mjs';

/**
 * Extract [[slug]] wikilink references from body text.
 * Native TR link resolution; Obsidian renders them as graph edges.
 */
export function extractWikilinks(body) {
  if (!body) return [];
  const matches = body.match(/\[\[([^\]]+)\]\]/g) || [];
  return [...new Set(matches.map(m => m.slice(2, -2).split('|')[0].trim()))];
}

/**
 * Resolve [[slug]] → [label](slug) for compiled surfaces (INSTRUCTIONS.md).
 * Vault files keep [[slug]] intact so Obsidian renders wiki links natively.
 */
function resolveWikilinks(body, nodesBySlug) {
  if (!body) return body;
  return body.replace(/\[\[([^\]]+)\]\]/g, (_, inner) => {
    const [slugPart, aliasPart] = inner.split('|');
    const slug = slugPart.trim();
    const label = aliasPart?.trim() || nodesBySlug.get(slug)?.title || slug;
    return `[${label}](${slug})`;
  });
}

/**
 * Generate an Obsidian Canvas JSON file from active vault nodes.
 * Written to memory-vault/graph.canvas; also readable by /api/graph.
 */
function generateCanvas(nodes, vaultDir) {
  const active = nodes.filter(n => n.status === 'active');
  if (active.length === 0) return;

  const CARD_W = 240, CARD_H = 60, GAP_X = 60, GAP_Y = 30;
  const cols = Math.max(1, Math.ceil(Math.sqrt(active.length)));

  const canvasNodes = active.map((n, i) => ({
    id: n.slug,
    x: (i % cols) * (CARD_W + GAP_X),
    y: Math.floor(i / cols) * (CARD_H + GAP_Y),
    width: CARD_W,
    height: CARD_H,
    type: 'text',
    text: `**${n.title}**\n_${n.category}_`
  }));

  const slugSet = new Set(canvasNodes.map(n => n.id));
  const seen = new Set();
  const canvasEdges = [];

  for (const n of active) {
    const targets = [...(n.related || []), ...extractWikilinks(n.body || '')];
    for (const target of targets) {
      if (!slugSet.has(target) || target === n.slug) continue;
      const key = `${n.slug}→${target}`;
      if (seen.has(key)) continue;
      seen.add(key);
      canvasEdges.push({
        id: `e${canvasEdges.length}`,
        fromNode: n.slug,
        toNode: target,
        fromSide: 'right',
        toSide: 'left'
      });
    }
  }

  const canvasPath = path.join(vaultDir, 'graph.canvas');
  atomicWrite(canvasPath, JSON.stringify({ nodes: canvasNodes, edges: canvasEdges }, null, 2));
}

const ROUTING_THRESHOLD = 0.5;
const ROUTING_TOP_K = 3;
const INJECTION_BEGIN = '<!-- BEGIN INJECTED MEMORY: do not edit by hand; rebuilt by total-recall surface -->';
const INJECTION_END = '<!-- END INJECTED MEMORY -->';

export function replaceFirstManagedInjectionBlock(raw, injectionBlock) {
  const chunks = raw.match(/[^\n]*(?:\n|$)/g) || [];
  let inFence = false;
  let offset = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (chunk === '') continue;
    const line = chunk.endsWith('\n') ? chunk.slice(0, -1) : chunk;
    const trimmed = line.trim();

    if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
      inFence = !inFence;
      offset += chunk.length;
      continue;
    }

    if (!inFence && line === INJECTION_BEGIN) {
      let endOffset = offset + chunk.length;
      for (let j = i + 1; j < chunks.length; j++) {
        endOffset += chunks[j].length;
        const endLine = chunks[j].endsWith('\n') ? chunks[j].slice(0, -1) : chunks[j];
        if (endLine === INJECTION_END) {
          return `${raw.slice(0, offset)}${injectionBlock}\n${raw.slice(endOffset)}`;
        }
      }
      return null;
    }

    offset += chunk.length;
  }

  return null;
}

/**
 * Tokenize text for TF-IDF.
 */
function tokenize(text) {
  const tokenizer = new natural.WordTokenizer();
  return tokenizer.tokenize(text.toLowerCase());
}

/**
 * Build TF-IDF model over skill bodies.
 */
function buildTfidf(skills) {
  const tfidf = new natural.TfIdf();
  skills.forEach(skill => {
    tfidf.addDocument(tokenize(`${skill.name} ${skill.description} ${skill.body}`));
  });
  return tfidf;
}

/**
 * Z-normalize an array of (id, score) pairs.
 */
function zNormalize(scored) {
  if (scored.length === 0) return new Map();
  const values = scored.map(s => s.score);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  const std = Math.sqrt(variance) || 1;
  return new Map(scored.map(s => [s.id, (s.score - mean) / std]));
}

/**
 * Route nodes to skills using TF-IDF.
 */
export function routeNodesToSkills(nodes, skills) {
  const tfidf = buildTfidf(skills);
  const allRoutes = [];

  for (const node of nodes) {
    if (node.status !== 'active') continue;

    const routingText = [
      node.title,
      (node.tags || []).join(' '),
      (node.body || '').slice(0, 1000)
    ].join(' ');

    const tfidfScores = [];
    tfidf.tfidfs(tokenize(routingText), (i, measure) => {
      tfidfScores.push({ id: skills[i].name, score: measure });
    });

    const zTfidf = zNormalize(tfidfScores);

    const layer = inferMemoryLayer(node);
    const layerWeight = memoryLayerRoutingWeight(layer);

    const qualified = skills
      .map(s => ({
        slug: node.slug,
        skill: s.name,
        score: (zTfidf.get(s.name) || 0) * layerWeight,
        layer
      }))
      .filter(r => r.score >= ROUTING_THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .slice(0, ROUTING_TOP_K);

    allRoutes.push(...qualified);
  }

  return allRoutes;
}

/**
 * Inject rules into SKILL.md files.
 */
export function injectSkills(skills, allNodes, routes) {
  const nodesBySlug = new Map(allNodes.map(n => [n.slug, n]));
  const generatedAt = new Date().toISOString();

  for (const skill of skills) {
    const skillRoutes = routes
      .filter(r => r.skill === skill.name)
      .sort((a, b) => b.score - a.score)
      .slice(0, 7); // Max 7 rules per skill

    const injectedLines = [
      INJECTION_BEGIN,
      `<!-- @route: tfidf, generated_at: ${generatedAt} -->`,
      ''
    ];

    for (const route of skillRoutes) {
      const node = nodesBySlug.get(route.slug);
      if (!node) continue;
      injectedLines.push(`- **${node.slug}** (confidence ${node.confidence}, importance ${node.importance}):`);
      injectedLines.push(`  ${node.title}`);
      injectedLines.push('');
    }

    injectedLines.push(INJECTION_END);

    // Replace the block in the skill body
    const raw = fs.readFileSync(skill.filepath, 'utf8');
    const replaced = replaceFirstManagedInjectionBlock(raw, injectedLines.join('\n'));

    let newRaw;
    if (replaced !== null) {
      newRaw = replaced;
    } else {
      // Append if missing
      newRaw = raw + '\n\n' + injectedLines.join('\n') + '\n';
    }

    atomicWrite(skill.filepath, newRaw);
  }
}

/**
 * Map a node's modality to an assertive prefix for stronger enforcement.
 */
function assertivePrefix(node) {
  switch (node.modality) {
    case 'must':
      return '⚠️ MANDATORY';
    case 'must_not':
      return '🚫 NEVER';
    case 'should':
      return '💡 RECOMMENDED';
    case 'should_not':
      return '⚠️ AVOID';
    default:
      return '';
  }
}

/**
 * Build the Total Recall injection block content from absolute nodes, guides, and routing.
 * Adds assertive prefixes based on node modality for stronger enforcement.
 */
function buildInjectionBlock(nodes, agentDir, skillsDir) {
  const activeNodes = nodes.filter(n => n.status === 'active');
  
  // Include if priority is 'absolute' or 'high', OR category is 'invariants', 'preferences', or 'corrections'
  const absolutes = activeNodes.filter(n => 
    n.priority === 'absolute' || 
    n.priority === 'high' ||
    n.category === 'invariants' ||
    n.category === 'preferences' ||
    n.category === 'corrections'
  );

  const categoryOrder = {
    invariants: 1,
    preferences: 2,
    corrections: 3,
    patterns: 4,
    concepts: 5,
    facts: 6
  };

  absolutes.sort((a, b) => {
    const orderA = categoryOrder[a.category] || 99;
    const orderB = categoryOrder[b.category] || 99;
    if (orderA !== orderB) return orderA - orderB;
    return a.slug.localeCompare(b.slug);
  });

  const nodesBySlug = new Map(nodes.map(n => [n.slug, n]));
  const generatedAt = new Date().toISOString();

  const preamble = buildPreamble(agentDir);
  const systemDocs = buildSystemDocs(agentDir);
  const routingTable = buildSkillRoutingTable(skillsDir);

  const lines = [
    INJECTION_BEGIN,
    `<!-- tier: 1, generated_at: ${generatedAt} -->`,
    '',
    preamble,
    systemDocs,
    routingTable,
    '## 🛡️ Active Memory Invariants',
    'These are active, inviolable memory rules compiled directly from your semantic vault.',
    ''
  ];

  for (const node of absolutes) {
    const prefix = assertivePrefix(node);
    const titleLine = prefix ? `### ${prefix}: ${node.title}` : `### ${node.title}`;
    lines.push(titleLine);
    // Resolve [[wikilinks]] to plain markdown in compiled output, supporting body/content fallback
    const bodyText = node.body || node.content || '';
    lines.push(resolveWikilinks(bodyText, nodesBySlug));
    lines.push('');
  }

  lines.push(INJECTION_END);
  return lines.join('\n');
}

/**
 * Inject or update a Total Recall block inside an existing instruction file.
 * Preserves all content the user already has. Only manages the clearly-marked block.
 */
function injectIntoExisting(filePath, injectionBlock) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const replaced = replaceFirstManagedInjectionBlock(raw, injectionBlock);

  let newRaw;
  if (replaced !== null) {
    newRaw = replaced;
  } else {
    // Append new block at the bottom
    newRaw = raw.trimEnd() + '\n\n' + injectionBlock + '\n';
  }
  atomicWrite(filePath, newRaw);
}

/**
 * Build the skill routing table for the preamble.
 * Maps common topics/tags to skill file paths.
 */
function buildSkillRoutingTable(skillsDir) {
  try {
    const skills = loadSkills(skillsDir);
    if (skills.length === 0) return '';

    const rows = skills.flatMap(s => {
      const relPath = `.agent/skills/${s.name}/SKILL.md`;
      const primary = `| ${s.name} | ${relPath} |`;
      const aliasRows = (s.aliases || []).map(a => `| ${a} | ${relPath} |`);
      return [primary, ...aliasRows];
    });

    return [
      '',
      '## 📋 Topic → Skill Routing',
      'If your task involves any of these topics, you MUST read the matching SKILL.md BEFORE responding:',
      '',
      '| Topic | Skill File |',
      '|-------|-----------|',
      ...rows,
      '',
    ].join('\n');
  } catch {
    return '';
  }
}

/**
 * Build the enforcement preamble that goes at the top of INSTRUCTIONS.md.
 */
function buildPreamble(agentDir) {
  const interruptsFile = agentDir
    ? path.join(agentDir, 'interrupts', 'pending.md')
    : '~/.agent/interrupts/pending.md';

  return [
    '## ⚡ Before You Respond',
    '',
    '1. You **MUST** have read every rule below. Violations are tracked and rules that are violated repeatedly are automatically escalated.',
    '2. If your task involves a specific domain, **READ the matching SKILL.md first** (see routing table below).',
    '3. **Search `.agent/memory-vault/`** for relevant past decisions before proposing new approaches.',
    '4. When you learn a new pattern or receive a correction, **write it to the memory vault** and run `npx total-recall compile`.',
    `5. **CHECK INTERRUPTS FIRST:** Read \`${interruptsFile}\`. If it has content, incorporate those insights into your response naturally (as if you just recalled them). Then immediately overwrite the file with an empty string to clear it. This is how Total Recall's background engine delivers new conclusions into active conversations.`,
    '',
  ].join('\n');
}

/**
 * Build the Total Recall System documentation section.
 * Written into every compiled INSTRUCTIONS.md so IDE agents have immediate
 * access to tool lists, REST API references, and research protocols.
 */
function buildSystemDocs(agentDir) {
  // Read Brain URL and token from config if available
  let brainUrl = 'http://localhost:3000';
  let token = '<YOUR_PAT_TOKEN>'; // Always redacted in compiled instructions for security
  try {
    const configPath = path.join(agentDir, 'config', 'brain.json');
    if (fs.existsSync(configPath)) {
      const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (cfg.url) brainUrl = cfg.url;
    }
  } catch { /* use default */ }

  return [
    '',
    '## 🧠 Total Recall System',
    '',
    `**What it is:** Total Recall is a Sovereign AI OS — a local, filesystem-native memory and reasoning kernel that runs alongside your IDE. It maintains a structured semantic memory vault (SSSS v2 nodes), compiles rules into IDE instruction files, and runs background research and embedding daemons.`,
    '',
    `**REST API Base URL:** \`${brainUrl}\``,
    `**Active Bearer PAT Token:** \`${token}\``,
    '',
    '### 🧭 Tool & API Selection Heuristics',
    '1. **Local Skills**: Use local skill packages (located in `.agent/skills/`) for file/workspace changes, tests, and linting. If a custom script is provided, invoke it via shell command execution.',
    '2. **Total Recall Brain**: For all semantic searches, memory retrieval, memory writes, and derived index recompilation, **ALWAYS use shell `curl` commands** targeting the REST API endpoints documented below.',
    '',
    '### 🌐 Direct REST API Reference & curl Templates',
    'All requests require the header: `Authorization: Bearer ' + token + '`',
    '',
    '#### 1. Check System Health',
    '```bash',
    'curl -H "Authorization: Bearer ' + token + '" \\',
    '  ' + brainUrl + '/health',
    '```',
    '',
    '#### 2. Vector Semantic Search',
    '```bash',
    'curl -X POST \\',
    '  -H "Authorization: Bearer ' + token + '" \\',
    '  -H "Content-Type: application/json" \\',
    '  -d \'{"query": "YOUR_SEARCH_QUERY", "top_k": 5}\' \\',
    '  ' + brainUrl + '/api/memory/search/semantic',
    '```',
    '',
    '#### 3. Fetch a Specific Memory Node',
    '```bash',
    'curl -H "Authorization: Bearer ' + token + '" \\',
    '  ' + brainUrl + '/api/memory/YOUR_NODE_SLUG',
    '```',
    '',
    '#### 4. List All Memory Nodes',
    '```bash',
    'curl -H "Authorization: Bearer ' + token + '" \\',
    '  "' + brainUrl + '/api/memory"',
    '```',
    '',
    '#### 5. Create or Update a Memory Node',
    '```bash',
    'curl -X POST \\',
    '  -H "Authorization: Bearer ' + token + '" \\',
    '  -H "Content-Type: application/json" \\',
    '  -d \'{',
    '    "slug": "kebab-case-slug",',
    '    "category": "facts",',
    '    "title": "Clear concise memory title",',
    '    "status": "active",',
    '    "priority": "normal",',
    '    "modality": "must",',
    '    "content": "Detailed rule, fact, or workflow in markdown format."',
    '  }\' \\',
    '  ' + brainUrl + '/api/memory',
    '```',
    '',
    '#### 6. Recompile Memory Surface',
    '```bash',
    'curl -X POST \\',
    '  -H "Authorization: Bearer ' + token + '" \\',
    '  ' + brainUrl + '/api/vault/compile',
    '```',
    '',
    '#### 7. Archive a Memory Node',
    '```bash',
    'curl -X DELETE \\',
    '  -H "Authorization: Bearer ' + token + '" \\',
    '  ' + brainUrl + '/api/memory/YOUR_NODE_SLUG',
    '```',
    '',
    '#### 8. Queue Background Research',
    '```bash',
    'curl -X POST \\',
    '  -H "Authorization: Bearer ' + token + '" \\',
    '  -H "Content-Type: application/json" \\',
    '  -d \'{"topic": "Next.js 15 routing models", "priority": "high"}\' \\',
    '  ' + brainUrl + '/api/research',
    '```',
    '',
    '### 📦 SSSS v2 Memory Node Schema Reference',
    'Save memories with valid SSSS v2 fields:',
    '- `slug`: (string) Unique ID, kebab-case (matches filename: `slug.md`)',
    '- `title`: (string) Descriptive human-readable title',
    '- `category`: (string) `facts` / `patterns` / `concepts` / `preferences` / `corrections`',
    '- `status`: (string) `active` / `draft` / `archived`',
    '- `priority`: (string) `absolute` / `high` / `normal` / `low`',
    '- `modality`: (string) `must` / `must_not` / `should` / `should_not` / `neutral`',
    '- `body`: (string) Comprehensive markdown body detailing the rule, preference, or fact',
    '',
    '### 🔬 Research System (Autonomous Background Daemon)',
    'The research system runs as an autonomous background daemon. Queue complex topics with the POST `/api/research` route, and monitor progress using GET `/api/research`. Confidence scores >=0.7 automatically create `active` vault nodes.',
    ''
  ].join('\n');
}

/**
 * Compile absolute priority rules into Tier 1 (INSTRUCTIONS.md)
 * and inject into all existing IDE instruction files non-destructively.
 *
 * Adds:
 * - Enforcement preamble ("Before You Respond")
 * - Assertive prefixes (⚠️ MANDATORY / 🚫 NEVER) based on modality
 * - Topic → Skill routing table
 */
export function compileTier1(nodes, instructionsFile, agentDir) {
  const skillsDir = path.join(path.dirname(instructionsFile), 'skills');
  const injectionBlock = buildInjectionBlock(nodes, agentDir, skillsDir);

  // Check for emergency alerts — these go at the VERY TOP, before everything else
  const emergencyAlerts = readEmergencyAlerts();
  const alertBlock = emergencyAlerts
    ? emergencyAlerts + '\n---\n\n'
    : '';

  // Always write the canonical INSTRUCTIONS.md fresh
  const header = [
    '# Tier 1 Invariants (Total Recall Hot Memory)',
    '> This file is compiled automatically. Do not edit directly.',
    ''
  ].join('\n');
  atomicWrite(instructionsFile, alertBlock + header + injectionBlock + '\n');

  // Back up the system compiled output for IDE edit diffing
  const backupFile = path.join(agentDir, 'memory-derived', 'INSTRUCTIONS.system.md');
  try {
    fs.mkdirSync(path.dirname(backupFile), { recursive: true });
    atomicWrite(backupFile, header + injectionBlock + '\n');
  } catch (err) {
    // Non-fatal
  }

  // For each IDE shim: inject into existing files, or create a symlink if missing
  const shims = [
    '.cursorrules',
    'CLAUDE.md',
    '.clauderules',
    'AGENTS.md',
    'GEMINI.md',
    '.github/copilot-instructions.md',
    '.vscode/copilot-instructions.md',
    '.windsurfrules',
    'WINDSURF.md',
    'CODEX.md',
    '.codexrules'
  ];
  const baseDir = path.dirname(instructionsFile);

  for (const shim of shims) {
    const shimPath = path.join(baseDir, shim);
    const shimDir = path.dirname(shimPath);
    try {
      if (fs.existsSync(shimPath)) {
        const stat = fs.lstatSync(shimPath);
        if (!stat.isSymbolicLink()) {
          // Real file with existing content — inject non-destructively
          injectIntoExisting(shimPath, injectionBlock);
        }
        // If it's already a symlink to INSTRUCTIONS.md, nothing to do
      } else {
        // Ensure parent directory of the shim exists before writing/symlinking
        if (!fs.existsSync(shimDir)) {
          fs.mkdirSync(shimDir, { recursive: true });
        }
        // Use relative path target for symlink so it's correct from the subdirectory
        const relativeTarget = path.relative(shimDir, instructionsFile);
        fs.symlinkSync(relativeTarget, shimPath);
      }
    } catch (err) {
      // Ignore permission errors etc.
    }
  }
}

/**
 * Main surface compilation entry point.
 */
export async function compileSurface({ vaultDir, skillsDir, derivedDir, instructionsFile }) {
  const agentDir = path.dirname(instructionsFile);

  // 1. Run protection check to auto-import any manual edits made in the IDE
  try {
    protectIDEInstructions({ vaultDir, derivedDir, instructionsFile });
  } catch (err) {
    // Non-fatal
  }

  const nodes = loadNodes(vaultDir);
  const skills = loadSkills(skillsDir);

  const routes = routeNodesToSkills(nodes, skills);

  injectSkills(skills, nodes, routes);
  compileTier1(nodes, instructionsFile, agentDir);

  // Write derived indexes
  if (!fs.existsSync(derivedDir)) {
    fs.mkdirSync(derivedDir, { recursive: true });
  }

  const graphIndex = nodes.map(n => ({
    slug: n.slug,
    title: n.title,
    category: n.category,
    status: n.status,
    confidence: n.confidence,
    memory_layer: inferMemoryLayer(n)
  }));
  atomicWrite(path.join(derivedDir, 'graph-index.jsonl'), graphIndex.map(n => JSON.stringify(n)).join('\n'));
  atomicWrite(
    path.join(derivedDir, 'memory-layers.jsonl'),
    buildMemoryLayerIndex(nodes).map(n => JSON.stringify(n)).join('\n')
  );

  atomicWrite(path.join(derivedDir, 'skill-routes.jsonl'), routes.map(r => JSON.stringify(r)).join('\n'));

  // Build semantic embeddings index if Ollama is available (fire-and-forget; skips silently if not)
  let semanticResult = { indexed: 0, skipped: nodes.length, unavailable: true };
  try {
    const { buildSemanticIndex } = await import('./semantic-index.mjs');
    semanticResult = await buildSemanticIndex(nodes, derivedDir);
  } catch { /* semantic index is optional — never block compile */ }



  // Generate Obsidian Canvas (fire-and-forget; native graph artifact)
  try {
    generateCanvas(nodes, vaultDir);
  } catch { /* non-fatal */ }

  return {
    nodesProcessed: nodes.length,
    skillsInjected: skills.length,
    semanticIndexed: semanticResult.indexed,
    semanticUnavailable: semanticResult.unavailable
  };
}
