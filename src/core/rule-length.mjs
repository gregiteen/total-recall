/** Shared rule policy. Diagnostics contain counts and limits, never rule text. */
export const RULE_SOFT_LIMIT = 300;
export const RULE_HARD_LIMIT = 800;
let rejections = 0;

export function ruleLengthStats() {
  return { rejections, scope: 'process' };
}

export function checkRuleLength(data, body, { allowLong = false } = {}) {
  const errors = [], warnings = [];
  const rule = data.type === 'rule' || (data.type === 'memory' &&
    ['invariants', 'preferences', 'anti-patterns'].includes(data.category));
  if (!rule || data.tags?.includes('context:policy')) return { errors, warnings };
  const length = String(body || '').trim().length;
  if (length > RULE_HARD_LIMIT && allowLong !== true) {
    rejections++;
    errors.push(`Rule is ${length} characters (limit ${RULE_HARD_LIMIT}). Shorten the rule. Save history and examples as a fact, or use the explicit allow-long exception.`);
  } else if (length > RULE_SOFT_LIMIT) {
    warnings.push(`Rule is ${length} characters. Keep rules brief (under ${RULE_SOFT_LIMIT} characters). Save history and examples as a fact.`);
  }
  return { errors, warnings };
}
