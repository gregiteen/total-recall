/**
 * Metaharness Universal Cross-Model Adversarial Code Review Engine
 *
 * Runs automated code reviews across integrated agent platforms (claude, codex, agy,
 * grok, dsh, hermes, etc.).
 *
 * Golden Rule: The Reviewer MUST belong to a distinct model family from the Author / Implementer
 * to eliminate self-confirmation bias.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ADAPTER_CATALOG } from '../capability/index.mjs';
import { appendThreadTurn, updateThread } from './threads.mjs';
import { notifyAlert } from './alerts.mjs';
import { dispatchWithReceipt } from './dispatch.mjs';
import { resolvePool, localExecutionNode } from './pool.mjs';
import { lastJsonWith } from './json-reply.mjs';
import { createWorktree, removeWorktree, commitAll, headCommit } from './worktree.mjs';
import { forwardRemoteOperation } from './remote-operation.mjs';
import { recordReview } from './reviews.mjs';

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
  const run = args => spawnSync('git', args, { cwd, encoding: 'utf8', timeout: 15000, maxBuffer: 64 * 1024 * 1024 });
  const read = (args, extra = []) => run(['diff', ...(extra.length ? extra : ['--binary']), ...args, '--', '.', ...GENERATED]);
  const ref = value => {
    const result = run(['rev-parse', '--verify', `${value}^{commit}`]);
    if (result.status !== 0) throw new Error(String(result.stderr || 'Invalid review reference').trim());
    return result.stdout.trim();
  };
  const done = (args, diff, target, snapshot) => {
    const stat = read(args, ['--stat']).stdout || '';
    const untracked = snapshot.mode === 'working' ? run(['ls-files', '-o', '--exclude-standard', '-z', '--', '.', ...GENERATED]).stdout || '' : '';
    return { ok: true, diff, target, stat: stat.trim(), untracked: untracked.split('\0').filter(Boolean), snapshot };
  };
  const explicit = options.staged === true ? ['--staged'] : (options.target || options.branch) ? [options.target || options.branch] : null;
  try {
    if (explicit) {
      if (explicit[0] !== '--staged' && explicit[0].startsWith('-')) throw new Error('Review targets must be Git references, not options');
      const result = read(explicit);
      if (result.status !== 0) return { ok: false, error: String(result.stderr || 'git diff failed').trim(), diff: '' };
      let snapshot;
      if (options.staged === true) snapshot = { mode: 'staged', ref: ref('HEAD') };
      else if (explicit[0].includes('..')) snapshot = { mode: 'commit', ref: ref(explicit[0].split(/\.{2,3}/).at(-1) || 'HEAD') };
      else snapshot = { mode: 'working', ref: ref(explicit[0]) };
      return done(explicit, result.stdout.trim(), explicit.join(' '), snapshot);
    }
    const mergeBase = run(['merge-base', getDefaultBranch(cwd), 'HEAD']);
    const base = mergeBase.status === 0 ? mergeBase.stdout.trim() : ref('HEAD');
    const working = read([base]);
    if (working.status !== 0) return { ok: false, error: String(working.stderr || 'git diff failed').trim(), diff: '' };
    return done([base], working.stdout.trim(), 'working tree', { mode: 'working', ref: base });
  } catch (error) {
    return { ok: false, error: error.message, diff: '' };
  }
}

function getDefaultBranch(cwd) {
  try {
    const res = spawnSync('git', ['symbolic-ref', 'refs/remotes/origin/HEAD'], { cwd, encoding: 'utf8', timeout: 3000 });
    if (res.status === 0 && res.stdout.includes('/')) {
      return res.stdout.trim();
    }
  } catch {}
  return 'main';
}

/** Pin the selected diff in a disposable commit, so reviewers never read unrelated current files. */
function reviewSnapshot(cwd, selection) {
  const directory = createWorktree(cwd, { ref: selection.snapshot.ref, prefix: 'meta-harness-review-' });
  try {
    if (selection.snapshot.mode !== 'commit') {
      if (selection.diff) {
        const patch = spawnSync('git', ['apply', '--index', '--binary', '-'], { cwd: directory, input: `${selection.diff}\n`, encoding: 'utf8', timeout: 15000 });
        if (patch.status !== 0) throw new Error(`Could not pin the selected review diff: ${String(patch.stderr || patch.error).trim()}`);
      }
      for (const file of selection.untracked) {
        const source = path.resolve(cwd, file), destination = path.resolve(directory, file);
        if (!source.startsWith(`${path.resolve(cwd)}${path.sep}`) || !destination.startsWith(`${directory}${path.sep}`) || !fs.lstatSync(source).isFile()) throw new Error(`Unsafe untracked review file: ${file}`);
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.copyFileSync(source, destination);
      }
      commitAll(directory, 'meta-harness: pin selected review snapshot');
    }
    return { directory, commit: headCommit(directory) };
  } catch (error) { removeWorktree(cwd, directory); throw error; }
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

${task}${branch}${context.evidence ? `Job evidence (recorded by Metaharness, not by the author):\n${JSON.stringify(context.evidence, null, 2).slice(0, 8000)}\n\n` : ''}${context.stat ? `Files changed:\n${context.stat}\n\n` : ''}${context.untracked?.length ? `New untracked files, not in the diff; read them too:\n${context.untracked.slice(0, 100).join('\n')}\n\n` : ''}${diff.length > MAX_DIFF ? `This diff is cut at ${MAX_DIFF} of ${diff.length} characters. Read the remainder from the repository and say so if you could not.\n` : ''}GIT DIFF TO REVIEW:
\`\`\`diff
${diff.slice(0, MAX_DIFF)}
\`\`\`

Judge the diff. Use the job evidence for claims about how the job ran (questions asked, replies, the goal check, the gate). A claim you cannot verify from the diff or the evidence is a "suggestion" marked unverified in its issue text; it is never "critical" or blocking. Mark a finding "critical" only for a defect in the diff itself.

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

export function reviewBlocksPush(result) {
  if (result?.ok !== true) return true;
  if (result.verdict === 'NO_DIFF') return false;
  const review = result.review;
  // R45.8: only blocking findings stop the push; other findings go to the job result.
  // An unreadable review cannot clear a push, so it blocks.
  return !review || review.parsed === false ||
    review.findings?.some(f => f.blocking === true || ['blocking', 'critical'].includes(f.severity)) === true;
}

export async function executeCodeReview(options = {}) {
  const remote = await forwardRemoteOperation('review', null, options);
  if (remote) return remote;
  localExecutionNode(options);
  const selection = { workspace: options.cwd || process.cwd(), target: options.target || (options.staged ? '--staged' : 'working tree'), reviewer: options.reviewer || null };
  let result;
  try { result = await executeLocalReview(options, selection); }
  catch (error) {
    // Preserve the existing CLI error contract, but retain failed attempts too.
    try { recordReview({ ok: false, error: error.message }, selection); }
    catch (storeError) { throw new Error(`${error.message}; review store failed: ${storeError.message}`); }
    throw error;
  }
  try { return { ...result, reviewId: recordReview(result, selection).id }; }
  catch (error) { return { ...result, ok: false, reviewStoreError: error.message }; }
}

async function executeLocalReview(options, selection) {
  const cwd = options.cwd || process.cwd();
  const author = options.author || null;
  const diffResult = extractGitDiff({ cwd, target: options.target, staged: options.staged });
  if (!diffResult.ok) throw new Error(`Failed to read the diff: ${diffResult.error}`);
  Object.assign(selection, { diff: diffResult.diff, untracked: diffResult.untracked, target: diffResult.target, commit: headCommit(cwd) });
  if (!diffResult.diff && !diffResult.untracked?.length) return { ok: true, verdict: 'NO_DIFF', target: diffResult.target, summary: `Nothing to review for ${diffResult.target}.` };

  const { ready, excluded } = await resolvePool(options);
  const reviewer = options.reviewer ? ready.find(h => h.id === options.reviewer) : selectAdversarialReviewer(author, ready);
  if (!reviewer) throw new Error(`No independent reviewer can take work right now: ${excluded.map(e => `${e.harness} (${e.reason})`).join(', ') || 'no other harness available'}`);

  const authorFamily = ADAPTER_CATALOG[author]?.family || null;
  const reviewerFamily = ADAPTER_CATALOG[reviewer.id]?.family || reviewer.family || null;
  if (author && (reviewer.id === author || (authorFamily && authorFamily === reviewerFamily))) throw new Error(`${reviewer.id} shares a model family with the author ${author}, so it cannot review this independently`);
  const independence = author ? 'verified' : 'unverified: the author was not named';
  selection.reviewer = reviewer.id;
  const truncated = diffResult.diff.length > MAX_DIFF;
  const snapshot = reviewSnapshot(cwd, diffResult);
  selection.commit = snapshot.commit;
  let result;
  try { result = await dispatchWithReceipt({
    agent: reviewer.id, node: 'local', cwd: snapshot.directory, contextCwd: cwd, contextTask: options.task || `Review the code changes in ${diffResult.target}`,
    prompt: buildReviewPrompt(diffResult.diff, { task: options.task, evidence: options.evidence, branch: options.branch || diffResult.target, stat: diffResult.stat, untracked: diffResult.untracked }),
    permissions: { read: true, write: false }, allowUnknownAuth: options.allowUnknownAuth === true,
    ...(reviewer.id === 'codex' ? { reviewTarget: { type: 'custom', instructions: buildReviewPrompt(diffResult.diff, { task: options.task, evidence: options.evidence, branch: diffResult.target }) } } : {}),
  }, { dispatchFn: options.dispatchFn, role: 'Reviewer' }); }
  finally { removeWorktree(cwd, snapshot.directory); }
  if (!result.ok) return { ok: false, target: diffResult.target, reviewer: reviewer.id, error: result.error, failureKind: result.failureKind, excluded };

  const review = { ...parseReviewVerdict(result.response), reviewer: reviewer.id, reviewerName: reviewer.name || reviewer.id, author, target: diffResult.target, snapshotCommit: snapshot.commit, truncated, independence, node: 'local', workspace: cwd, ...(options.threadId ? { threadId: options.threadId } : {}), timestamp: new Date().toISOString() };
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
