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
 * Build the Total Recall system documentation section.
 * Always compiled into INSTRUCTIONS.md so every IDE agent knows how to use the system.
 * Covers: MCP tools, REST API, memory model, semantic search, research queue.
 */
function buildSystemDocs(agentDir) {
  let brainUrl = 'http://localhost:4000';
  try {
    const cfgPath = agentDir ? path.join(agentDir, 'config', 'brain.json') : null;
    if (cfgPath && fs.existsSync(cfgPath)) {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      if (cfg.url) brainUrl = cfg.url.replace(/\/$/, '');
    }
  } catch { /* use default */ }

  return `
---

## 🧠 Total Recall — Sovereign AI OS

You are operating inside **Total Recall**, a persistent memory and knowledge system.
Your memory lives in \`.agent/memory-vault/\` as SSSS-format Markdown nodes.
Every fact, decision, correction, or preference MUST be written to the vault.

**Brain URL:** \`${brainUrl}\`
**Vault:** \`~/.agent/memory-vault/\`
**Sessions:** \`~/.agent/sessions/\`

---

### 🔧 MCP Tools

| Tool | Purpose |
|------|---------|
| \`write_memory\` | Write a new memory node (facts, decisions, corrections, preferences, patterns) |
| \`read_memory\` | Read a vault node by slug |
| \`list_memory\` | List nodes — filter by type, category, tag, status |
| \`delete_memory\` | Delete a node by slug |
| \`search_memory\` | Keyword search across vault nodes |
| \`semantic_search\` | Search vault nodes AND session history by meaning. Returns type: "vault" or "session". Requires Ollama + nomic-embed-text |
| \`recompile_surface\` | Rebuild INSTRUCTIONS.md + all derived indexes + embeddings. Run after writing nodes |
| \`web_search\` | Search the web for real-world facts, post-cutoff info, knowledge gap research |
| \`execute_code\` | Run Node.js in sandbox — use to call REST endpoints or process data |
| \`read_file\` | Read any file (home dir sandboxed) |
| \`write_file\` | Write any file (home dir sandboxed) |
| \`list_directory\` | List directory contents |
| \`list_research_queue\` | List all research projects: pending, in_progress, done, failed |
| \`queue_research\` | Add a topic to the research queue (post-cutoff facts, training gaps) |

**Rules:** Write to vault immediately when the user corrects you or shares a preference. Run \`semantic_search\` before answering non-trivial questions. Use \`queue_research\` + \`web_search\` for anything post-cutoff.

---

### 🌐 REST API

Base URL: \`${brainUrl}\` — all requests: \`Authorization: Bearer <token>\`

**Memory:**
- \`GET  /api/memory\` — list all nodes (?type= &tag= &status=)
- \`GET  /api/memory/:slug\` — get one node
- \`POST /api/memory\` — create node { type, title, body, tags, category, priority, modality }
- \`PUT  /api/memory/:slug\` — update node
- \`DELETE /api/memory/:slug\` — delete node
- \`POST /api/memory/search\` — keyword search { query, type, limit }
- \`POST /api/memory/search/semantic\` — semantic search { query, top_k, include_sessions }

**Research Queue:**
- \`GET  /api/research\` — list all projects (?status=pending|done|in_progress|failed)
- \`POST /api/research\` — queue topic { topic, priority, notes }
- \`PATCH /api/research/:id\` — update { status, notes, node_slug }
- \`DELETE /api/research/:id\` — remove

**Vault:**
- \`POST /api/vault/compile\` — recompile surface + rebuild all embeddings
- \`GET  /api/vault/nodes\` — all nodes with frontmatter
- \`GET  /api/vault/surface\` — compiled surface text
- \`GET  /api/vault/status\` — node count, embedding sizes, Ollama status

**Sessions:**
- \`GET  /api/sessions\` — list sessions
- \`GET  /api/sessions/:id\` — get session messages
- \`POST /api/sessions/ingest\` — ingest { source, messages: [{role, content}] }
- \`DELETE /api/sessions/:id\` — delete

**Import / Export:**
- \`GET  /api/import/rules\` — detect existing rule files (AGENTS.md, .cursorrules, etc.)
- \`POST /api/import/rules\` — import detected files into vault
- \`GET  /api/brain/export\` — download full brain .tar.gz

**System:**
- \`GET  /health\` — vault stats, embedding counts, Ollama reachability
- \`GET  /.well-known/total-recall.json\` — discovery manifest

---

### 📝 Memory Model (SSSS v2)

Key frontmatter fields:
- **category:** \`facts\` | \`patterns\` | \`preferences\` | \`instructions\` | \`corrections\` | \`concepts\` | \`rules\`
- **priority:** \`absolute\` (injected into INSTRUCTIONS.md on compile) | \`high\` | \`medium\` | \`low\`
- **modality:** \`must\` | \`must_not\` | \`should\` | \`should_not\` | \`neutral\`
- **confidence:** 0.0–1.0  **importance:** 1–10  **status:** \`active\` | \`archived\`

After writing nodes: call \`recompile_surface\` or \`POST /api/vault/compile\`.

---

### 🔍 Semantic Search Example

\`\`\`js
// MCP
semantic_search({ query: "how we handle auth", top_k: 5 })
// Results: [{ type: "vault", slug, title, score }, { type: "session", session_id, snippet, score }]

// REST (via execute_code)
const r = await fetch('${brainUrl}/api/memory/search/semantic', {
  method: 'POST', headers: { Authorization: 'Bearer <token>', 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: "how we handle auth", top_k: 5, include_sessions: true })
});
\`\`\`

---

### 🔬 Research Loop

When you encounter something post-cutoff or uncertain:
1. \`queue_research({ topic, priority: "high", notes: "reason" })\`
2. \`web_search({ query })\` — gather verified facts
3. \`write_memory({ ... })\` — save the correction node
4. \`PATCH /api/research/:id\` with \`{ status: "done", node_slug: "..." }\`

---
`;
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
