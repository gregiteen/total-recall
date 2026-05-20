import fs from 'fs';
import path from 'path';
import natural from 'natural';
import { loadNodes, loadSkills, atomicWrite } from './vault.mjs';
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
 * Build the Total Recall injection block content from absolute nodes.
 * Adds assertive prefixes based on node modality for stronger enforcement.
 */
function buildInjectionBlock(nodes) {
  const absolutes = nodes.filter(n => n.priority === 'absolute' && n.status === 'active');
  const nodesBySlug = new Map(nodes.map(n => [n.slug, n]));
  const generatedAt = new Date().toISOString();

  const lines = [
    INJECTION_BEGIN,
    `<!-- @tier: 1, generated_at: ${generatedAt} -->`,
    ''
  ];

  for (const node of absolutes) {
    const prefix = assertivePrefix(node);
    const titleLine = prefix ? `## ${prefix}: ${node.title}` : `## ${node.title}`;
    lines.push(titleLine);
    // Resolve [[wikilinks]] to plain markdown in compiled output
    lines.push(resolveWikilinks(node.body, nodesBySlug));
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
  // Read Brain URL from config if available
  let brainUrl = 'http://localhost:3000';
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
    `**Brain URL:** \`${brainUrl}\`  (REST API base; also the MCP server endpoint)`,
    '',
    '### 🔧 MCP Tools (13 total)',
    '',
    '| Tool | Purpose |',
    '|------|---------|',
    '| `semantic_search` | Vector search across vault nodes and session history |',
    '| `recall_node` | Fetch a single memory node by slug |',
    '| `list_nodes` | List vault nodes filtered by category/status/priority |',
    '| `write_node` | Create or update a memory node (SSSS v2) |',
    '| `delete_node` | Archive a memory node (sets status → archived) |',
    '| `queue_research` | Add a topic to the autonomous research agenda |',
    '| `list_research_queue` | Check status of queued topics + read daemon findings |',
    '| `recompile_surface` | Rebuild INSTRUCTIONS.md + skill routes + embeddings |',
    '| `get_health` | Vault stats, Ollama reachability, embedding counts |',
    '| `list_skills` | Enumerate available agent skills and their descriptions |',
    '| `read_skill` | Read the full SKILL.md for a specific skill |',
    '| `list_inbox` | List pending inbox items (draft research, conflicts) |',
    '| `resolve_inbox` | Promote, reject, or modify an inbox item |',
    '',
    '### 🌐 REST API Reference',
    '',
    '| Method | Endpoint | Description |',
    '|--------|----------|-------------|',
    `| GET | \`${brainUrl}/health\` | System health (vault count, embeddings, Ollama status) |`,
    `| GET | \`${brainUrl}/api/vault/status\` | Vault stats summary |`,
    `| GET | \`${brainUrl}/api/nodes\` | List all nodes (query: category, status, priority) |`,
    `| GET | \`${brainUrl}/api/nodes/:slug\` | Fetch a single node by slug |`,
    `| POST | \`${brainUrl}/api/nodes\` | Create or upsert a memory node |`,
    `| DELETE | \`${brainUrl}/api/nodes/:slug\` | Archive a node |`,
    `| POST | \`${brainUrl}/api/search\` | Semantic search (body: { query, top_k }) |`,
    `| GET | \`${brainUrl}/api/research/queue\` | List research agenda |`,
    `| POST | \`${brainUrl}/api/research/queue\` | Queue a research topic |`,
    `| POST | \`${brainUrl}/api/compile\` | Trigger surface recompile |`,
    `| GET | \`${brainUrl}/api/import/rules\` | Detect importable rule files in repo |`,
    `| POST | \`${brainUrl}/api/import/rules\` | Import detected rule files into vault |`,
    '',
    '### 📦 SSSS v2 Memory Node Fields',
    '',
    '| Field | Type | Description |',
    '|-------|------|-------------|',
    '| `slug` | string | Unique ID, kebab-case |',
    '| `title` | string | Human-readable title |',
    '| `category` | string | `facts` / `patterns` / `concepts` / `preferences` / `corrections` |',
    '| `status` | string | `active` / `draft` / `archived` |',
    '| `priority` | string | `absolute` / `high` / `normal` / `low` |',
    '| `modality` | string | `must` / `must_not` / `should` / `should_not` / `neutral` |',
    '| `confidence` | number | 0.0–1.0 (daemon-managed for research nodes) |',
    '| `importance` | string | `critical` / `high` / `normal` / `low` |',
    '| `tags` | string[] | Freeform tags for routing and search |',
    '| `body` | string | Full markdown content; supports `[[wikilinks]]` |',
    '| `related` | string[] | Slugs of related nodes (graph edges) |',
    '| `sources` | object[] | Citations: `{ url, title, retrieved_at }` |',
    '',
    '### 🔍 Semantic Search Examples',
    '',
    '**Via MCP:**',
    '```json',
    '{ "tool": "semantic_search", "arguments": { "query": "how to handle rate limiting", "top_k": 5 } }',
    '```',
    '',
    `**Via REST:** \`POST ${brainUrl}/api/search\``,
    '```json',
    '{ "query": "authentication patterns", "top_k": 3 }',
    '```',
    '',
    '### 🔬 Research System (Autonomous Background Daemon)',
    '',
    'The research system runs as a **background daemon** — not something you trigger manually.',
    'Your job as an agent is to **queue topics** and **read results**. The daemon does everything else.',
    '',
    '**How it works:**',
    '1. Topics sit on a prioritized Research Agenda (`~/.agent/research-agenda.jsonl`).',
    '   Topics are added by: session inference (daemon reads sessions post-mortem), direct agent queuing, self-diagnosis, or as follow-up gaps from prior research.',
    '2. Each daemon cycle pulls the highest-priority `pending` or `partially-covered` topic.',
    '3. It gathers from **all available real sources in parallel:**',
    '   - Web search (Brave → Serper fallback)',
    '   - DuckDuckGo Instant Answers',
    '   - Wikipedia',
    '   - arXiv (for academic/ML topics)',
    '   - npm registry (for JS/Node topics)',
    '   - GitHub repositories (for code/library topics)',
    '   - Deep page crawl of the top result (Playwright or plain fetch)',
    '4. A local LLM synthesizes all results into: summary, key facts with inline citations, confidence score, temporal context, contradictions found, and **further research gaps**.',
    '5. **Confidence routing:**',
    '   - ≥0.7 → written directly to vault as `active` node + INSTRUCTIONS.md recompiled immediately',
    '   - <0.7 → written as `draft` to inbox for validation before promotion',
    '6. **Self-multiplication:** gaps identified during synthesis are automatically added back to the agenda as follow-up topics with slightly lower priority.',
    '7. **Topic status** is never binary done/not-done: `pending` → `partially-covered` → `well-covered`. Well-covered topics have a 60-day decay half-life and are automatically re-queued as knowledge goes stale.',
    '8. When the agenda is empty, the daemon runs **self-diagnosis** — audits vault coverage, ages, and source diversity, then auto-queues new topics for weak areas.',
    '',
    '**What you as an agent should do:**',
    '- `queue_research({ topic, priority, notes })` — add a topic (post-cutoff fact, uncertain claim, knowledge gap)',
    '- `list_research_queue()` — check status of queued topics and read completed findings',
    '- `semantic_search({ query })` — search vault for facts already researched by the daemon',
    '',
    '**What you should NOT do:**',
    '- Do not manually run web searches and call that "research done"',
    '- Do not mark research complete — the daemon manages status based on coverage scores across multiple sources',
    '- Do not write speculative facts to the vault — that\'s what the inbox validation path is for',
    '',
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
  const injectionBlock = buildInjectionBlock(nodes);
  const skillsDir = path.join(path.dirname(instructionsFile), 'skills');
  const routingTable = buildSkillRoutingTable(skillsDir);
  const preamble = buildPreamble(agentDir);
  const systemDocs = buildSystemDocs(agentDir);

  // Always write the canonical INSTRUCTIONS.md fresh
  const header = [
    '# Tier 1 Invariants (Total Recall Hot Memory)',
    '> This file is compiled automatically. Do not edit directly.',
    ''
  ].join('\n');
  atomicWrite(instructionsFile, header + preamble + systemDocs + routingTable + injectionBlock + '\n');

  // For each IDE shim: inject into existing files, or create a symlink if missing
  const shims = ['.cursorrules', 'CLAUDE.md', '.clauderules', 'AGENTS.md', 'GEMINI.md'];
  const baseDir = path.dirname(instructionsFile);
  const baseName = path.basename(instructionsFile);

  for (const shim of shims) {
    const shimPath = path.join(baseDir, shim);
    try {
      if (fs.existsSync(shimPath)) {
        const stat = fs.lstatSync(shimPath);
        if (!stat.isSymbolicLink()) {
          // Real file with existing content — inject non-destructively
          injectIntoExisting(shimPath, injectionBlock);
        }
        // If it's already a symlink to INSTRUCTIONS.md, nothing to do
      } else {
        // Doesn't exist — create a symlink pointing to INSTRUCTIONS.md
        fs.symlinkSync(baseName, shimPath);
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
