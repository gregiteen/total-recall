/**
 * Creative Search — compiled agent context generator.
 * Called during `total-recall compile` to inject search status into agent surfaces.
 * @module @total-recall/plugin-creative-search/generator
 */

const SEARXNG_URL = process.env.SEARXNG_URL || 'http://100.64.0.1:8888';

export async function generateContext() {
  try {
    // Multi-category health check
    const cats = ['general', 'science', 'news', 'it'];
    const results = [];
    for (const cat of cats) {
      const start = Date.now();
      const res = await fetch(`${SEARXNG_URL}/search?q=health+check&format=json&language=en&categories=${cat}`);
      const ms = Date.now() - start;
      if (res.ok) {
        const data = await res.json();
        const engines = new Set();
        for (const r of data.results || []) {
          for (const e of r.engines || []) engines.add(e);
        }
        results.push({ category: cat, ms, count: data.results?.length || 0, engines: engines.size });
      } else {
        results.push({ category: cat, ms, count: 0, engines: 0 });
      }
    }

    const avgMs = Math.round(results.reduce((s, r) => s + r.ms, 0) / results.length);
    const totalEngines = results.reduce((s, r) => s + r.engines, 0);
    const online = results.filter(r => r.count > 0).length;

    return {
      section: 'creative-search',
      text: `Creative Search (SearXNG metasearch): online (${online}/${cats.length} categories, ~${avgMs}ms avg), ` +
        `~${totalEngines} engines available across ${cats.length} categories. ` +
        `Search: total-recall csearch query <terms> | Deep research: total-recall csearch deep <topic> | ` +
        `Save to TR memory: total-recall csearch remember <terms>.`,
    };
  } catch {
    return { section: 'creative-search', text: '⚠️ Creative Search: SearXNG health check failed.' };
  }
}