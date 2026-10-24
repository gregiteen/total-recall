/** Trusted read-only adapter: no CLI bootstrap, auth, plugins or provider imports. */
import path from 'node:path';
import { fastSearch } from '../core/fast-recall.mjs';

try {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
    if (Buffer.byteLength(input) > 16384) throw new Error('Input limit exceeded');
  }
  const { brain, query, category, limit } = JSON.parse(input);
  const nodes = fastSearch(query, {
    vaultDir: path.join(brain, 'memory-vault'),
    derivedDir: path.join(brain, 'memory-derived'),
    top_k: limit, category, fullText: true,
  });
  if (nodes.stats.index !== 'local') throw new Error(`Local index ${nodes.stats.index}; compile the authorized brain first`);
  process.stdout.write(JSON.stringify({ count: nodes.length, nodes: nodes.map(n => ({
    slug: n.slug, category: n.category, title: n.title, status: n.status,
    score: n.score, snippet: String(n.body || '').slice(0, 240),
  })), freshness: nodes.stats.freshness }));
} catch {
  // Never include paths, memory payloads or parser input in the failure channel.
  process.stderr.write('Authorized local retrieval failed; check its index.');
  process.exitCode = 1;
}
