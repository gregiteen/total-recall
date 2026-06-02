/**
 * src/core/vector-store.mjs
 *
 * Pluggable vector index interface. Defaults to in-memory cosine similarity scanning,
 * but structured to allow drop-in SQLite-VSS or HNSWLib index engines.
 */

export class VectorStore {
  constructor() {
    this.vectors = new Map(); // slug -> { embedding: number[], metadata?: any }
  }

  /**
   * Load vector index from standard index payload.
   * @param {Record<string, { embedding: number[], chunks?: Array<{ embedding: number[] }> }>} indexData
   */
  load(indexData) {
    this.vectors.clear();
    if (!indexData) return;
    for (const [slug, entry] of Object.entries(indexData)) {
      if (entry && Array.isArray(entry.embedding)) {
        this.vectors.set(slug, {
          embedding: entry.embedding,
          chunks: entry.chunks || []
        });
      }
    }
  }

  /**
   * Add or update a single vector.
   */
  add(slug, embedding, chunks = []) {
    if (Array.isArray(embedding)) {
      this.vectors.set(slug, { embedding, chunks });
    }
  }

  /**
   * Delete a single vector.
   */
  delete(slug) {
    this.vectors.delete(slug);
  }

  /**
   * Perform cosine-similarity based k-nearest neighbors (k-NN) search.
   * Compares query against parent embedding and all child chunk embeddings,
   * matching on the maximum similarity.
   *
   * @param {number[]} queryEmbedding - The query vector
   * @param {number} topK - Maximum results
   * @param {Set<string>|null} filterSet - Optional allow-list of slugs
   * @param {Function} cosineSimilarityFn - Cosine similarity function
   * @returns {Array<{ slug: string, similarity: number }>} Sorted matches
   */
  search(queryEmbedding, topK = 5, filterSet = null, cosineSimilarityFn) {
    if (!queryEmbedding || this.vectors.size === 0) return [];
    
    const results = [];
    for (const [slug, data] of this.vectors.entries()) {
      if (filterSet && !filterSet.has(slug)) continue;

      let maxSimilarity = 0;
      if (Array.isArray(data.embedding)) {
        maxSimilarity = cosineSimilarityFn(queryEmbedding, data.embedding);
      }

      for (const chunk of data.chunks || []) {
        if (Array.isArray(chunk.embedding)) {
          const sim = cosineSimilarityFn(queryEmbedding, chunk.embedding);
          if (sim > maxSimilarity) {
            maxSimilarity = sim;
          }
        }
      }

      results.push({ slug, similarity: maxSimilarity });
    }

    return results
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);
  }
}
