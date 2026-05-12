import fs from 'fs';
import path from 'path';
import natural from 'natural';
import { loadNodes, loadSkills, atomicWrite } from './vault.mjs';

const ROUTING_THRESHOLD = 0.5;
const ROUTING_TOP_K = 3;
const INJECTION_BEGIN = '<!-- BEGIN INJECTED MEMORY: do not edit by hand; rebuilt by total-recall surface -->';
const INJECTION_END = '<!-- END INJECTED MEMORY -->';

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

    const qualified = skills
      .map(s => ({
        slug: node.slug,
        skill: s.name,
        score: zTfidf.get(s.name) || 0
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
    const regex = new RegExp(`${INJECTION_BEGIN}[\\s\\S]*?${INJECTION_END}`, 'g');
    
    let newRaw;
    if (regex.test(raw)) {
      newRaw = raw.replace(regex, injectedLines.join('\n'));
    } else {
      // Append if missing
      newRaw = raw + '\n\n' + injectedLines.join('\n') + '\n';
    }

    atomicWrite(skill.filepath, newRaw);
  }
}

/**
 * Build the Total Recall injection block content from absolute nodes.
 */
function buildInjectionBlock(nodes) {
  const absolutes = nodes.filter(n => n.priority === 'absolute' && n.status === 'active');
  const generatedAt = new Date().toISOString();

  const lines = [
    INJECTION_BEGIN,
    `<!-- @tier: 1, generated_at: ${generatedAt} -->`,
    ''
  ];

  for (const node of absolutes) {
    lines.push(`## ${node.title}`);
    lines.push(node.body);
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
  const escapedBegin = INJECTION_BEGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedEnd = INJECTION_END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`${escapedBegin}[\\s\\S]*?${escapedEnd}`, 'g');

  let newRaw;
  if (regex.test(raw)) {
    // Update existing block
    newRaw = raw.replace(regex, injectionBlock);
  } else {
    // Append new block at the bottom
    newRaw = raw.trimEnd() + '\n\n' + injectionBlock + '\n';
  }
  atomicWrite(filePath, newRaw);
}

/**
 * Compile absolute priority rules into Tier 1 (INSTRUCTIONS.md)
 * and inject into all existing IDE instruction files non-destructively.
 */
export function compileTier1(nodes, instructionsFile) {
  const injectionBlock = buildInjectionBlock(nodes);

  // Always write the canonical INSTRUCTIONS.md fresh
  const header = [
    '# Tier 1 Invariants (Total Recall Hot Memory)',
    '> This file is compiled automatically. Do not edit directly.',
    ''
  ].join('\n');
  atomicWrite(instructionsFile, header + injectionBlock + '\n');

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
  const nodes = loadNodes(vaultDir);
  const skills = loadSkills(skillsDir);

  const routes = routeNodesToSkills(nodes, skills);
  
  injectSkills(skills, nodes, routes);
  compileTier1(nodes, instructionsFile);

  // Write derived indexes
  if (!fs.existsSync(derivedDir)) {
    fs.mkdirSync(derivedDir, { recursive: true });
  }

  const graphIndex = nodes.map(n => ({
    slug: n.slug,
    title: n.title,
    category: n.category,
    status: n.status,
    confidence: n.confidence
  }));
  atomicWrite(path.join(derivedDir, 'graph-index.jsonl'), graphIndex.map(n => JSON.stringify(n)).join('\n'));
  
  atomicWrite(path.join(derivedDir, 'skill-routes.jsonl'), routes.map(r => JSON.stringify(r)).join('\n'));

  return { nodesProcessed: nodes.length, skillsInjected: skills.length };
}
