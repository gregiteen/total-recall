import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { loadSkills, atomicWrite, walkMd } from './vault.mjs';
import { getNodes } from './vault-cache.mjs';
import matter from 'gray-matter';
import {
  buildMemoryLayerIndex,
  inferMemoryLayer,
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

// ─── Legacy injection markers (kept for cleanup of old files) ───
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

const DIRECTIVES_BEGIN = '<!-- BEGIN INJECTED ACTIVE DIRECTIVES: do not edit by hand; rebuilt by total-recall surface -->';
const DIRECTIVES_END = '<!-- END INJECTED ACTIVE DIRECTIVES -->';

function extractRuleContent(filePath) {
  if (!fs.existsSync(filePath)) return '';
  const content = fs.readFileSync(filePath, 'utf8');
  const parts = content.split('---');
  if (parts.length >= 3) {
    return parts.slice(2).join('---').trim();
  }
  return content.trim();
}

/**
 * Load cache of compacted rules.
 */
function loadCompactedRulesCache(derivedDir) {
  if (!derivedDir) return {};
  const cachePath = path.join(derivedDir, 'compacted-rules.json');
  if (!fs.existsSync(cachePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(cachePath, 'utf8'));
  } catch {
    return {};
  }
}

/**
 * Save cache of compacted rules.
 */
function saveCompactedRulesCache(derivedDir, cache) {
  if (!derivedDir) return;
  const cachePath = path.join(derivedDir, 'compacted-rules.json');
  try {
    fs.mkdirSync(derivedDir, { recursive: true });
    atomicWrite(cachePath, JSON.stringify(cache, null, 2));
  } catch (err) {
    // Non-fatal
  }
}

/**
 * Heuristically summarize a memory node.
 */
export function heuristicCompact(node) {
  const title = (node.title || '').trim();
  const text = (node.body || node.content || '').trim();
  
  let summary = title;
  if (text) {
    const firstLine = text.split('\n').map(l => l.trim()).filter(Boolean)[0] || '';
    if (firstLine && 
        !title.toLowerCase().includes(firstLine.toLowerCase()) && 
        !firstLine.toLowerCase().includes(title.toLowerCase())) {
      const separator = /[.!?]$/.test(title) ? ' ' : ' — ';
      summary = `${title}${separator}${firstLine}`;
    }
  }
  
  summary = summary.replace(/\s+/g, ' ');
  if (summary.length > 180) {
    summary = summary.substring(0, 180).trim() + '... (use recall to read more)';
  }
  return summary;
}

/**
 * Compact a single memory node using LLM or heuristic fallback.
 */
async function compactNode(node, derivedDir) {
  const title = (node.title || '').trim();
  const body = (node.body || node.content || '').trim();
  const fullText = `${title}\n\n${body}`;
  const contentHash = crypto.createHash('sha256').update(fullText).digest('hex');

  // Load from cache if possible
  let cache = {};
  if (derivedDir) {
    cache = loadCompactedRulesCache(derivedDir);
    if (cache[node.slug] && cache[node.slug].content_sha256 === contentHash) {
      return cache[node.slug].compacted;
    }
  }

  // Fallback default
  let compacted = heuristicCompact(node);

  // If LLM compacting is requested
  if (process.env.TR_LLM_COMPACT === 'true') {
    try {
      const { callLocalRuntime, loadRuntimeConfig } = await import('./runtime.mjs');
      const runtimeConfig = loadRuntimeConfig();
      
      const systemPrompt = "You are a Rule Compactor. Your task is to compress a system instruction or preference rule into a single, dense, highly actionable sentence. Preserve all key constraints, file paths, model names, or terminal commands verbatim. Return only the compacted sentence and nothing else.";
      const userPrompt = `Rule Title: ${title}\nRule Body: ${body}`;
      
      const response = await callLocalRuntime(userPrompt, systemPrompt, runtimeConfig);
      const cleanResponse = response.trim().replace(/\s+/g, ' ');
      if (cleanResponse && cleanResponse.length > 0 && cleanResponse.length < 250) {
        compacted = cleanResponse;
      }
    } catch (err) {
      // Graceful fallback to heuristic
    }
  }

  // Save to cache
  if (derivedDir) {
    cache[node.slug] = {
      compacted,
      content_sha256: contentHash,
      updated_at: new Date().toISOString()
    };
    saveCompactedRulesCache(derivedDir, cache);
  }

  return compacted;
}

export async function buildRulesBlock(skillsDir, nodes = [], { consumer = 'ide', derivedDir } = {}) {
  let combined;

  if (consumer === 'api') {
    // API consumers don't need CLI quickstart docs
    combined = `## Total Recall — Active Memory Context\n\nYour memories and rules are loaded from the active brain vault.\n`;
  } else {
    // CLI quickstart is always included so agents know TR is installed
    combined = `## Total Recall — Sovereign Memory System (Installed)

You have Total Recall installed. Use these CLI commands to remember and recall information.

### npx total-recall remember <category> "<content>" [options]
Save rules, preferences, corrections, and facts to permanent memory.

**Categories:** invariant, preference, correction, fact, concept, pattern, anti-pattern, decision, lore

**Options:**
  --tags, -t <list>          Comma-separated tags (e.g. "config,server")
  --importance, -i <1-5>     Importance level (default: 3)
  --priority, -p <level>     absolute | high | normal | low (default: normal)
  --modality, -m <type>      must | must_not | should | should_not | descriptive | preference
  --confidence, -c <0-1>     Confidence level (default: 1.0)
  --slug <custom-slug>       Custom kebab-case slug
  --title <custom-title>     Custom human-readable title
  --status <state>           active | draft | archived (default: active)
  --related <list>           Comma-separated related slugs
  --global                   Save to global brain (identity layer)
  --project                  Save to project brain (context layer)

**Examples:**
  npx total-recall remember invariant "Never run tsc directly." --importance 5 --priority absolute
  npx total-recall remember preference "Always use single quotes." --tags "style,js"
  npx total-recall remember fact "The server runs on port 3000." --importance 4
  npx total-recall remember fact "Uses Drizzle ORM" --project

### npx total-recall recall "<query>" [options]
Semantic search across rules, facts, and session history.

**Options:**
  --top-k, -k <number>       Results to return (default: 5, max: 20)
  --no-sessions, -ns         Exclude session chunks, vault only
  --format, -f <type>        text (default) or json
  --category, -cat <name>    Filter by SSSS category
  --tags, -t <list>          Filter by tags
  --modality, -m <type>      Filter by modality
  --importance, -i <1-5>     Filter by minimum importance
  --global                   Search global brain only
  --project                  Search project brain only

**Examples:**
  npx total-recall recall "Never run tsc directly"
  npx total-recall recall "Express server port" --top-k 3
  npx total-recall recall "tsc" --category invariants --modality must

### npx total-recall forget <slug> [options]
Delete a memory node by slug. Auto-recompiles surfaces and propagates to project brains.

**Options:**
  --global                   Delete from global brain
  --project                  Delete from project brain
  --no-compile               Skip auto-recompilation after deletion

**Examples:**
  npx total-recall forget old-invariant-slug
  npx total-recall forget stale-fact --global
  npx total-recall forget project-specific-node --project

### npx total-recall help <topic>
Query interactive local documentation, VFS specifications, and command references.

**Options:**
  --json, -j               Emit machine-readable JSON (ideal for programmatic retrieval)

**Examples:**
  npx total-recall help connect
  npx total-recall help architecture
  npx total-recall help ssss

### npx total-recall --help
Show all available commands.
`;
  }

  // 1. Filter expired rules. Compilation must remain a pure projection step;
  // archival is handled by explicit memory operations.
  const now = new Date();
  const isExpired = (n) => n.expires_at && new Date(n.expires_at) <= now;

  const expiredNodes = nodes.filter(n => n.status === 'active' && isExpired(n));
  for (const expired of expiredNodes) {
    console.error(`⏰ Expired rule omitted from surface: ${expired.slug}`);
  }

  // 2. Group active (non-expired) rules from SSSS vault nodes.
  // Note: Only invariants, preferences, and anti-patterns are included in instructions,
  // enforcing Category Partitioning (concepts, decisions, facts are search-only).
  const invariants = nodes.filter(n => n.category === 'invariants' && n.status === 'active' && !isExpired(n));
  const preferences = nodes.filter(n => n.category === 'preferences' && n.status === 'active' && !isExpired(n));
  const corrections = nodes.filter(n => n.category === 'anti-patterns' && n.status === 'active' && !isExpired(n));

  const formatNodes = async (list) => {
    const formatted = [];
    for (const n of list) {
      const snippet = await compactNode(n, derivedDir);
      formatted.push(snippet.startsWith('-') ? snippet : `- ${snippet}`);
    }
    return formatted.join('\n');
  };

  if (invariants.length > 0) {
    combined += `\n\n## Invariant Rules\n\n${await formatNodes(invariants)}`;
  }

  if (preferences.length > 0) {
    combined += `\n\n## User Preferences\n\n${await formatNodes(preferences)}`;
  }

  if (corrections.length > 0) {
    combined += `\n\n## Corrections\n\n${await formatNodes(corrections)}`;
  }

  // 2. Append legacy rule sheet files if they exist
  if (skillsDir) {
    const rulesDir = path.join(skillsDir, 'total-recall', 'rules');
    const legacyInvariants = extractRuleContent(path.join(rulesDir, 'invariants.md'));
    const legacyPreferences = extractRuleContent(path.join(rulesDir, 'preferences.md'));
    const legacyCorrections = extractRuleContent(path.join(rulesDir, 'corrections.md'));

    if (legacyInvariants) {
      combined += `\n\n${legacyInvariants}`;
    }
    if (legacyPreferences) {
      combined += `\n\n${legacyPreferences}`;
    }
    if (legacyCorrections) {
      combined += `\n\n${legacyCorrections}`;
    }
  }

  // 3. Inject Installed Skills Inventory
  if (skillsDir && fs.existsSync(skillsDir)) {
    const installedSkills = [];
    try {
      const entries = fs.readdirSync(skillsDir);
      for (const entry of entries) {
        const fullPath = path.join(skillsDir, entry);
        if (fs.statSync(fullPath).isDirectory()) {
          const skillMdPath = path.join(fullPath, 'SKILL.md');
          if (fs.existsSync(skillMdPath)) {
            const raw = fs.readFileSync(skillMdPath, 'utf8');
            const { data } = matter(raw);
            if (data && data.name && data.description) {
              installedSkills.push(`- **${data.name}** (\`.agent/skills/${entry}/SKILL.md\`): ${data.description}`);
            }
          }
        }
      }
      if (installedSkills.length > 0) {
        combined += `\n\n## Installed Agent Skills\n\nYou have access to specialized 'skills' to help you with complex tasks. If a skill seems relevant to your current task, you MUST read its SKILL.md file before proceeding.\n\nAvailable skills:\n${installedSkills.join('\n')}`;
      }
    } catch (err) {
      console.error('Error in skills injection:', err);
    }
  }

  return combined.trim();
}

function injectDirectives(fileContent, rulesBlock) {
  const beginIdx = fileContent.indexOf(DIRECTIVES_BEGIN);
  const endIdx = fileContent.indexOf(DIRECTIVES_END);
  
  if (beginIdx !== -1 && endIdx !== -1 && endIdx > beginIdx) {
    return fileContent.slice(0, beginIdx) + DIRECTIVES_BEGIN + '\n' + rulesBlock + '\n' + DIRECTIVES_END + fileContent.slice(endIdx + DIRECTIVES_END.length);
  }
  
  let content = fileContent.trimEnd();
  const baseline = 'Read and follow .agent/skills/total-recall/SKILL.md on every turn.';
  if (!content.includes('SKILL.md')) {
    content = baseline + '\n\n' + content;
  }
  
  return content.trimEnd() + '\n\n' + DIRECTIVES_BEGIN + '\n' + rulesBlock + '\n' + DIRECTIVES_END + '\n';
}

/**
 * Write or update a platform instruction shim with the pointer and active rules.
 */
async function writeShim(shimPath, skillsDir, nodes = [], { vaultDir, derivedDir } = {}) {
  const shimDir = path.dirname(shimPath);
  const rulesBlock = await buildRulesBlock(skillsDir, nodes, { vaultDir, derivedDir });
  const baseline = 'Read and follow .agent/skills/total-recall/SKILL.md on every turn.\n';
  const fullContent = `${baseline}\n${DIRECTIVES_BEGIN}\n${rulesBlock}\n${DIRECTIVES_END}\n`;

  try {
    if (fs.existsSync(shimPath)) {
      const stat = fs.lstatSync(shimPath);
      if (stat.isSymbolicLink()) {
        // If it's a symlink, DO NOT destroy it. It likely points to INSTRUCTIONS.md natively,
        // and its content will update automatically when the target updates.
        return false;
      } else {
        const raw = fs.readFileSync(shimPath, 'utf8');
        let cleaned = raw;
        if (raw.includes(INJECTION_BEGIN)) {
          const replaced = replaceFirstManagedInjectionBlock(raw, '');
          if (replaced !== null) cleaned = replaced;
        }
        
        const updated = injectDirectives(cleaned, rulesBlock);
        atomicWrite(shimPath, updated);
        return true;
      }
    } else {
      if (!fs.existsSync(shimDir)) {
        fs.mkdirSync(shimDir, { recursive: true });
      }
      atomicWrite(shimPath, fullContent);
      return true;
    }
  } catch (err) {
    // Ignore permission errors
    return false;
  }
}

/**
 * Map of client names → shim file paths they require.
 */
const CLIENT_SHIMS = {
  cursor:        ['.cursorrules'],
  'claude-code': ['.clauderules'],
  antigravity:   ['AGENTS.md', '.agents/rules/AGENTS.md', '.agent/rules/AGENTS.md'],
  gemini:        ['GEMINI.md', '.agents/rules/GEMINI.md', '.agent/rules/GEMINI.md'],
  codex:         ['.codexrules'],
  vscode:        ['.github/copilot-instructions.md', '.vscode/copilot-instructions.md'],
  pi:            [],
  aider:         ['.aider.rules.md'],
  windsurf:      ['.windsurfrules'],
};

/**
 * Read the connected client config.
 */
function readConnectedClients(clientsPath) {
  try {
    if (!fs.existsSync(clientsPath)) return null;
    const raw = fs.readFileSync(clientsPath, 'utf8').trim();
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    
    // Support object format: { clients: { gemini: {...} } }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.clients) {
      const keys = Object.keys(parsed.clients);
      if (keys.length === 0) return null;
      return new Set(keys);
    }
    
    // Support legacy array format just in case
    if (Array.isArray(parsed) && parsed.length > 0) {
      return new Set(parsed.map(String));
    }
    
    return null;
  } catch {
    return null;
  }
}

/**
 * Compile shims asynchronously.
 */
async function compilePointers(instructionsFile, skillsDir, nodes = [], { vaultDir, derivedDir } = {}) {
  const agentDir = path.dirname(instructionsFile);
  const baseDir = path.basename(agentDir) === '.agent' ? path.dirname(agentDir) : agentDir;
  let injectedCount = 0;

  // Always write the canonical INSTRUCTIONS.md
  if (await writeShim(path.join(baseDir, 'INSTRUCTIONS.md'), skillsDir, nodes, { vaultDir, derivedDir })) {
    injectedCount++;
  }

  // Determine which client shims to write
  const clientsPath = path.join(baseDir, '.agent', 'config', 'clients.json');
  const connectedClients = readConnectedClients(clientsPath);

  if (connectedClients !== null) {
    // Only write shims for connected clients
    for (const client of connectedClients) {
      const files = CLIENT_SHIMS[client];
      if (!files) continue;
      for (const file of files) {
        if (await writeShim(path.join(baseDir, file), skillsDir, nodes, { vaultDir, derivedDir })) {
          injectedCount++;
        }
      }
    }
  }
  
  return injectedCount;
}

/**
 * Main surface compilation entry point.
 */
export async function compileSurface({ vaultDir, skillsDir, derivedDir, instructionsFile, force = false }) {
  const nodes = getNodes(vaultDir);

  // ── Incremental compilation: vault content hash check ──
  const hashFile = path.join(derivedDir, 'vault-hash.txt');
  const currentHash = computeVaultHash(vaultDir);

  if (!force && fs.existsSync(hashFile)) {
    const storedHash = fs.readFileSync(hashFile, 'utf8').trim();
    if (storedHash === currentHash) {
      return {
        nodesProcessed: nodes.length,
        skillsInjected: 0,
        semanticIndexed: 0,
        semanticUnavailable: false,
        skipped: true,
        reason: 'vault-hash-unchanged'
      };
    }
  }

  // 1. Write pointer and active rules to all instruction shims
  const skillsInjected = await compilePointers(instructionsFile, skillsDir, nodes, { vaultDir, derivedDir });

  // 2. Build derived indexes (powers semantic search API)
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

  // 3. Build semantic embeddings index if available (fire-and-forget)
  let semanticResult = { indexed: 0, skipped: nodes.length, unavailable: true };
  try {
    const { buildEmbeddingsIndex } = await import('./embeddings.mjs');
    const embResult = await buildEmbeddingsIndex(nodes, derivedDir);
    semanticResult = { indexed: embResult.built, skipped: embResult.skipped, unavailable: false };
  } catch { /* semantic index is optional */ }

  // 4. Generate Obsidian Canvas
  try {
    generateCanvas(nodes, vaultDir);
  } catch { /* non-fatal */ }

  // 5. Write vault hash + projection manifest
  atomicWrite(hashFile, currentHash);
  writeProjectionManifest(derivedDir, currentHash);

  return {
    nodesProcessed: nodes.length,
    skillsInjected,
    semanticIndexed: semanticResult.indexed,
    semanticUnavailable: semanticResult.unavailable
  };
}

/**
 * Compute vault content hash.
 */
function computeVaultHash(vaultDir) {
  const files = walkMd(vaultDir).sort();
  const hash = crypto.createHash('sha256');
  for (const file of files) {
    try {
      const stat = fs.statSync(file);
      hash.update(`${file}:${stat.mtimeMs}:${stat.size}\n`);
    } catch { /* skip unreadable files */ }
  }
  return hash.digest('hex');
}

/**
 * Write projection manifest.
 */
function writeProjectionManifest(derivedDir, vaultHash) {
  const manifest = {
    type: 'projection-manifest',
    generated_at: new Date().toISOString(),
    vault_hash: `sha256:${vaultHash}`,
    projections: [
      { file: 'graph-index.jsonl', disposable: true },
      { file: 'memory-layers.jsonl', disposable: true },
      { file: 'embeddings.jsonl', disposable: true },
      { file: 'vault-hash.txt', disposable: true }
    ],
    rebuild_command: 'npx total-recall compile'
  };
  atomicWrite(path.join(derivedDir, 'MANIFEST.json'), JSON.stringify(manifest, null, 2));
}

// ─── Legacy exports (kept for backward compatibility) ───
export function routeNodesToSkills() { return []; }
export function injectSkills() {}
export async function compileTier1(nodes, instructionsFile) { await compilePointers(instructionsFile); }
