/** Source collection for an application-owned automation inventory. No host or transport assumptions. */
export async function collectSources({ sources, adapters, checkedAt, limit = 10000 }) {
  if (!Array.isArray(sources) || !sources.every(source => typeof source === 'string') || new Set(sources).size !== sources.length) throw new Error('Unique source ids are required');
  if (!adapters || typeof adapters !== 'object' || !checkedAt || !Number.isSafeInteger(limit) || limit < 1) throw new Error('Adapters, checkedAt and a positive record limit are required');
  const results = await Promise.all(sources.map(async source => {
    try {
      if (typeof adapters[source] !== 'function') return { source, status: 'unsupported', checked_at: checkedAt, records: [], error: 'Source adapter is unavailable' };
      const value = await adapters[source]();
      const result = Array.isArray(value) ? { records: value, status: 'ok' } : value;
      if (!result || !Array.isArray(result.records) || !['ok', 'partial', 'unsupported', 'disabled', 'error', 'unauthorized'].includes(result.status)) throw new Error('Invalid source result');
      if (result.records.length > limit) return { source, status: 'partial', checked_at: checkedAt, records: result.records.slice(0, limit), error: `Source inventory exceeded ${limit} records` };
      return { ...result, source, checked_at: checkedAt };
    } catch (error) { return { source, status: 'error', checked_at: checkedAt, records: [], error: `Source discovery failed${typeof error.code === 'string' && /^[A-Z_0-9]+$/.test(error.code) ? ` (${error.code})` : ''}` }; }
  }));
  return { automations: results.flatMap(result => result.records), coverage: results.map(({ records, ...coverage }) => coverage), checked_at: checkedAt };
}
