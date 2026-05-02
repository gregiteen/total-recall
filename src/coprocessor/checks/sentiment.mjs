/**
 * sentiment.mjs — Sentiment Check (Co-Processor)
 *
 * Detects positive and negative emotional signals from user turns.
 * Uses pattern matching for speed — no LLM calls needed for
 * most common sentiment indicators.
 *
 * Detected signals are used to fire active-note.mjs via the daemon.
 */

// ─── SENTIMENT PATTERNS ─────────────────────────────────────────────────────────

const POSITIVE_PATTERNS = [
  { pattern: /\b(?:great|perfect|excellent|awesome|amazing|fantastic|love\s+it|beautiful|brilliant)\b/i, intensity: 7 },
  { pattern: /\b(?:exactly\s+what\s+I\s+wanted|this\s+is\s+(?:great|perfect|exactly))\b/i, intensity: 8 },
  { pattern: /\bI\s+think\s+(?:it'?s|this\s+is)\s+great\b/i, intensity: 9 },  // Understated — rare and high-signal
  { pattern: /\b(?:nice|good\s+job|well\s+done|thank(?:s|\s+you))\b/i, intensity: 5 },
  { pattern: /[🎉❤️🔥👏💯✨🙏]+/, intensity: 6 },
  { pattern: /\b(?:pleased|impressed|satisfied|happy\s+with)\b/i, intensity: 7 },
  { pattern: /\b(?:do\s+more\s+of\s+this|keep\s+doing\s+this|this\s+is\s+the\s+way)\b/i, intensity: 8 },
];

const NEGATIVE_PATTERNS = [
  { pattern: /\b(?:wrong|incorrect|broken|fail(?:ed|ure)?|bug(?:gy)?|terrible|awful)\b/i, intensity: 5 },
  { pattern: /\b(?:frustrated|annoyed|angry|furious|pissed|rage|hate)\b/i, intensity: 8 },
  { pattern: /\bI\s+(?:HATE|FUCKING|DESPISE)\b/i, intensity: 10 },
  { pattern: /\b(?:stop\s+doing|why\s+(?:did|are)\s+you|I\s+told\s+you|how\s+many\s+times)\b/i, intensity: 7 },
  { pattern: /\b(?:NO+!|STOP!|WTF|what\s+the\s+(?:hell|fuck))\b/i, intensity: 9 },
];

// ─── DETECT SENTIMENT ───────────────────────────────────────────────────────────

/**
 * Analyze user text for emotional signals.
 *
 * @param {string} text - User's message text
 * @returns {{ sentiment: 'positive'|'negative'|'neutral', intensity: number, signals: string[] }}
 */
export function detectSentiment(text) {
  const signals = [];
  let maxPositive = 0;
  let maxNegative = 0;

  // Check for ALL CAPS (strong signal)
  const isAllCaps = text === text.toUpperCase() && text.length > 20;
  if (isAllCaps) {
    maxNegative = Math.max(maxNegative, 8);
    signals.push('ALL_CAPS');
  }

  // Multiple exclamation marks
  const exclamationCount = (text.match(/!/g) || []).length;
  if (exclamationCount >= 3) {
    signals.push(`EXCLAMATION_x${exclamationCount}`);
  }

  // Check positive patterns
  for (const { pattern, intensity } of POSITIVE_PATTERNS) {
    if (pattern.test(text)) {
      maxPositive = Math.max(maxPositive, intensity);
      signals.push(`POS:${pattern.source.slice(0, 30)}`);
    }
  }

  // Check negative patterns
  for (const { pattern, intensity } of NEGATIVE_PATTERNS) {
    if (pattern.test(text)) {
      maxNegative = Math.max(maxNegative, intensity);
      signals.push(`NEG:${pattern.source.slice(0, 30)}`);
    }
  }

  // Determine overall sentiment
  if (maxPositive === 0 && maxNegative === 0) {
    return { sentiment: 'neutral', intensity: 0, signals };
  }

  if (maxPositive > maxNegative) {
    return { sentiment: 'positive', intensity: maxPositive, signals };
  }

  return { sentiment: 'negative', intensity: maxNegative, signals };
}
