import fs from 'node:fs';
import path from 'node:path';
import { resolveBrainDir, parseLayerFlag, getBothBrains } from './agent-dir.mjs';
import { loadNodes } from '../core/vault.mjs';

function printHelp() {
  console.log(`
  total-recall map — Visualize memory vault structures and relationships

  Usage: total-recall map [options]

  Options:
    --global                   Visualize global brain only
    --project                  Visualize project brain only
    --category, -cat <name>    Visualize only nodes within a specific category
    --relations, -r            Visualize node-to-node relationships map

  Examples:
    npx total-recall map
    npx total-recall map --project
    npx total-recall map --category decisions
    npx total-recall map --relations
  `);
}

export default async function map(args) {
  const { layer, remainingArgs } = parseLayerFlag(args);

  let categoryFilter = null;
  let showRelations = false;

  for (let i = 0; i < remainingArgs.length; i++) {
    const arg = remainingArgs[i];
    const val = remainingArgs[i + 1];
    if (arg === '--help' || arg === '-h') {
      printHelp();
      return;
    } else if (arg === '--category' || arg === '-cat') {
      if (val) {
        categoryFilter = val.trim().toLowerCase();
        i++;
      }
    } else if (arg === '--relations' || arg === '-r') {
      showRelations = true;
    }
  }

  const brains = getBothBrains();
  const layersToProcess = [];

  if ((layer === 'global' || layer === 'auto') && brains.global) {
    layersToProcess.push({ name: 'global', path: brains.global.brainDir });
  }
  if ((layer === 'project' || layer === 'auto') && brains.project) {
    layersToProcess.push({ name: 'project', path: brains.project.brainDir });
  }

  if (layersToProcess.length === 0) {
    console.error('  ⚠️  No active brains resolved to visualize. Run total-recall init first.');
    process.exit(1);
  }

  // Load nodes for each active layer
  const loadedLayers = [];
  let totalNodesCount = 0;

  for (const l of layersToProcess) {
    const vaultDir = path.join(l.path, 'memory-vault');
    if (!fs.existsSync(vaultDir)) continue;

    const nodes = loadNodes(vaultDir).map(n => ({ ...n, _layer: l.name }));
    loadedLayers.push({ name: l.name, nodes });
    totalNodesCount += nodes.length;
  }

  console.log(`\n  🧠 Total Recall Knowledge Map (Total: ${totalNodesCount} nodes)\n`);

  if (showRelations) {
    renderRelationsMap(loadedLayers);
  } else {
    renderCategoryTree(loadedLayers, categoryFilter);
  }
}

function renderCategoryTree(loadedLayers, categoryFilter) {
  const allCategories = [
    'invariants',
    'preferences',
    'anti-patterns',
    'patterns',
    'decisions',
    'concepts',
    'facts',
    'lore'
  ];

  for (const layer of loadedLayers) {
    const layerEmoji = layer.name === 'global' ? '🌐' : '📁';
    const layerLabel = layer.name === 'global' ? 'Global Brain' : 'Project Brain';
    console.log(`  ${layerEmoji} ${layerLabel} (${layer.nodes.length} nodes)`);

    // Group by category
    const grouped = {};
    for (const c of allCategories) grouped[c] = [];
    for (const n of layer.nodes) {
      const cat = (n.category || 'facts').toLowerCase();
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(n);
    }

    const categoriesToRender = categoryFilter 
      ? allCategories.filter(c => c.includes(categoryFilter)) 
      : allCategories;

    const activeCategories = categoriesToRender.filter(cat => grouped[cat].length > 0);

    if (activeCategories.length === 0) {
      console.log(`     └── (No nodes matching category filter)`);
      console.log('');
      continue;
    }

    for (let i = 0; i < activeCategories.length; i++) {
      const cat = activeCategories[i];
      const isLastCat = i === activeCategories.length - 1;
      const catPrefix = isLastCat ? '  └──' : '  ├──';
      const nodes = grouped[cat];

      console.log(`     ${catPrefix} 📁 ${cat} (${nodes.length})`);

      for (let j = 0; j < nodes.length; j++) {
        const node = nodes[j];
        const isLastNode = j === nodes.length - 1;
        const nodePrefix = isLastCat 
          ? (isLastNode ? '       └──' : '       ├──') 
          : (isLastNode ? '  │    └──' : '  │    ├──');

        const importanceVal = parseInt(node.importance, 10) || 3;
        const stars = '⭐'.repeat(Math.max(1, Math.min(5, importanceVal)));
        const modalityTag = node.modality ? ` [${node.modality.toUpperCase()}]` : '';

        console.log(`     ${nodePrefix} 📄 [${node.slug}] — ${node.title} (${stars}${modalityTag})`);
      }
    }
    console.log('');
  }
}

function renderRelationsMap(loadedLayers) {
  // Build lookup map
  const allNodes = {};
  for (const layer of loadedLayers) {
    for (const node of layer.nodes) {
      allNodes[node.slug] = node;
    }
  }

  console.log('  🔗 Semantic Node Relations Map:\n');
  let hasRelations = false;

  for (const layer of loadedLayers) {
    const layerEmoji = layer.name === 'global' ? '🌐' : '📁';
    console.log(`  ${layerEmoji} ${layer.name.toUpperCase()} LAYER RELATIONS:`);

    let layerHasRelations = false;
    for (const node of layer.nodes) {
      const related = Array.isArray(node.related) ? node.related : [];
      if (related.length === 0) continue;

      layerHasRelations = true;
      hasRelations = true;
      console.log(`    📄 [${node.slug}] "${node.title}"`);
      
      for (let i = 0; i < related.length; i++) {
        const targetSlug = related[i];
        const isLast = i === related.length - 1;
        const branch = isLast ? '    └──' : '    ├──';
        const targetNode = allNodes[targetSlug];

        if (targetNode) {
          const targetLayer = targetNode._layer === node._layer ? '' : ` [${targetNode._layer}]`;
          console.log(`      ${branch} ──► [${targetSlug}] "${targetNode.title}"${targetLayer}`);
        } else {
          console.log(`      ${branch} ──► [${targetSlug}] (unresolved reference)`);
        }
      }
      console.log('');
    }

    if (!layerHasRelations) {
      console.log('    (No outbound relations mapped)\n');
    }
  }
}
