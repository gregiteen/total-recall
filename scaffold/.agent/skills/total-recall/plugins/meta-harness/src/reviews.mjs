/** Review results are append-only SSSS records, independent of thread lifetime. */
import crypto from 'node:crypto';
import path from 'node:path';
import { threadsFile } from './paths.mjs';
import { PluginStateStore } from './ssss-store.mjs';

const store = () => new PluginStateStore(path.join(path.dirname(threadsFile()), 'meta-harness-reviews.jsonl'), 'meta-harness');
const dispositions = { APPROVE: 'approved', REQUEST_CHANGES: 'changes_requested', NEEDS_DISCUSSION: 'needs_discussion', NO_DIFF: 'no_diff', FAILED: 'failed' };

export function readReviews() { return store().read([]); }
export function recordReview(result, selection = {}) {
  const review = result.review;
  const verdict = review?.verdict || result.verdict || 'FAILED';
  if (!dispositions[verdict]) throw new Error('Invalid review verdict');
  const entry = {
    id: `review-${crypto.randomUUID()}`, timestamp: new Date().toISOString(),
    workspace: selection.workspace, target: review?.target || result.target || selection.target || null,
    commit: review?.snapshotCommit || selection.commit || null,
    diff: selection.diff || '', untracked: selection.untracked || [],
    reviewer: review?.reviewer || result.reviewer || selection.reviewer || null,
    verdict, disposition: dispositions[verdict], result,
  };
  store().append(entry);
  return entry;
}
