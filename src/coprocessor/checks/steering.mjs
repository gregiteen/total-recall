/**
 * steering.mjs — Steering Check (Co-Processor)
 *
 * Detects user directives ("NEVER do X", "ALWAYS do Y", corrections)
 * from conversation turns and fires the steering cascade.
 *
 * Detection uses pattern matching rather than LLM calls for speed.
 * The LLM-based analysis is reserved for the daemon's orchestration layer.
 */

// ─── DIRECTIVE PATTERNS ─────────────────────────────────────────────────────────

const PATTERNS = {
  never: [
    /\bNEVER\b\s+(.{10,})/i,
    /\bDO\s+NOT\b\s+(.{10,})/i,
    /\bDON'?T\s+EVER\b\s+(.{10,})/i,
    /\bSTOP\s+(?:DOING|USING)\b\s+(.{10,})/i,
    /\bI\s+(?:HATE|DESPISE|LOATHE)\b\s+(.{10,})/i,
  ],
  always: [
    /\bALWAYS\b\s+(.{10,})/i,
    /\bMAKE\s+SURE\s+(?:TO|YOU)\b\s+(.{10,})/i,
    /\bFROM\s+NOW\s+ON\b[,\s]+(.{10,})/i,
    /\bI\s+WANT\s+YOU\s+TO\b\s+(.{10,})/i,
  ],
  correct: [
    /\bACTUALLY[,\s]+(?:IT'?S|IT\s+IS|THE)\b\s+(.{10,})/i,
    /\bNO[,\s]+(?:IT'?S|IT\s+IS|THE\s+CORRECT)\b\s+(.{10,})/i,
    /\bTHAT'?S\s+(?:WRONG|INCORRECT|NOT\s+RIGHT)\b[.\s]*(.{5,})?/i,
  ],
  prefer: [
    /\bI\s+PREFER\b\s+(.{10,})/i,
    /\bI'?D?\s+RATHER\b\s+(.{10,})/i,
    /\bPLEASE\s+USE\b\s+(.{10,})/i,
  ],
};

// ─── DETECT DIRECTIVES ──────────────────────────────────────────────────────────

/**
 * Analyze user text for steering directives.
 *
 * @param {string} text - User's message text
 * @returns {Array<{type: string, directive: string, intensity: number, match: string}>}
 */
export function detectDirectives(text) {
  const results = [];

  // Estimate intensity from formatting cues
  const isAllCaps = text === text.toUpperCase() && text.length > 20;
  const hasExclamation = (text.match(/!/g) || []).length >= 2;
  const baseIntensity = isAllCaps ? 9 : hasExclamation ? 7 : 5;

  for (const [type, patterns] of Object.entries(PATTERNS)) {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const directive = (match[1] || match[0])
          .replace(/[.!?,;]+$/, '')  // Strip trailing punctuation
          .trim()
          .slice(0, 200);           // Cap length

        if (directive.length >= 10) {
          results.push({
            type,
            directive,
            intensity: Math.min(10, baseIntensity + (isAllCaps ? 1 : 0)),
            match: match[0].slice(0, 100),
          });
          break; // One match per type is sufficient
        }
      }
    }
  }

  return results;
}
