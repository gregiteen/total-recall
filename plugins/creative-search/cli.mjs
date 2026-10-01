/**
 * Creative Search CLI — SearXNG-powered metasearch.
 * Ran as `total-recall csearch <subcommand> [args...]`
 * @module @total-recall/plugin-creative-search
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { loadConfig, run as configure } from './config.mjs';

const TR_CLI = process.env.TR_CLI || (process.env.TR_PACKAGE_ROOT && path.join(process.env.TR_PACKAGE_ROOT, 'bin/total-recall.mjs'));

// Stop words for keyword extraction
const STOP_WORDS = new Set([
  'the','a','an','and','or','but','in','on','at','to','for','of','by','with',
  'from','as','is','it','its','are','was','were','be','been','being','have',
  'has','had','do','does','did','will','would','shall','should','may','might',
  'must','can','could','this','that','these','those','i','you','he','she',
  'we','they','not','no','nor','so','if','then','than','too','very','just',
  'about','up','out','off','over','after','before','between','through','during',
  'because','while','since','until','against','into','down','what','which',
  'who','whom','when','where','why','how','all','each','every','both','few',
  'more','most','some','any','new','using','based'
]);

/** Search SearXNG with query + optional category */
export async function searchSearXNG(query, { categories, lang, limit, config } = {}) {
  const cfg = config || await loadConfig();
  if (!cfg.searxngUrl) throw new Error('Configure your instance with csearch config set searxngUrl <URL>, or SEARXNG_URL');
  const params = new URLSearchParams({ q: query, format: 'json' });
  if (lang) params.set('language', lang);
  else params.set('language', 'en');
  if (categories) {
    // Categories can be a comma-separated string or an array
    const cats = Array.isArray(categories) ? categories : categories.split(',');
    params.set('categories', cats.map(c => c.trim()).join(','));
  }
  // Limit results on SearXNG side if possible (SearXNG doesn't support this parameter directly)
  const url = `${cfg.searxngUrl}/search?${params.toString()}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(cfg.timeoutMs) });
  if (!res.ok) throw new Error(`SearXNG returned HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data.results)) throw new Error('SearXNG JSON results missing; enable JSON output on the instance');
  const results = data.results.slice(0, limit || cfg.maxResults);
  return { results, unresponsive: data.unresponsive_engines || [] };
}

/** Extract significant keywords from titles/snippets */
function extractKeywords(texts, maxWords = 6) {
  const freq = {};
  for (const text of texts) {
    const words = text.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 3 && !STOP_WORDS.has(w) && !/^\d+$/.test(w));
    for (const w of words) {
      freq[w] = (freq[w] || 0) + 1;
    }
  }
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxWords)
    .map(([word]) => word);
}

/** Render a single search result */
function printResult(r, i) {
  console.log(`  ${i}. ${r.title || 'Untitled'}`);
  console.log(`     ${r.url || ''}`);
  if (r.content) {
    const snippet = r.content.slice(0, 200);
    console.log(`     ${snippet}${r.content.length > 200 ? '…' : ''}`);
  }
  if (r.engine) console.log(`     [${r.engine}]`);
  console.log();
}

/** Run `total-recall remember` to save search results */
async function rememberToTR(category, title, body, tags) {
  const nodePath = TR_CLI;
  const nodeBin = process.argv[0];
  try {
    const tagStr = Array.isArray(tags) ? tags.join(',') : tags;
    const result = spawnSync(nodeBin, [nodePath, 'remember', category, `[${title}]\n\n${body.slice(0, 8000)}`, '--tags', tagStr], {
      timeout: 15000, encoding: 'utf8',
    });
    return result.stdout || result.stderr || 'ok';
  } catch (e) {
    return `save failed: ${e.message}`;
  }
}

// ────────────────────────────────────────
export async function run(argv) {
  const subcommand = argv[3] || 'help';
  const args = argv.slice(4);

  switch (subcommand) {
    case 'config':
      return configure([argv[0], argv[1], argv[2], ...argv.slice(4)]);

    // ── query ──
    case 'query': {
      const cfg = await loadConfig();
      let categories = (cfg.categories || ['general']).join(',');

      // Extract --categories flag from args (can appear anywhere)
      const catIdx = args.indexOf('--categories');
      let searchArgs = args;
      if (catIdx !== -1 && catIdx + 1 < args.length) {
        categories = args[catIdx + 1];
        searchArgs = [...args.slice(0, catIdx), ...args.slice(catIdx + 2)];
      }
      const searchQuery = searchArgs.join(' ');
      if (!searchQuery) { console.error('Usage: total-recall csearch query [--categories <cats>] <search terms>'); process.exitCode = 1; return; }

      const { results, unresponsive } = await searchSearXNG(searchQuery, {
        categories, limit: cfg.maxResults || 15, lang: cfg.defaultLang || 'en',
      });

      if (results.length === 0) { console.log('No results found.'); return; }

      console.log(`\n🔍 Creative Search — "${searchQuery}"\n`);
      console.log(`   Categories: ${categories}`);
      console.log(`   Results: ${results.length}${unresponsive.length ? ` (unresponsive engines: ${unresponsive.join(', ')})` : ''}\n`);
      results.forEach((r, i) => printResult(r, i + 1));
      return { data: { count: results.length, query: searchQuery, categories, unresponsive } };
    }

    // ── categories ──
    case 'categories': {
      // Positional: categories <cat1,cat2,...> <query>
      // If only one argument or first arg doesn't contain comma, list available categories
      if (args.length === 0 || args[0] === 'list') {
        console.log('\n📂 Available Search Categories\n');
        console.log('  general      — Web search across all enabled engines');
        console.log('  science      — arxiv, pubmed, semantic_scholar, crossref, springer, core');
        console.log('  news         — bing news, google news, hackernews, reuters, brave news');
        console.log('  images       — flickr, bing images, unsplash, wikicommons, devicons');
        console.log('  videos       — google videos, bing videos');
        console.log('  music        — soundcloud, spotify, deezer');
        console.log('  it           — github, stackoverflow, pypi, docker hub, fdroid');
        console.log('  files        — fdroid, docker hub');
        console.log('  social media — hackernews, discourse');
        console.log('\nUsage: total-recall csearch categories <cat1,cat2,...> <query>');
        console.log('  e.g. total-recall csearch categories science,news "federated learning"');
        return;
      }
      const cats = args[0];
      const query = args.slice(1).join(' ');
      if (!query) { console.error('Usage: total-recall csearch categories <cat1,cat2,...> <query>'); process.exitCode = 1; return; }

      const { results, unresponsive } = await searchSearXNG(query, {
        categories: cats, limit: 25,
      });

      if (results.length === 0) { console.log('No results found.'); return; }

      console.log(`\n🔍 Creative Search — "${query}" in [${cats}]\n`);
      console.log(`   Results: ${results.length}${unresponsive.length ? ` (unresponsive: ${unresponsive.join(', ')})` : ''}\n`);

      // Group results by engine
      const byEngine = {};
      for (const r of results) {
        const eng = r.engine || 'unknown';
        if (!byEngine[eng]) byEngine[eng] = [];
        byEngine[eng].push(r);
      }
      for (const [eng, items] of Object.entries(byEngine)) {
        console.log(`  ── ${eng} (${items.length}) ──`);
        for (const r of items.slice(0, 3)) {
          console.log(`    • ${r.title || 'Untitled'}`);
          console.log(`      ${r.url || ''}`);
        }
        if (items.length > 3) console.log(`    … and ${items.length - 3} more`);
        console.log();
      }
      return { data: { count: results.length, categories: cats, query, byEngine: Object.fromEntries(
        Object.entries(byEngine).map(([k, v]) => [k, v.length])
      ) } };
    }

    // ── deep ──
    case 'deep': {
      const topic = args.join(' ');
      if (!topic) { console.error('Usage: total-recall csearch deep <research topic>'); process.exitCode = 1; return; }

      console.log(`\n🧠 Deep Research: "${topic}"`);
      console.log('   Phase 1: Initial search across science, general, and news categories...\n');

      // Phase 1: Multi-category search
      const categories = ['general', 'science', 'news'];
      let allResults = [];
      for (const cat of categories) {
        const { results } = await searchSearXNG(topic, { categories: cat, limit: 10, lang: 'en' });
        console.log(`   [${cat}] ${results.length} results`);
        allResults = allResults.concat(results);
      }

      // Deduplicate by URL
      const seen = new Set();
      const unique = allResults.filter(r => {
        const key = r.url || r.title || '';
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      const top10 = unique.slice(0, 10);
      console.log(`\n   Top ${top10.length} results (across all categories):\n`);
      top10.forEach((r, i) => printResult(r, i + 1));

      // Phase 2: Keyword extraction and follow-up search
      const titles = top10.map(r => r.title || '');
      const snippets = top10.map(r => r.content || '');
      const keywords = extractKeywords([...titles, ...snippets], 5);

      if (keywords.length > 0) {
        console.log(`\n   Phase 2: Follow-up search with key terms: ${keywords.join(', ')}\n`);

        let followUpResults = [];
        for (const kw of keywords.slice(0, 3)) {
          const { results } = await searchSearXNG(`${topic} ${kw}`, { categories: 'science,general', limit: 5, lang: 'en' });
          console.log(`   [${kw}] ${results.length} results`);
          followUpResults = followUpResults.concat(results);
        }

        // Deduplicate follow-ups
        const followSeen = new Set();
        const followUnique = followUpResults.filter(r => {
          const key = r.url || r.title || '';
          if (followSeen.has(key) || seen.has(key)) return false;
          followSeen.add(key);
          return true;
        });

        const topFollow = followUnique.slice(0, 8);
        if (topFollow.length > 0) {
          console.log(`\n   Additional results from follow-up:\n`);
          topFollow.forEach((r, i) => printResult(r, i + 1));
        }
      }

      // Phase 3: Compile report
      const all = [...top10];
      const report = [
        `# Deep Research: ${topic}`,
        ``,
        `## Sources Found (${all.length})`,
        ...all.map(r => `- [${r.title || 'Untitled'}](${r.url || ''}) — ${(r.content || '').slice(0, 120)}`),
        ``,
        `## Key Terms`,
        keywords.length > 0 ? keywords.join(', ') : '(none extracted)',
        ``,
        `## Engines Used`,
        [...new Set(all.map(r => r.engine).filter(Boolean))].join(', ') || 'unknown',
      ].join('\n');

      console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`📋 Research Summary\n`);
      console.log(`  Query: "${topic}"`);
      console.log(`  Sources: ${all.length}`);
      console.log(`  Engines: ${[...new Set(all.map(r => r.engine).filter(Boolean))].join(', ') || 'unknown'}`);
      console.log(`  Key terms: ${keywords.join(', ') || '(none)'}`);

      return { data: { query: topic, sources: all.length, keywords, engines: [...new Set(all.map(r => r.engine).filter(Boolean))] } };
    }

    // ── remember ──
    case 'remember': {
      const query = args.join(' ');
      if (!query) { console.error('Usage: total-recall csearch remember <search terms>'); process.exitCode = 1; return; }

      const cfg = await loadConfig();
      const categories = (cfg.categories || ['general', 'science']).join(',');

      const { results } = await searchSearXNG(query, {
        categories, limit: Math.min(cfg.maxResults || 15, 50), lang: cfg.defaultLang || 'en',
      });

      if (results.length === 0) { console.log('No results found. Nothing to remember.'); return; }

      // Format results as a structured research note
      const timestamp = new Date().toISOString().split('T')[0];
      const slug = query.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
      const body = results.map((r, i) =>
        `${i + 1}. [${r.title || 'Untitled'}](${r.url || ''})\n   ${(r.content || '').slice(0, 300)}`
      ).join('\n\n');

      const title = `Creative Search: ${query}`;
      const tags = `csearch,${slug}`;

      console.log(`\n🔍 Creative Search — saving to Total Recall memory\n`);
      console.log(`   Query: "${query}"`);
      console.log(`   Results: ${results.length}`);
      console.log(`   Category: fact`);
      console.log(`   Tags: ${tags}\n`);

      const result = await rememberToTR('fact', title, body, tags);

      if (result.includes('✅') || result.includes('created')) {
        console.log(`✅ Saved ${results.length} results to TR memory.`);
        console.log(`   Search with: total-recall recall "${query}"`);
      } else {
        console.log(`⚠️  Save result: ${result.slice(0, 200)}`);
        // Display results anyway even if save fails
        console.log(`\n📋 Results (not saved):\n`);
        results.slice(0, 10).forEach((r, i) => printResult(r, i + 1));
      }

      return { data: { query, count: results.length, saved: !result.includes('fail') } };
    }

    // ── stats ──
    case 'stats': {
      console.log('\n📊 Creative Search — Engine Statistics\n');

      const testQueries = [
        { category: 'general', query: 'technology', label: 'General Web' },
        { category: 'science', query: 'machine learning', label: 'Science' },
        { category: 'news', query: 'latest', label: 'News' },
        { category: 'it', query: 'programming', label: 'Development' },
        { category: 'images', query: 'nature', label: 'Images' },
      ];

      const engineStats = {};
      for (const tq of testQueries) {
        process.stdout.write(`   Testing ${tq.label}... `);
        const start = Date.now();
        try {
          const { results } = await searchSearXNG(tq.query, { categories: tq.category, limit: 10 });
          const ms = Date.now() - start;
          const engSet = new Set();
          for (const r of results) {
            const eng = r.engine || 'unknown';
            if (!engineStats[eng]) engineStats[eng] = { hits: 0, errors: 0, totalMs: 0, queries: [] };
            engSet.add(eng);
          }
          for (const eng of engSet) {
            engineStats[eng].hits++;
            engineStats[eng].totalMs += ms;
            if (!engineStats[eng].queries.includes(tq.label)) engineStats[eng].queries.push(tq.label);
          }
          console.log(`${results.length} results in ${ms}ms (${[...engSet].join(', ') || 'none'})`);
        } catch (e) {
          console.log(`ERROR: ${e.message}`);
        }
      }

      // Report
      console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`📊 Engine Performance Summary\n`);
      const sorted = Object.entries(engineStats).sort((a, b) => (b[1].hits) - (a[1].hits));
      console.log(`  ${'Engine'.padEnd(25)} ${'Hits'.padEnd(6)} ${'Avg ms'.padEnd(8)} Categories`);
      console.log(`  ${''.padEnd(25, '─')} ${''.padEnd(6, '─')} ${''.padEnd(8, '─')} ──────────`);
      for (const [eng, st] of sorted) {
        const avg = st.hits > 0 ? Math.round(st.totalMs / st.hits) : '-';
        console.log(`  ${eng.padEnd(25)} ${String(st.hits).padEnd(6)} ${String(avg).padEnd(8)} ${st.queries.join(', ')}`);
      }
      return { data: { engines: Object.keys(engineStats), stats: engineStats } };
    }

    // ── health ──
    case 'health': {
      const start = Date.now();
      const { results, unresponsive } = await searchSearXNG('health', { categories: 'general', limit: 5 });
      const ms = Date.now() - start;
      const engines = new Set();
      for (const r of results) {
        for (const e of r.engines || []) engines.add(e);
      }

      console.log(`\n✅ SearXNG is healthy (${ms}ms)\n`);
      console.log(`   Results:  ${results.length}`);
      console.log(`   Engines:  ${engines.size > 0 ? [...engines].join(', ') : 'unknown'}`);
      if (unresponsive.length > 0) console.log(`   ⚠️  Unresponsive engines: ${unresponsive.join(', ')}`);
      return { data: { ok: true, ms, results: results.length, engines: [...engines], unresponsive } };
    }

    // ── engines ──
    case 'engines': {
      console.log('🔍 Active engines (inferred from multi-category search):\n');
      const cats = ['general', 'science', 'news', 'it', 'images'];
      const allEngines = new Set();
      for (const cat of cats) {
        const { results } = await searchSearXNG('test', { categories: cat, limit: 5 });
        for (const r of results) {
          for (const e of r.engines || []) allEngines.add(e);
        }
      }
      const sorted = [...allEngines].sort();
      for (const e of sorted) console.log(`  ✅ ${e}`);
      console.log(`\n   Total: ${sorted.length} engines across ${cats.length} categories`);
      return { data: { engines: sorted, count: sorted.length } };
    }

    default:
      console.log(`\n🔍 Creative Search — Total Recall Plugin\n`);
      console.log('Usage:  total-recall csearch <subcommand> [args]\n');
      console.log('  query [--categories <cats>] <terms>');
      console.log('                           Search via SearXNG (default: general)');
      console.log('  categories <cat1,cat2> <query>');
      console.log('                           Search specific categories');
      console.log('  categories list           List available categories');
      console.log('  deep <topic>              Multi-step deep research');
      console.log('  remember <terms>          Search + save results to TR memory');
      console.log('  stats                     Engine performance statistics');
      console.log('  health                    Check SearXNG health');
      console.log('  engines                   List active engines across categories');
      console.log('\nEnvironment:');
      console.log('  SEARXNG_URL  (optional instance URL override; no default host)');
      console.log('\nConfig: total-recall csearch config show|set <key> <value>|reset');
      return;
  }
}
