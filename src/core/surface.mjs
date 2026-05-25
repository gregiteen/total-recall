import fs from 'fs';
import path from 'path';
import { loadNodes, loadSkills, atomicWrite } from './vault.mjs';
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

function buildRulesBlock(skillsDir) {
  if (!skillsDir) return '';
  const rulesDir = path.join(skillsDir, 'total-recall', 'rules');
  const invariants = extractRuleContent(path.join(rulesDir, 'invariants.md'));
  const preferences = extractRuleContent(path.join(rulesDir, 'preferences.md'));
  const corrections = extractRuleContent(path.join(rulesDir, 'corrections.md'));

  let combined = '';
  if (invariants) {
    combined += `${invariants}\n\n`;
  }
  if (preferences) {
    combined += `${preferences}\n\n`;
  }
  if (corrections) {
    combined += `${corrections}\n\n`;
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
function writeShim(shimPath, skillsDir) {
  const shimDir = path.dirname(shimPath);
  const rulesBlock = buildRulesBlock(skillsDir);
  const baseline = 'Read and follow .agent/skills/total-recall/SKILL.md on every turn.\n';
  const fullContent = `${baseline}\n${DIRECTIVES_BEGIN}\n${rulesBlock}\n${DIRECTIVES_END}\n`;

  try {
    if (fs.existsSync(shimPath)) {
      const stat = fs.lstatSync(shimPath);
      if (stat.isSymbolicLink()) {
        fs.unlinkSync(shimPath);
        atomicWrite(shimPath, fullContent);
      } else {
        const raw = fs.readFileSync(shimPath, 'utf8');
        let cleaned = raw;
        if (raw.includes(INJECTION_BEGIN)) {
          const replaced = replaceFirstManagedInjectionBlock(raw, '');
          if (replaced !== null) cleaned = replaced;
        }
        
        const updated = injectDirectives(cleaned, rulesBlock);
        atomicWrite(shimPath, updated);
      }
    } else {
      if (!fs.existsSync(shimDir)) {
        fs.mkdirSync(shimDir, { recursive: true });
      }
      atomicWrite(shimPath, fullContent);
    }
  } catch (err) {
    // Ignore permission errors
  }
}

/**
 * Compile pointers with active rules directly into root instruction shims.
 */
function compilePointers(instructionsFile, skillsDir) {
  const agentDir = path.dirname(instructionsFile);
  const baseDir = path.basename(agentDir) === '.agent' ? path.dirname(agentDir) : agentDir;

  const shims = [
    'INSTRUCTIONS.md',
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

  for (const shim of shims) {
    writeShim(path.join(baseDir, shim), skillsDir);
  }
}

/**
 * Main surface compilation entry point.
 */
export async function compileSurface({ vaultDir, skillsDir, derivedDir, instructionsFile }) {
  const nodes = loadNodes(vaultDir);

  // 1. Write pointer and active rules to all instruction shims
  compilePointers(instructionsFile, skillsDir);

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
    const { buildSemanticIndex } = await import('./semantic-index.mjs');
    semanticResult = await buildSemanticIndex(nodes, derivedDir);
  } catch { /* semantic index is optional — never block compile */ }

  // 4. Generate Obsidian Canvas (fire-and-forget)
  try {
    generateCanvas(nodes, vaultDir);
  } catch { /* non-fatal */ }

  return {
    nodesProcessed: nodes.length,
    skillsInjected: 0,  // v2: no more skill injection
    semanticIndexed: semanticResult.indexed,
    semanticUnavailable: semanticResult.unavailable
  };
}

// ─── Legacy exports (kept for backward compatibility) ───
export function routeNodesToSkills() { return []; }
export function injectSkills() {}
export function compileTier1(nodes, instructionsFile) { compilePointers(instructionsFile); }
