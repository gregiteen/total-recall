/**
 * `auth secret prune`: a read-only report of secrets worth removing or consolidating.
 *
 * A key is a candidate when it is bound to no repository, its provider tracking reports an
 * error (usually a dead key), or it shares a value with another key. Nothing is deleted;
 * the report says why each key is listed so the owner decides.
 */

/** @param {Array<{key:string, repos?:string[], tracking_status?:string|null, tracking_exempt?:boolean, fingerprint_full?:string|null, set?:boolean}>} rows */
export function pruneCandidates(rows) {
  const byFingerprint = new Map();
  for (const row of rows) {
    if (!row.set || !row.fingerprint_full) continue;
    if (!byFingerprint.has(row.fingerprint_full)) byFingerprint.set(row.fingerprint_full, []);
    byFingerprint.get(row.fingerprint_full).push(row.key);
  }
  const out = [];
  for (const row of rows) {
    const reasons = [];
    if (!(row.repos || []).length) reasons.push('unbound');
    if (row.tracking_status === 'error' && !row.tracking_exempt) reasons.push('error');
    const twins = (byFingerprint.get(row.fingerprint_full) || []).filter((key) => key !== row.key);
    if (twins.length) reasons.push(`same value as ${twins.join(', ')}`);
    if (reasons.length) out.push({ key: row.key, reasons, provider: row.provider || null });
  }
  return out.sort((a, b) => b.reasons.length - a.reasons.length || a.key.localeCompare(b.key));
}

export function pruneSummary(rows, candidates) {
  return {
    total: rows.length,
    candidates: candidates.length,
    unbound: candidates.filter((c) => c.reasons.includes('unbound')).length,
    errored: candidates.filter((c) => c.reasons.includes('error')).length,
    duplicated: candidates.filter((c) => c.reasons.some((r) => r.startsWith('same value'))).length,
  };
}
