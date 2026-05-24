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

/**
 * v2 Meta-Skill Architecture: Generate a one-line pointer to SKILL.md.
 * This replaces the old 106KB compiled instruction blocks.
 */
function buildPointerContent() {
  return 'Read and follow .agent/skills/total-recall/SKILL.md on every turn.\n';
}

/**
 * Write or update a platform instruction shim with the one-line pointer.
 * If the file exists with user content, replaces only the managed injection block.
 * If the file exists as a symlink, removes it and writes the pointer.
 * If the file doesn't exist, creates it with the pointer.
 */
function writeShim(shimPath, pointer) {
  const shimDir = path.dirname(shimPath);
  try {
    if (fs.existsSync(shimPath)) {
      const stat = fs.lstatSync(shimPath);
      if (stat.isSymbolicLink()) {
        // Remove old symlink, write fresh pointer
        fs.unlinkSync(shimPath);
        atomicWrite(shimPath, pointer);
      } else {
        // Real file — check for old injection block and replace it
        const raw = fs.readFileSync(shimPath, 'utf8');
        if (raw.includes(INJECTION_BEGIN)) {
          // Replace old bloated injection with the pointer
          const replaced = replaceFirstManagedInjectionBlock(raw, pointer.trim());
          if (replaced !== null) {
            atomicWrite(shimPath, replaced);
          } else {
            // Could not find end marker — append pointer
            atomicWrite(shimPath, raw.trimEnd() + '\n\n' + pointer);
          }
        } else if (!raw.includes('SKILL.md')) {
          // No injection block and no pointer yet — append
          atomicWrite(shimPath, raw.trimEnd() + '\n\n' + pointer);
        }
        // If it already has a SKILL.md pointer, leave it alone
      }
    } else {
      // New file — create parent dirs and write
      if (!fs.existsSync(shimDir)) {
        fs.mkdirSync(shimDir, { recursive: true });
      }
      atomicWrite(shimPath, pointer);
    }
  } catch (err) {
    // Ignore permission errors etc.
  }
}

/**
 * Compile the one-line pointer into all platform instruction shims.
 */
function compilePointers(instructionsFile) {
  const pointer = buildPointerContent();
  const agentDir = path.dirname(instructionsFile);
  const baseDir = path.basename(agentDir) === '.agent' ? path.dirname(agentDir) : agentDir;

  // Write all platform instruction shims (including INSTRUCTIONS.md)
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
    writeShim(path.join(baseDir, shim), pointer);
  }
}

/**
 * Main surface compilation entry point.
 *
 * v2 Meta-Skill Architecture:
 * - Generates one-line pointer shims (replaces 106KB compiled blocks)
 * - Builds derived indexes for semantic search (graph, layers, embeddings)
 * - Generates Obsidian Canvas
 * - Does NOT inject memory nodes into instruction files
 * - Does NOT do TF-IDF routing into skills
 */
export async function compileSurface({ vaultDir, skillsDir, derivedDir, instructionsFile }) {
  const nodes = loadNodes(vaultDir);

  // 1. Write one-line pointer to all instruction shims
  compilePointers(instructionsFile);

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
