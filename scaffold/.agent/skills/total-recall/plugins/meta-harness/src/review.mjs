/**
 * Meta Harness Universal Cross-Model Adversarial Code Review Engine
 *
 * Runs automated code reviews across integrated agent platforms (claude, codex, agy,
 * grok, dsh, hermes, etc.).
 *
 * Golden Rule: The Reviewer MUST belong to a distinct model family from the Author / Implementer
 * to eliminate self-confirmation bias.
 */

import { spawnSync } from 'node:child_process';
import { ADAPTER_CATALOG } from '../capability/index.mjs';
import { appendThreadTurn, updateThread } from './threads.mjs';
import { notifyAlert } from './alerts.mjs';
import { dispatchWithReceipt } from './dispatch.mjs';
import { resolvePool } from './pool.mjs';
import { lastJsonWith } from './json-reply.mjs';

const MAX_DIFF = 30000;
// Generated surfaces say nothing a reviewer can act on, and they crowd out the source.
const GENERATED = ['.cursorrules', '.cursor', 'openwiki', 'package-lock.json', 'AGENTS.md', 'CLAUDE.md', 'GEMINI.md', 'INSTRUCTIONS.md'].map(item => `:!${item}`);

/**
 * Read exactly what was asked for: an explicit target, the staged changes, or by default the
 * branch against the default branch and then the uncommitted changes. An explicitly requested
 * selection that turns out empty stays empty.
 */
export function extractGitDiff(options = {}) {
  const cwd = options.cwd || process.cwd();
  const read = (args, extra = []) => spawnSync('git', ['diff', ...extra, ...args, '--', '.', ...GENERATED], { cwd, encoding: 'utf8', timeout: 15000, maxBuffer: 64 * 1024 * 1024 });
  const done = (args, diff, target) => {
    const stat = read(args, ['--stat']).stdout || '';
    const untracked = spawnSync('git', ['ls-files', '-o', '--exclude-standard'], { cwd, encoding: 'utf8', timeout: 15000 }).stdout || '';
    return { ok: true, diff, target, stat: stat.trim(), untracked: untracked.trim().split('\n').filter(Boolean) };
  };
  const explicit = options.staged === true ? ['--staged'] : (options.target || options.branch) ? [options.target || options.branch] : null;
  try {
    if (explicit) {
      const result = read(explicit);
      if (result.status !== 0) return { ok: false, error: String(result.stderr || 'git diff failed').trim(), diff: '' };
      return done(explicit, result.stdout.trim(), explicit.join(' '));
    }
    const branchRange = `${getDefaultBranch(cwd)}...HEAD`;
    const branch = read([branchRange]);
    if (branch.status === 0 && branch.stdout.trim()) return done([branchRange], branch.stdout.trim(), branchRange);
    const working = read(['HEAD']);
    if (working.status !== 0) return { ok: false, error: String(working.stderr || 'git diff failed').trim(), diff: '' };
    return done(['HEAD'], working.stdout.trim(), 'HEAD');
  } catch (error) {
    return { ok: false, error: error.message, diff: '' };
  }
}

function getDefaultBranch(cwd) {
  try {
    const res = spawnSync('git', ['symbolic-ref', 'refs/remotes/origin/HEAD'], { cwd, encoding: 'utf8', timeout: 3000 });
    if (res.status === 0 && res.stdout.includes('/')) {
      return res.stdout.trim().split('/').pop();
    }
  } catch {}
  return 'main';
}

/**
 * Assign an adversarial reviewer from an alternative model family
 */
export function selectAdversarialReviewer(authorHarness, availablePool = [], options = {}) {
  const authorFamily = ADAPTER_CATALOG[authorHarness]?.family || null;

  // Filter pool for distinct family
  const distinctFamilyCandidates = availablePool.filter(h => {
    const spec = ADAPTER_CATALOG[h.id] || h;
    return spec.family && spec.family !== authorFamily && h.id !== authorHarness;
  });

  if (distinctFamilyCandidates.length > 0) {
    // Prefer higher quality frontier reviewers
    distinctFamilyCandidates.sort((a, b) => (b.qualityScore || 8) - (a.qualityScore || 8));
    return distinctFamilyCandidates[0];
  }

  // Nobody independent is available when every remaining harness shares the author's family.
  return null;
}

/**
 * Construct structured adversarial review prompt
 */
export function buildReviewPrompt(diff, context = {}) {
  const task = context.task ? `Context / Task:\n${context.task}\n\n` : '';
  const branch = context.branch ? `Branch: ${context.branch}\n` : '';

  return `[ROLE: ADVERSARIAL CODE REVIEWER]
You are an independent, highly critical senior security and architecture engineer performing an adversarial code review.
You did NOT write this code. Do not rubber-stamp. Look for vulnerabilities, silent failures, regressions, anti-patterns, and test coverage gaps.

${task}${branch}${context.stat ? `Files changed:\n${context.stat}\n\n` : ''}${context.untracked?.length ? `New untracked files, not in the diff; read them too:\n${context.untracked.slice(0, 100).join('\n')}\n\n` : ''}${diff.length > MAX_DIFF ? `This diff is cut at ${MAX_DIFF} of ${diff.length} characters. Read the remainder from the repository and say so if you could not.\n` : ''}GIT DIFF TO REVIEW:
\`\`\`diff
${diff.slice(0, MAX_DIFF)}
\`\`\`

Evaluate the diff against these strict criteria:
1. Security & Blast Radius (privilege escalation, token leakage, unhandled exceptions)
2. Invariant & Rule Adherence (does it break existing contracts or introduce silent side effects?)
3. Determinism & Test Coverage (are edge cases covered by automated tests?)
4. Architecture & Code Hygiene (readability, dead code, performance pitfalls)

Output your review in the following exact JSON format:
{
  "verdict": "APPROVE" | "REQUEST_CHANGES" | "NEEDS_DISCUSSION",
  "riskScore": <1-10, where 1 is trivial/clean and 10 is critical vulnerability>,
  "summary": "<Concise 2-3 sentence executive summary>",
  "findings": [
    {
      "severity": "critical" | "warning" | "suggestion",
      "file": "<filename>",
      "line": "<line number or approximate>",
      "issue": "<concise description>",
      "suggestedFix": "<concrete recommendation>"
    }
  ],
  "invariantsChecked": ["<list of rules or invariants verified>"]
}`;
}

/** Only a stated verdict counts. Anything else needs a human, and says so. */
export function parseReviewVerdict(response) {
  const text = String(response || '').trim();
  const parsed = lastJsonWith(text, 'verdict');
  if (parsed && ['APPROVE', 'REQUEST_CHANGES', 'NEEDS_DISCUSSION'].includes(parsed.verdict)) return { ...parsed, parsed: true, findings: Array.isArray(parsed.findings) ? parsed.findings : [] };
  return { verdict: 'NEEDS_DISCUSSION', parsed: false, riskScore: null, summary: text.slice(0, 300) || 'The reviewer returned nothing readable.', findings: [] };
}

export async function executeCodeReview(options = {}) {
  const cwd = options.cwd || process.cwd();
  const author = options.author || null;
  const diffResult = extractGitDiff({ cwd, target: options.target, staged: options.staged });
  if (!diffResult.ok) throw new Error(`Failed to read the diff: ${diffResult.error}`);
  if (!diffResult.diff) return { ok: true, verdict: 'NO_DIFF', target: diffResult.target, summary: `Nothing to review for ${diffResult.target}.` };

  const { ready, excluded } = await resolvePool(options);
  const reviewer = options.reviewer ? (ready.find(h => h.id === options.reviewer) || { id: options.reviewer, name: options.reviewer }) : selectAdversarialReviewer(author, ready);
  if (!reviewer) throw new Error(`No independent reviewer can take work right now: ${excluded.map(e => `${e.harness} (${e.reason})`).join(', ') || 'no other harness available'}`);

  const authorFamily = ADAPTER_CATALOG[author]?.family || null;
  const reviewerFamily = ADAPTER_CATALOG[reviewer.id]?.family || reviewer.family || null;
  if (author && (reviewer.id === author || (authorFamily && authorFamily === reviewerFamily))) throw new Error(`${reviewer.id} shares a model family with the author ${author}, so it cannot review this independently`);
  const independence = author ? 'verified' : 'unverified: the author was not named';
  const truncated = diffResult.diff.length > MAX_DIFF;
  const result = await dispatchWithReceipt({
    agent: reviewer.id, cwd, contextTask: options.task || `Review the code changes in ${diffResult.target}`,
    prompt: buildReviewPrompt(diffResult.diff, { task: options.task, branch: options.branch || diffResult.target, stat: diffResult.stat, untracked: diffResult.untracked }),
    permissions: { read: true, write: false }, allowUnknownAuth: true,
  }, { dispatchFn: options.dispatchFn, role: 'Reviewer' });
  if (!result.ok) return { ok: false, target: diffResult.target, reviewer: reviewer.id, error: result.error, failureKind: result.failureKind, excluded };

  const review = { ...parseReviewVerdict(result.response), reviewer: reviewer.id, reviewerName: reviewer.name || reviewer.id, author, target: diffResult.target, truncated, independence, timestamp: new Date().toISOString() };
  let threadError;
  if (options.threadId) {
    try {
      appendThreadTurn(options.threadId, { role: 'reviewer', agent: reviewer.id, content: `[Code review by ${review.reviewerName}]\nVerdict: ${review.verdict}\nRisk: ${review.riskScore ?? 'not stated'}/10\n${review.summary || ''}` });
      updateThread(options.threadId, { review, status: review.verdict === 'APPROVE' ? 'approved' : 'review_pending' });
    } catch (error) { threadError = error.message; }
  }
  if (review.verdict === 'REQUEST_CHANGES' || review.riskScore >= 7) {
    await notifyAlert({ title: `Code review: changes requested by ${review.reviewerName}`, message: `Risk ${review.riskScore ?? 'not stated'}/10 on ${diffResult.target}: ${String(review.summary || '').slice(0, 120)}`, severity: 'warning' });
  }
  return { ok: true, review, ...(threadError ? { threadError } : {}) };
}
