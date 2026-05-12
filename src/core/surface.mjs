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
      node.tags.join(' '),
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
 * Compile absolute priority rules into Tier 1 (INSTRUCTIONS.md).
 */
export function compileTier1(nodes, instructionsFile) {
  const absolutes = nodes.filter(n => n.priority === 'absolute' && n.status === 'active');
  
  const lines = [
    '# Tier 1 Invariants (Total Recall Hot Memory)',
    '> This file is compiled automatically. Do not edit directly.',
    ''
  ];

  for (const node of absolutes) {
    lines.push(`## ${node.title}`);
    lines.push(node.body);
    lines.push('');
  }

  atomicWrite(instructionsFile, lines.join('\n'));
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
