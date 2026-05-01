/**
 * ranking.mjs — Signal Score Algorithm (Total Recall)
 *
 * Computes the importance ranking for wiki nodes using the formula:
 *   signal_score = intensity × (access+1)^exponent × max(floor, 0.5^(days/half_life))
 *
 * Type-differentiated half-lives ensure project context ages faster
 * than user preferences, which are more durable.
 */

// Default half-lives (can be overridden via config)
const DEFAULT_HALF_LIVES = {
  preference: 90,
  'anti-pattern': 60,
  pattern: 30,
  concept: 30,
  decision: 45,
  project: 14,
};

/**
 * Compute the signal score for a wiki node.
 *
 * @param {Object} node - Wiki node metadata (from YAML frontmatter)
 * @param {Object} [options] - Override ranking parameters
 * @param {Object} [options.halfLife] - Type → days mapping
 * @param {number} [options.decayFloor] - Minimum recency multiplier (default: 0.1)
 * @param {number} [options.accessExponent] - Access count exponent (default: 0.5)
 * @returns {number} Signal score
 */
export function computeSignalScore(node, options = {}) {
  const halfLives = options.halfLife || DEFAULT_HALF_LIVES;
  const decayFloor = options.decayFloor ?? 0.1;
  const accessExponent = options.accessExponent ?? 0.5;

  const intensity = node.sentiment_intensity || 5;
  const accessCount = node.access_count || 0;
  const type = node.type || 'pattern';
  const halfLife = halfLives[type] || 30;

  // Days since last verified
  let daysSince = 0;
  if (node.last_verified) {
    const lastDate = new Date(node.last_verified);
    daysSince = Math.max(0, (Date.now() - lastDate.getTime()) / 86400000);
  }

  const accessFactor = Math.pow(accessCount + 1, accessExponent);
  const recencyDecay = Math.max(decayFloor, Math.pow(0.5, daysSince / halfLife));

  return intensity * accessFactor * recencyDecay;
}

/**
 * Rank an array of wiki nodes by signal score (descending).
 *
 * @param {Object[]} nodes - Array of nodes with metadata
 * @param {Object} [options] - Ranking parameters
 * @returns {Object[]} Sorted array with score property added
 */
export function rankNodes(nodes, options = {}) {
  return nodes
    .map(node => ({
      ...node,
      score: computeSignalScore(node, options),
    }))
    .sort((a, b) => b.score - a.score);
}
