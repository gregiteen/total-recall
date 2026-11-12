/** Paired local recall evaluation. The caller fixes the corpus, labels and query order. */
export async function evaluateField(cases, { search, topK = 5 } = {}) {
  if (!Number.isInteger(topK) || topK < 1 || topK > 20) throw new Error('topK must be an integer from 1 to 20');
  if (!Array.isArray(cases) || !cases.length || cases.some(entry =>
    typeof entry?.query !== 'string' || !entry.query.trim() || !Array.isArray(entry.relevant) ||
    !entry.relevant.length || entry.relevant.some(slug => typeof slug !== 'string' || !slug.trim()))) {
    throw new Error('Queries must be a nonempty array of { query, relevant: [slug, ...] }');
  }
  const rows = [];
  for (const entry of cases) {
    const baseline = (await search(entry.query, false)).slice(0, topK).map(result => result.slug);
    const field = (await search(entry.query, true)).slice(0, topK).map(result => result.slug);
    const shared = new Set(baseline.filter(slug => field.includes(slug))).size;
    rows.push({ query: entry.query, relevant: entry.relevant, baseline, field,
      overlap: shared / topK,
      baseline_hit: baseline.some(slug => entry.relevant.includes(slug)),
      field_hit: field.some(slug => entry.relevant.includes(slug)) });
  }
  const average = key => rows.reduce((sum, row) => sum + Number(row[key]), 0) / rows.length;
  return { mode: 'local', top_k: topK, query_count: rows.length,
    top_k_overlap: average('overlap'), baseline_hit_rate: average('baseline_hit'),
    field_hit_rate: average('field_hit'), default_enabled: false, queries: rows };
}
