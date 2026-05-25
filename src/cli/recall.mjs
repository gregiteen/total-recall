import { resolveAgentDir } from './agent-dir.mjs';
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

  Examples:
    npx total-recall recall "Never run tsc directly"
    npx total-recall recall "Express server port" --top-k 3
    npx total-recall recall "Chromium sandbox bypass" --no-sessions
    npx total-recall recall "tsc" --category invariants --modality must
    npx total-recall recall "port" --tags config,port --importance 4
`);
}

export default async function recall(args) {
  const query = args[0];

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

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--top-k' || arg === '-k') {
      const val = parseInt(args[i + 1], 10);
      if (!isNaN(val)) {
        top_k = val;
        i++;
      }
    } else if (arg === '--no-sessions' || arg === '-ns') {
      includeSessions = false;
    } else if (arg === '--format' || arg === '-f') {
      const val = args[i + 1];
      if (val === 'text' || val === 'json') {
        format = val;
        i++;
      }
    } else if (arg === '--category' || arg === '-cat') {
      const val = args[i + 1];
      if (val) {
        category = val.trim();
        i++;
      }
    } else if (arg === '--tags' || arg === '-t') {
      const val = args[i + 1];
      if (val) {
        tags = val.split(',').map(t => t.trim());
        i++;
      }
    } else if (arg === '--modality' || arg === '-m') {
      const val = args[i + 1];
      if (val) {
        modality = val.toLowerCase();
        i++;
      }
    } else if (arg === '--importance' || arg === '-i') {
      const val = args[i + 1];
      if (val) {
        const num = parseInt(val, 10);
        if (!isNaN(num)) importance = num;
        i++;
      }
    } else if (arg === '--priority' || arg === '-p') {
      const val = args[i + 1];
      if (val) {
        priority = val.toLowerCase();
        i++;
      }
    }
  }

  const resolvedAgentDir = resolveAgentDir();
  const vaultDir = path.join(resolvedAgentDir, 'memory-vault');
  const derivedDir = path.join(resolvedAgentDir, 'memory-derived');

  try {
    const results = await semanticSearch(query, {
      vaultDir,
      derivedDir,
      top_k,
      includeSessions,
      category,
      tags,
      modality,
      importance,
      priority
    });

    if (format === 'json') {
      console.log(JSON.stringify(results, null, 2));
      return;
    }

    if (results.length === 0) {
      console.log('\n  🔍 No matching memory nodes found.');
      return;
    }

    console.log(`\n  🔍 Semantic search results for "${query}":\n`);
    for (let i = 0; i < results.length; i++) {
      const match = results[i];
      const rank = i + 1;
      const score = Math.round(match.score * 100) + '%';

      if (match.type === 'vault') {
        console.log(`  [${rank}] Vault Match (${score}) - Category: ${match.category}`);
        console.log(`      Title: ${match.title}`);
        console.log(`      Slug:  ${match.slug}`);
        if (match.tags && match.tags.length > 0) {
          console.log(`      Tags:  ${match.tags.join(', ')}`);
        }
      } else if (match.type === 'session') {
        const sessionId = match.session_id ? String(match.session_id).slice(0, 12) + '...' : 'unknown';
        console.log(`  [${rank}] Session Match (${score}) - Session ID: ${sessionId}`);
        if (match.snippet) {
          console.log(`      Snippet: "${match.snippet.trim().replace(/\n/g, ' ')}"`);
        }
        console.log(`      Chunk:   ${match.chunk} / ${match.total_chunks}`);
      } else {
        console.log(`  [${rank}] Match (${score}) - Type: ${match.type}`);
        console.log(`      Slug:  ${match.slug || 'unknown'}`);
      }
      console.log('');
    }
  } catch (err) {
    console.error(`Error executing recall: ${err.message}`);
    process.exit(1);
  }
}
