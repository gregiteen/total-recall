import { buildEmbeddingsIndex, loadEmbeddingsIndex, cosineSimilarity } from './src/core/embeddings.mjs';
import fs from 'node:fs';
const nodes = [];
for (let i = 0; i < 500; i++) {
  nodes.push({ slug: `node-${i}`, title: `Title ${i}`, body: `Body ${i}` });
}
const start = Date.now();
await buildEmbeddingsIndex(nodes, '.agent/memory-derived-bench', { force: true });
console.log('Build took', Date.now() - start, 'ms');
const q = new Array(768).fill(0.1);
const s2 = Date.now();
const index = loadEmbeddingsIndex('.agent/memory-derived-bench');
let match = 0;
for (const val of Object.values(index)) {
  match += cosineSimilarity(q, val.embedding);
}
console.log('Recall (load + cosine) took', Date.now() - s2, 'ms');
fs.rmSync('.agent/memory-derived-bench', { recursive: true, force: true });
