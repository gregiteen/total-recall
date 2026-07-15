import { resolveAgentDir, resolveBrainDir, parseLayerFlag, getBothBrains } from './agent-dir.mjs';
import { semanticSearch } from '../core/search.mjs';
import path from 'node:path';

function printHelp() {
  console.log(`
  total-recall recall — Semantic search across rules, facts, and session history

  Usage: total-recall recall "<query>" [options]
  Alias: total-recall search "<query>" [options]

  Options:
    --top-k, -k <number>       Number of results to return (default: 5, max: 20)
    --no-sessions, -ns         Exclude session chunk results, search vault only
    --format, -f <type>        Output format: 'text' (default) or 'json'
    --category, -cat <name>    Filter results by SSSS category
    --tags, -t <list>          Filter results by comma-separated tags
    --modality, -m <type>      Filter results by modality
    --importance, -i <1-5>     Filter results by minimum numerical importance
    --priority, -p <level>     Filter results by priority level
    --fast                     Force frontmatter-only search without semantic fallback

  Examples:
    npx total-recall recall "Never run tsc directly"
    npx total-recall recall "Express server port" --top-k 3
    npx total-recall recall "Chromium sandbox bypass" --no-sessions
    npx total-recall recall "tsc" --category invariants --modality must
    npx total-recall recall "port" --tags config,port --importance 4
    npx total-recall recall "ORM choice" --project    # Search project brain only
    npx total-recall recall "coding style" --global    # Search global brain only
`);
}

export default async function recall(args) {
  // Parse layer flag first
  const { layer, remainingArgs } = parseLayerFlag(args);
  const query = remainingArgs[0];

  if (!query || query === '--help' || query === '-h') {
    printHelp();
    return;
  }

  // Parse options
  let top_k = 5;
  let includeSessions = true;
  let format = 'text';
  let category = null;
  let tags = null;
  let modality = null;
  let importance = null;
  let priority = null;
  let forceFast = false;

  for (let i = 1; i < remainingArgs.length; i++) {
    const arg = remainingArgs[i];
    if (arg === '--top-k' || arg === '-k') {
      const val = parseInt(remainingArgs[i + 1], 10);
      if (!isNaN(val)) {
        top_k = val;
        i++;
      }
    } else if (arg === '--no-sessions' || arg === '-ns') {
      includeSessions = false;
    } else if (arg === '--format' || arg === '-f') {
      const val = remainingArgs[i + 1];
      if (val === 'text' || val === 'json') {
        format = val;
        i++;
      }
    } else if (arg === '--category' || arg === '-cat') {
      const val = remainingArgs[i + 1];
      if (val) {
        category = val.trim();
        i++;
      }
    } else if (arg === '--tags' || arg === '-t') {
      const val = remainingArgs[i + 1];
      if (val) {
        tags = val.split(',').map(t => t.trim());
        i++;
      }
    } else if (arg === '--modality' || arg === '-m') {
      const val = remainingArgs[i + 1];
      if (val) {
        modality = val.toLowerCase();
        i++;
      }
    } else if (arg === '--importance' || arg === '-i') {
      const val = remainingArgs[i + 1];
      if (val) {
        const num = parseInt(val, 10);
        if (!isNaN(num)) importance = num;
        i++;
      }
    } else if (arg === '--priority' || arg === '-p') {
      const val = remainingArgs[i + 1];
      if (val) {
        priority = val.toLowerCase();
        i++;
      }
    } else if (arg === '--fast') {
      forceFast = true;
    }
  }

  // Determine which brains to search
  const brains = getBothBrains();
  const searchTargets = [];

  if (layer === 'global' || layer === 'auto') {
    if (brains.global) {
      searchTargets.push({ label: 'global', brainDir: brains.global.brainDir });
    }
  }
  if (layer === 'project' || layer === 'auto') {
    if (brains.project) {
      searchTargets.push({ label: 'project', brainDir: brains.project.brainDir });
    }
  }

  if (searchTargets.length === 0) {
    console.error('No brain found. Run `npx total-recall init` to create one.');
    process.exit(1);
  }

  try {
    // Search all target brains and merge results
    let allResults = [];
    let isDegraded = false;

    for (const target of searchTargets) {
      const vaultDir = path.join(target.brainDir, 'memory-vault');
      const derivedDir = path.join(target.brainDir, 'memory-derived');

      try {
        let results = [];
        const { fastSearch } = await import('../core/fast-recall.mjs');
        const fastResults = fastSearch(query, {
          derivedDir,
          vaultDir,
          top_k,
          category,
          tags,
          modality,
          importance,
          priority
        });

        if (fastResults.length >= top_k || forceFast) {
          results = fastResults;
        } else {
          results = await semanticSearch(query, {
            vaultDir,
            derivedDir,
            top_k,
            includeSessions: includeSessions && target.label !== 'global', // sessions only in project/local
            category,
            tags,
            modality,
            importance,
            priority
          });
        }
        if (results.degradedTextSearch) isDegraded = true;
        // Tag each result with its layer
        for (const r of results) {
          r._layer = target.label;
        }
        allResults = allResults.concat(results);
      } catch {
        // Skip brains that can't be searched (no embeddings, etc.)
      }
    }

    // Sort by score descending, limit to top_k
    allResults.sort((a, b) => (b.score || 0) - (a.score || 0));
    allResults = allResults.slice(0, top_k);

    if (format === 'json') {
      console.log(JSON.stringify(allResults, null, 2));
      return;
    }

    if (allResults.length === 0) {
      console.log('\n  🔍 No matching memory nodes found.');
      return;
    }
    if (isDegraded) {
      console.log('\n  ⚠️  WARNING: Embedding API unreachable or unconfigured. Cos-similarity vector search is disabled.');
      console.log('              Running basic text keyword search instead. Configure GOOGLE_API_KEY or OPENAI_API_KEY.');
    }
    const layerSuffix = searchTargets.length > 1 ? ' (merged)' : ` (${searchTargets[0].label})`;
    console.log(`\n  🔍 Semantic search results for "${query}"${layerSuffix}:\n`);
    for (let i = 0; i < allResults.length; i++) {
      const match = allResults[i];
      const rank = i + 1;
      const score = Math.round(match.score * 100) + '%';
      const layerTag = searchTargets.length > 1 ? ` [${match._layer}]` : '';

      if (match.type === 'vault') {
        const modalityTag = match.modality ? ` [${match.modality.toUpperCase()}]` : '';
        const priorityTag = match.priority && match.priority !== 'normal' ? ` [${match.priority.toUpperCase()}]` : '';
        const importanceVal = parseInt(match.importance, 10) || 3;
        const stars = '⭐'.repeat(Math.max(1, Math.min(5, importanceVal))) + '☆'.repeat(Math.max(0, 5 - importanceVal));
        const confVal = match.confidence !== undefined ? ` (conf: ${Math.round(match.confidence * 100)}%)` : '';

        console.log(`  [${rank}] Vault Match (${score})${layerTag} - Category: ${match.category}${modalityTag}${priorityTag}`);
        console.log(`      Title:      ${match.title}`);
        console.log(`      Slug:       ${match.slug}`);
        console.log(`      Importance: ${stars}${confVal}`);
        if (match.tags && match.tags.length > 0) {
          console.log(`      Tags:       ${match.tags.join(', ')}`);
        }
        if (match.related && match.related.length > 0) {
          console.log(`      Related:    ${match.related.join(', ')}`);
        }
        if (match.body) {
          console.log(`      Body:`);
          const bodyLines = match.body.trim().split('\n');
          for (const line of bodyLines) {
            console.log(`        │ ${line}`);
          }
        }
      } else if (match.type === 'session') {
        const sessionId = match.session_id ? String(match.session_id).slice(0, 12) + '...' : 'unknown';
        console.log(`  [${rank}] Session Match (${score})${layerTag} - Session ID: ${sessionId}`);
        if (match.snippet) {
          console.log(`      Snippet: "${match.snippet.trim().replace(/\n/g, ' ')}"`);
        }
        console.log(`      Chunk:   ${match.chunk} / ${match.total_chunks}`);
      } else {
        console.log(`  [${rank}] Match (${score})${layerTag} - Type: ${match.type}`);
        console.log(`      Slug:  ${match.slug || 'unknown'}`);
      }
      console.log('');
    }
  } catch (err) {
    console.error(`Error executing recall: ${err.message}`);
    process.exit(1);
  }
}
