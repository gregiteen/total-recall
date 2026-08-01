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
    const searchErrors = [];
    const degradedReasons = new Map();

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
        if (results.degradedTextSearch) {
          isDegraded = true;
          degradedReasons.set(results.degradedReason || 'unknown', {
            label: target.label,
            detail: results.degradedDetail || '',
          });
        }
        // Tag each result with its layer
        for (const r of results) {
          r._layer = target.label;
        }
        allResults = allResults.concat(results);
      } catch (err) {
        // A brain that cannot be searched is skipped — but NEVER silently.
        //
        // This used to be a bare `catch {}`. A missing native binding for
        // better-sqlite3 ("Could not locate the bindings file") made every
        // semantic search throw, and the swallow turned a hard dependency
        // crash into the message "No matching memory nodes found" — so a
        // fully-populated vault looked empty and the real cause was invisible.
        // Degrading to lexical-only results is fine; hiding why is not.
        searchErrors.push({ label: target.label, message: String(err?.message || err) });
      }
    }

    // Sort by score descending, limit to top_k
    allResults.sort((a, b) => (b.score || 0) - (a.score || 0));
    allResults = allResults.slice(0, top_k);

    if (format === 'json') {
      console.log(JSON.stringify(allResults, null, 2));
      return;
    }

    if (searchErrors.length > 0) {
      // Surface the real cause. "No matches" and "search crashed" are very
      // different problems and must never look the same.
      console.log('');
      for (const e of searchErrors) {
        console.log(`  ⚠️  ${e.label} brain search failed: ${e.message.split('\n')[0]}`);
      }
      if (/bindings file|\.node|NODE_MODULE_VERSION|better-sqlite3/i.test(searchErrors.map(e => e.message).join(' '))) {
        console.log('      A native module is missing or was built for a different Node version.');
        console.log('      Fix: pnpm rebuild better-sqlite3   (or npm rebuild better-sqlite3)');
        console.log('      With pnpm, the package must also be allowed to run build scripts.');
      }
      console.log('      Results below (if any) are lexical-only and may be incomplete.');
    }

    if (allResults.length === 0) {
      console.log(
        searchErrors.length > 0
          ? '\n  🔍 No results — search failed above, so this is NOT proof the vault is empty.'
          : '\n  🔍 No matching memory nodes found.',
      );
      return;
    }
    if (isDegraded) {
      // This block used to print ONE message for two unrelated failures:
      // "Embedding API unreachable or unconfigured … Configure GOOGLE_API_KEY
      // or OPENAI_API_KEY". When the real cause was an unbuilt index, that
      // sent the reader to check credentials that were already working, while
      // a brain with thousands of nodes quietly answered from keyword matching
      // and returned results from the wrong project. Name the actual cause.
      const empty = degradedReasons.get('empty_index');
      const failed = degradedReasons.get('embedding_failed');

      console.log('\n  ⚠️  Vector search is OFF — these results are keyword-only and may miss obvious matches.');
      if (empty) {
        console.log(`      Cause: the ${empty.label} brain has NO embeddings indexed. The API is fine; the index was never built.`);
        console.log('      Fix:   npx total-recall compile        (embeds any unembedded nodes for this brain)');
      }
      if (failed) {
        console.log(`      Cause: embedding generation failed for the ${failed.label} brain — ${failed.detail}`);
        console.log('      Fix:   set OPENROUTER_API_KEY (preferred), or GOOGLE_API_KEY / OPENAI_API_KEY.');
      }
      if (!empty && !failed) {
        console.log('      Cause: unknown — embeddings unavailable and no reason was reported.');
      }
    }
    const layerSuffix = searchTargets.length > 1 ? ' (merged)' : ` (${searchTargets[0].label})`;
    // Never call it "Semantic search results" when semantic search did not run.
    // The old header said exactly that regardless, so degraded keyword output
    // was indistinguishable from real vector results — same header, same
    // percentage scores. If the label doesn't change, nobody can tell.
    const modeLabel = isDegraded ? '🔤 KEYWORD-ONLY results' : '🔍 Semantic search results';
    console.log(`\n  ${modeLabel} for "${query}"${layerSuffix}:\n`);
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
