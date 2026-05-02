/**
 * researcher.mjs — System 2 Researcher (Co-Processor Phase 8)
 *
 * Background fact-checking for uncertain agent claims. Uses the Gemini CLI
 * with web search to verify claims, then persists results as wiki nodes
 * of type "conclusion" and injects corrections into ACTIVE CONTEXT.
 *
 * Architecture:
 *   1. detectUncertainClaims() (from contradiction.mjs) identifies hedging language
 *   2. This module dispatches Gemini Flash with web search for each claim
 *   3. Results are parsed and persisted as conclusion wiki nodes
 *   4. Corrections/confirmations are injected into ACTIVE CONTEXT
 *   5. Critical corrections trigger macOS notifications
 *
 * Zero blocking: all research is async and runs in the background.
 * The primary agent never waits for research results.
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { slugify } from '../../core/utils.mjs';

// ─── CONSTANTS ──────────────────────────────────────────────────────────────────

const GEMINI_BINARY = 'gemini';
const CODEX_BINARY = 'codex';
const RESEARCH_TIMEOUT_MS = 30000; // 30s max per claim
const MAX_CONCURRENT_RESEARCH = 2;  // Don't overwhelm rate limits

// ─── VERIFIABLE CLAIM DETECTION ─────────────────────────────────────────────────
// Extends the basic uncertainty detection with patterns for verifiable
// technical claims that should be fact-checked even without hedging language.

const VERIFIABLE_PATTERNS = [
  // Version/API claims
  /\b(?:version|v)\s*\d+\.\d+/i,
  /\bAPI\s+(?:endpoint|key|rate\s+limit)/i,
  /\bdeprecated\s+(?:in|since|as\s+of)/i,
  // Technical facts
  /\bdefault(?:s?\s+to|\s+(?:value|port|timeout))\s+\S+/i,
  /\bmaximum\s+(?:of|is|=)\s+\d+/i,
  /\brequires?\s+(?:node|npm|python)\s+\d+/i,
  // Date claims
  /\breleased?\s+(?:in|on)\s+\d{4}/i,
  /\bsince\s+\d{4}/i,
];

/**
 * Detect claims in agent text that could benefit from web verification.
 * Combines uncertainty detection with verifiable technical claim patterns.
 *
 * @param {string} text - Agent's response text
 * @returns {Array<{claim: string, type: 'uncertain'|'verifiable', confidence: number}>}
 */
export function detectResearchableClaims(text) {
  if (!text || text.length < 20) return [];

  const claims = [];
  const sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.length > 15);

  for (const sentence of sentences) {
    // Check uncertainty patterns (higher priority)
    const isUncertain =
      /\bI\s+think\b/i.test(sentence) ||
      /\bIIRC\b/i.test(sentence) ||
      /\bprobably\b/i.test(sentence) ||
      /\bI\s+believe\b/i.test(sentence) ||
      /\bif\s+I\s+recall\b/i.test(sentence) ||
      /\bshould\s+be\b/i.test(sentence) ||
      /\bmight\s+be\b/i.test(sentence) ||
      /\bnot\s+(?:sure|certain)\b/i.test(sentence);

    if (isUncertain) {
      claims.push({
        claim: sentence.trim().slice(0, 300),
        type: 'uncertain',
        confidence: 0.3, // Low confidence = high priority for verification
      });
      continue;
    }

    // Check verifiable technical claims (lower priority)
    for (const pattern of VERIFIABLE_PATTERNS) {
      if (pattern.test(sentence)) {
        claims.push({
          claim: sentence.trim().slice(0, 300),
          type: 'verifiable',
          confidence: 0.6,
        });
        break; // One match per sentence is enough
      }
    }
  }

  // Deduplicate and limit
  const unique = claims.filter((c, i, arr) =>
    arr.findIndex(x => x.claim === c.claim) === i
  );

  return unique.slice(0, 5); // Max 5 claims per batch
}

// ─── RESEARCH VIA GEMINI CLI ────────────────────────────────────────────────────

/**
 * Dispatch Gemini Flash with web search to verify a claim.
 *
 * @param {string} claim - The claim text to verify
 * @param {Object} [options]
 * @param {string} [options.model] - Gemini model to use
 * @param {number} [options.timeoutMs] - Max time per research query
 * @returns {Promise<{verified: boolean|null, correction: string|null, sources: string[], raw: string}>}
 */
export async function researchClaim(claim, { model = 'gemini-2.5-flash', timeoutMs = RESEARCH_TIMEOUT_MS } = {}) {
  const prompt = `You are a fact-checker. Verify this claim and respond with ONLY a JSON object (no markdown, no code fences):

CLAIM: "${claim.replace(/"/g, '\\"')}"

Respond with this exact JSON structure:
{"verified": true/false/null, "correction": "corrected fact if wrong, null if correct", "sources": ["url1", "url2"], "summary": "brief explanation"}

Rules:
- verified=true if the claim is factually correct
- verified=false if the claim is factually incorrect (provide correction)
- verified=null if you cannot determine (insufficient evidence)
- sources should be real URLs you found
- Keep summary under 100 words`;

  try {
    const result = await spawnPromise(
      GEMINI_BINARY,
      ['-p', prompt, '-m', model, '--yolo'],
      { timeout: timeoutMs }
    );

    // Parse the JSON response
    const jsonMatch = result.match(/\{[\s\S]*"verified"[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          verified: parsed.verified ?? null,
          correction: parsed.correction || null,
          sources: Array.isArray(parsed.sources) ? parsed.sources.filter(s => typeof s === 'string') : [],
          summary: parsed.summary || '',
          raw: result.slice(0, 500),
        };
      } catch {
        // JSON parse failed — extract what we can
        return { verified: null, correction: null, sources: [], summary: '', raw: result.slice(0, 500) };
      }
    }

    return { verified: null, correction: null, sources: [], summary: '', raw: result.slice(0, 500) };
  } catch (err) {
    // Timeout or process error — try Codex fallback
    return researchClaimFallback(claim, { timeoutMs });
  }
}

// ─── CODEX CLI FALLBACK ─────────────────────────────────────────────────────────

/**
 * Fallback research engine using Codex CLI when Gemini is rate-limited.
 *
 * @param {string} claim - The claim to verify
 * @param {Object} [options]
 * @param {number} [options.timeoutMs]
 * @returns {Promise<{verified: boolean|null, correction: string|null, sources: string[], raw: string}>}
 */
async function researchClaimFallback(claim, { timeoutMs = RESEARCH_TIMEOUT_MS } = {}) {
  try {
    const prompt = `Fact-check this claim. Reply with JSON only: {"verified": true/false/null, "correction": "...", "sources": [], "summary": "..."}. Claim: "${claim}"`;

    const result = await spawnPromise(
      CODEX_BINARY,
      ['-p', prompt, '--approval-mode', 'yolo'],
      { timeout: timeoutMs }
    );

    const jsonMatch = result.match(/\{[\s\S]*"verified"[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          verified: parsed.verified ?? null,
          correction: parsed.correction || null,
          sources: Array.isArray(parsed.sources) ? parsed.sources : [],
          summary: parsed.summary || '',
          raw: result.slice(0, 500),
        };
      } catch {
        return { verified: null, correction: null, sources: [], summary: '', raw: result.slice(0, 500) };
      }
    }

    return { verified: null, correction: null, sources: [], summary: '', raw: '' };
  } catch {
    return { verified: null, correction: null, sources: [], summary: 'Research unavailable (both Gemini and Codex failed)', raw: '' };
  }
}

// ─── CONCLUSION WIKI NODE CREATION ──────────────────────────────────────────────

/**
 * Create a wiki node of type "conclusion" to persist a research result.
 *
 * @param {string} wikiDir - Path to the wiki directory
 * @param {Object} params
 * @param {string} params.claim - Original claim
 * @param {boolean|null} params.verified - Verification result
 * @param {string|null} params.correction - Corrected fact if wrong
 * @param {string[]} params.sources - Source URLs
 * @param {string} params.summary - Research summary
 * @param {string} params.conversationId - Source conversation
 * @returns {{filePath: string, slug: string}}
 */
export function createConclusionNode(wikiDir, { claim, verified, correction, sources, summary, conversationId }) {
  const conclusionDir = path.join(wikiDir, 'conclusions');
  if (!fs.existsSync(conclusionDir)) {
    fs.mkdirSync(conclusionDir, { recursive: true });
  }

  const today = new Date().toISOString().split('T')[0];
  const timestamp = Date.now();

  // Generate a slug from the claim
  const claimSlug = slugify(claim.slice(0, 60)) || `research-${timestamp}`;
  const slug = `conclusion-${claimSlug}`;
  const filePath = path.join(conclusionDir, `${slug}.md`);

  const verifiedLabel = verified === true ? 'CONFIRMED' : verified === false ? 'REFUTED' : 'INCONCLUSIVE';
  const sentiment = verified === false ? 'corrective' : verified === true ? 'positive' : 'neutral';
  const intensity = verified === false ? 8 : verified === true ? 4 : 3;
  const alertType = verified === false ? 'IMPORTANT' : verified === true ? 'TIP' : 'NOTE';

  const sourcesList = sources.length > 0
    ? sources.map(s => `  - "${s}"`).join('\n')
    : '  - "system:coprocessor-research"';

  const content = `---
type: conclusion
confidence: ${verified === null ? 'low' : 'medium'}
sentiment: ${sentiment}
sentiment_intensity: ${intensity}
last_verified: ${today}
created: ${today}
access_count: 0
provenance:
  - "coprocessor:system2-research"
  - "conversation:${conversationId || 'unknown'}"
${sourcesList.split('\n').map(s => s.trim().startsWith('-') ? s : '').filter(Boolean).join('\n')}
related: []
supersedes: null
superseded_by: null
---

# ${verifiedLabel}: ${claim.slice(0, 120)}

> [!${alertType}]
> **Fact Check Result: ${verifiedLabel}**
> ${verified === false ? `Correction: ${correction || 'See details below.'}` : verified === true ? `Confirmed: ${summary || claim}` : `Inconclusive: ${summary || 'Unable to verify with available evidence.'}`}

## Original Claim
> "${claim}"

## Research Result
- **Status**: ${verifiedLabel}
- **Date**: ${today}
${correction ? `- **Correction**: ${correction}` : ''}
${summary ? `- **Summary**: ${summary}` : ''}

## Sources
${sources.length > 0 ? sources.map(s => `- [${s}](${s})`).join('\n') : '- No external sources available'}

## Provenance
- System 2 Researcher (Memory Co-Processor)
- Conversation: ${conversationId || 'unknown'}
`;

  fs.writeFileSync(filePath, content);
  return { filePath, slug };
}

// ─── INDEX CONCLUSION NODE ──────────────────────────────────────────────────────

/**
 * Add a conclusion node to the FTS5 index without full reindex.
 *
 * @param {Object} db - SQLite database connection
 * @param {string} filePath - Path to the conclusion node file
 * @param {string} root - Repository root path
 */
export function indexConclusionNode(db, filePath, root) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const slug = path.basename(filePath, '.md');
    const relativePath = path.relative(root, filePath);

    // Extract title from first heading
    const titleMatch = content.match(/^#\s+(.+)/m);
    const title = titleMatch ? titleMatch[1].trim() : slug;

    // Insert into FTS5 (don't delete first — this is incremental)
    const existing = db.prepare(
      "SELECT rowid FROM memory_fts WHERE source = 'wiki' AND source_id = ?"
    ).get(relativePath);

    if (existing) {
      db.prepare("DELETE FROM memory_fts WHERE rowid = ?").run(existing.rowid);
    }

    db.prepare(
      "INSERT INTO memory_fts (source, source_id, title, content, category) VALUES (?, ?, ?, ?, ?)"
    ).run('wiki', relativePath, title, content, 'conclusion');
  } catch {
    // Best-effort indexing — don't crash the daemon
  }
}

// ─── BATCH RESEARCH ─────────────────────────────────────────────────────────────

/**
 * Research multiple claims in parallel with concurrency limiting.
 *
 * @param {Array<{claim: string, type: string}>} claims - Claims to research
 * @param {Object} [options]
 * @param {string} [options.model] - Gemini model
 * @param {number} [options.maxConcurrent] - Max parallel research queries
 * @returns {Promise<Array<{claim: string, result: Object}>>}
 */
export async function batchResearch(claims, { model = 'gemini-2.5-flash', maxConcurrent = MAX_CONCURRENT_RESEARCH } = {}) {
  const results = [];

  // Process in batches to respect rate limits
  for (let i = 0; i < claims.length; i += maxConcurrent) {
    const batch = claims.slice(i, i + maxConcurrent);
    const batchResults = await Promise.allSettled(
      batch.map(c => researchClaim(c.claim, { model }))
    );

    for (let j = 0; j < batch.length; j++) {
      const result = batchResults[j];
      results.push({
        claim: batch[j].claim,
        type: batch[j].type,
        result: result.status === 'fulfilled' ? result.value : { verified: null, correction: null, sources: [], summary: 'Research failed', raw: '' },
      });
    }
  }

  return results;
}

// ─── FORMAT RESULTS FOR INJECTION ───────────────────────────────────────────────

/**
 * Convert research results into context items for ACTIVE CONTEXT injection.
 *
 * @param {Array<{claim: string, result: Object}>} results
 * @returns {Array<{type: string, label: string, text: string}>}
 */
export function formatResearchResults(results) {
  const contextItems = [];

  for (const { claim, result } of results) {
    if (result.verified === null) continue; // Skip inconclusive

    if (result.verified === false) {
      // Critical correction
      contextItems.push({
        type: 'important',
        label: 'Fact Check: CORRECTION',
        text: `Claim "${claim.slice(0, 80)}..." is INCORRECT. ${result.correction || result.summary}`,
      });
    } else if (result.verified === true) {
      // Confirmation (lower priority, only include if high-value)
      contextItems.push({
        type: 'note',
        label: 'Fact Check: Confirmed',
        text: `Verified: ${claim.slice(0, 100)}`,
      });
    }
  }

  return contextItems;
}

// ─── UTILITY ────────────────────────────────────────────────────────────────────

/**
 * Spawn a CLI binary with argument array (no shell) and return stdout.
 * @param {string} bin - Binary name
 * @param {string[]} args - Argument array
 * @param {Object} [options]
 * @param {number} [options.timeout]
 * @returns {Promise<string>}
 */
function spawnPromise(bin, args, { timeout = RESEARCH_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`${bin} exited with code ${code}`));
      } else {
        resolve(stdout || stderr || '');
      }
    });

    child.on('error', reject);
  });
}
