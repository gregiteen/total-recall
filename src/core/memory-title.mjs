/**
 * Memory title helpers — provenance belongs in source/tags, not a title prefix.
 */

const SELF_CAPTURED_PREFIX_RE = /^Self-captured memory:\s*/i;

/**
 * Strip legacy auto-title prefix if present.
 * @param {string} title
 * @returns {string}
 */
export function stripSelfCapturedTitlePrefix(title) {
  return String(title || '').replace(SELF_CAPTURED_PREFIX_RE, '').trim();
}

/**
 * True when title is the old auto-generated echo of the body.
 * @param {string} title
 * @param {string} [body]
 */
export function isSelfCapturedEchoTitle(title, body = '') {
  const raw = String(title || '').trim();
  if (SELF_CAPTURED_PREFIX_RE.test(raw)) return true;
  const stripped = stripSelfCapturedTitlePrefix(raw);
  const text = String(body || '').replace(/\s+/g, ' ').trim();
  if (!stripped || !text) return false;
  const head = stripped.replace(/\.\.\.$/, '').trim().toLowerCase();
  if (head.length < 12) return false;
  return text.toLowerCase().startsWith(head.slice(0, Math.min(40, head.length)));
}

/**
 * Build a short human title from body content (no provenance prefix).
 * Uses first sentence when reasonable, else first ~100 chars.
 * @param {string} body
 * @returns {string}
 */
export function defaultTitleFromBody(body) {
  const oneLine = String(body || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!oneLine) return 'Untitled memory';

  // Prefer first sentence
  const m = oneLine.match(/^(.{12,}?[.!?])(\s|$)/);
  let candidate = m ? m[1].trim() : oneLine;

  // Avoid absurdly long single-sentence titles
  if (candidate.length > 100) {
    candidate = candidate.slice(0, 97).replace(/\s+\S*$/, '').trim() + '...';
  }
  return candidate || oneLine.slice(0, 100);
}

/**
 * Normalize an existing title that may carry the legacy prefix.
 * If after strip the title is empty or still an echo of body, rebuild from body.
 * @param {string} title
 * @param {string} body
 * @returns {string}
 */
export function normalizeMemoryTitle(title, body) {
  const stripped = stripSelfCapturedTitlePrefix(title);
  if (!stripped) return defaultTitleFromBody(body);
  if (isSelfCapturedEchoTitle(title, body) || isSelfCapturedEchoTitle(stripped, body)) {
    // Prefer full first sentence from body over truncated echo
    return defaultTitleFromBody(body);
  }
  return stripped;
}
