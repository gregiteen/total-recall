import { describe, it, expect, beforeEach } from 'vitest';
import { vi } from 'vitest';

vi.mock('./logger.mjs', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import fs from 'fs';
import os from 'os';
import path from 'path';
import matter from 'gray-matter';
import {
  listProposals,
  getProposal,
  setProposalStatus,
  applyProposal,
  applyAcceptedProposals,
  revertProposal,
  PROPOSAL_STATUSES,
  AUTO_APPLICABLE_TOPICS,
} from './proposal-applier.mjs';
import { evaluateProposalGate, createProposal } from './optimizer.mjs';
import { pruneResolvedProposals } from './dream.mjs';

let vaultDir;

/** Minimal but schema-complete memory node, written straight to disk as a fixture. */
function writeMemory({ slug, predicate = 'use', object = 'api', importance = 2, ...rest }) {
  const now = new Date().toISOString();
  const dir = path.join(vaultDir, rest.category || 'facts');
  fs.mkdirSync(dir, { recursive: true });
  const node = {
    type: 'memory',
    schema_version: 2,
    slug,
    title: rest.title || slug,
    description: rest.description || slug,
    timestamp: now,
    category: rest.category || 'facts',
    status: rest.status || 'active',
    subject: rest.subject || 'system',
    predicate,
    object,
    importance,
    confidence: rest.confidence ?? 0.8,
    modality: rest.modality || 'should',
    evidence_count: rest.evidence_count ?? 1,
    created: now,
    updated: now,
    last_accessed: rest.last_accessed || now,
    source: { type: 'test', session_id: 'sess-1', agent: 'test', evidence_count: rest.evidence_count ?? 1 },
    decay: { half_life_days: 30, access_count: 0 },
    ...rest,
  };
  fs.writeFileSync(path.join(dir, `${slug}.md`), matter.stringify('body text', node));
  return node;
}

function writeProposalFile({ id, topic, target, status = 'accepted' }) {
  const dir = path.join(vaultDir, 'proposals');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${id}.md`), matter.stringify('rationale body', {
    type: 'proposal',
    proposal_id: id,
    slug: id,
    title: `proposal ${id}`,
    description: 'test proposal',
    timestamp: new Date().toISOString(),
    category: 'proposals',
    proposal_topic: topic,
    target_path: target,
    summary: `proposal ${id}`,
    rationale: 'Detected nodes with identical predicate:object signatures.',
    status,
    proposed_by: 'kernel_optimizer_v1',
    proposed_at: new Date().toISOString(),
  }));
  return id;
}

beforeEach(() => {
  vaultDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tr-apply-')), 'memory-vault');
  fs.mkdirSync(vaultDir, { recursive: true });
});

describe('proposal listing and status machine', () => {
  it('surfaces the on-disk topic as `topic`, not the vault folder', () => {
    writeProposalFile({ id: 'prop_a', topic: 'memory-cleanup', target: 'x,y' });
    const [p] = listProposals(vaultDir);
    expect(p.topic).toBe('memory-cleanup');
    expect(p.category).toBe('proposals');
  });

  it('filters by status', () => {
    writeProposalFile({ id: 'prop_a', topic: 'memory-cleanup', target: 'x,y', status: 'accepted' });
    writeProposalFile({ id: 'prop_b', topic: 'memory-cleanup', target: 'x,y', status: 'applied' });
    expect(listProposals(vaultDir, { status: 'accepted' })).toHaveLength(1);
    expect(listProposals(vaultDir, { status: ['accepted', 'applied'] })).toHaveLength(2);
  });

  it('refuses a status outside the state machine', async () => {
    writeProposalFile({ id: 'prop_a', topic: 'memory-cleanup', target: 'x,y' });
    await expect(setProposalStatus(vaultDir, 'prop_a', 'done')).rejects.toThrow(/Invalid proposal status/);
    expect(PROPOSAL_STATUSES).toContain('superseded');
  });

  it('preserves unrelated frontmatter across a status change', async () => {
    writeProposalFile({ id: 'prop_a', topic: 'memory-cleanup', target: 'x,y' });
    await setProposalStatus(vaultDir, 'prop_a', 'rejected', { rejection_reason: 'nope' });
    const p = getProposal(vaultDir, 'prop_a');
    expect(p.status).toBe('rejected');
    expect(p.proposed_by).toBe('kernel_optimizer_v1');
    expect(p.target_path).toBe('x,y');
  });
});

describe('memory-cleanup apply', () => {
  it('supersedes duplicates and keeps the node with the most evidence', async () => {
    writeMemory({ slug: 'dup-weak', evidence_count: 1 });
    writeMemory({ slug: 'dup-strong', evidence_count: 9 });
    writeProposalFile({ id: 'prop_m', topic: 'memory-cleanup', target: 'dup-weak,dup-strong' });

    const result = await applyProposal(vaultDir, 'prop_m');
    expect(result.ok).toBe(true);
    expect(result.canonical).toBe('dup-strong');
    expect(result.merged).toEqual(['dup-weak']);

    const weak = matter(fs.readFileSync(path.join(vaultDir, 'facts', 'dup-weak.md'), 'utf8')).data;
    expect(weak.status).toBe('superseded');
    expect(weak.superseded_by).toBe('dup-strong');
    // Non-destructive: the strong node is untouched and nothing was deleted.
    expect(fs.existsSync(path.join(vaultDir, 'facts', 'dup-strong.md'))).toBe(true);
    expect(getProposal(vaultDir, 'prop_m').status).toBe('applied');
  });

  it('does not write anything on --dry-run', async () => {
    writeMemory({ slug: 'dup-a', evidence_count: 1 });
    writeMemory({ slug: 'dup-b', evidence_count: 2 });
    writeProposalFile({ id: 'prop_m', topic: 'memory-cleanup', target: 'dup-a,dup-b' });

    const result = await applyProposal(vaultDir, 'prop_m', { dryRun: true });
    expect(result.ok).toBe(true);
    expect(matter(fs.readFileSync(path.join(vaultDir, 'facts', 'dup-a.md'), 'utf8')).data.status).toBe('active');
    expect(getProposal(vaultDir, 'prop_m').status).toBe('accepted');
  });

  it('refuses to merge protected nodes', async () => {
    // Auto-merging an invariant is the one failure the user notices only much
    // later, when the agent quietly stops obeying a rule.
    writeMemory({ slug: 'inv-a', importance: 5 });
    writeMemory({ slug: 'inv-b', importance: 5 });
    writeProposalFile({ id: 'prop_p', topic: 'memory-cleanup', target: 'inv-a,inv-b' });

    const result = await applyProposal(vaultDir, 'prop_p');
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/protected/i);
    expect(matter(fs.readFileSync(path.join(vaultDir, 'facts', 'inv-a.md'), 'utf8')).data.status).toBe('active');
  });

  it('supersedes rather than applies when the targets no longer match', async () => {
    // The proposal was filed days ago; the nodes have since diverged. Applying
    // it now would merge two genuinely different facts.
    writeMemory({ slug: 'drift-a', predicate: 'use', object: 'api' });
    writeMemory({ slug: 'drift-b', predicate: 'use', object: 'grpc' });
    writeProposalFile({ id: 'prop_d', topic: 'memory-cleanup', target: 'drift-a,drift-b' });

    const result = await applyProposal(vaultDir, 'prop_d');
    expect(result.ok).toBe(false);
    expect(result.supersede).toBe(true);
    expect(getProposal(vaultDir, 'prop_d').status).toBe('superseded');
  });

  it('will not re-apply a terminal proposal', async () => {
    writeMemory({ slug: 'x-a', evidence_count: 1 });
    writeMemory({ slug: 'x-b', evidence_count: 2 });
    writeProposalFile({ id: 'prop_t', topic: 'memory-cleanup', target: 'x-a,x-b', status: 'applied' });
    const result = await applyProposal(vaultDir, 'prop_t');
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/already applied/);
  });
});

describe('undo', () => {
  it('restores the exact prior bytes of every superseded node', async () => {
    writeMemory({ slug: 'u-a', evidence_count: 1 });
    writeMemory({ slug: 'u-b', evidence_count: 5 });
    const before = fs.readFileSync(path.join(vaultDir, 'facts', 'u-a.md'), 'utf8');
    writeProposalFile({ id: 'prop_u', topic: 'memory-cleanup', target: 'u-a,u-b' });

    await applyProposal(vaultDir, 'prop_u');
    expect(fs.readFileSync(path.join(vaultDir, 'facts', 'u-a.md'), 'utf8')).not.toBe(before);

    const { reverted } = await revertProposal(vaultDir, 'prop_u');
    expect(reverted).toBe(1);
    expect(fs.readFileSync(path.join(vaultDir, 'facts', 'u-a.md'), 'utf8')).toBe(before);
    // Back to `draft`, NOT `accepted`: `accepted` is the daemon's work queue, so
    // reverting into it would let the next dream cycle re-apply what was just undone.
    expect(getProposal(vaultDir, 'prop_u').status).toBe('draft');
  });

  it('fails loudly when no snapshot exists rather than silently doing nothing', async () => {
    writeProposalFile({ id: 'prop_n', topic: 'memory-cleanup', target: 'a,b' });
    await expect(revertProposal(vaultDir, 'prop_n')).rejects.toThrow(/No undo snapshot/);
  });

  it('keeps undo snapshots out of the vault scan', async () => {
    writeMemory({ slug: 's-a', evidence_count: 1 });
    writeMemory({ slug: 's-b', evidence_count: 5 });
    writeProposalFile({ id: 'prop_s', topic: 'memory-cleanup', target: 's-a,s-b' });
    await applyProposal(vaultDir, 'prop_s');
    const { loadNodes } = await import('./vault.mjs');
    expect(loadNodes(vaultDir).some(n => n.slug === undefined)).toBe(false);
    expect(fs.existsSync(path.join(vaultDir, '.undo', 'prop_s.json'))).toBe(true);
  });
});

describe('audit trail', () => {
  it('records every apply and revert', async () => {
    writeMemory({ slug: 'au-a', evidence_count: 1 });
    writeMemory({ slug: 'au-b', evidence_count: 5 });
    writeProposalFile({ id: 'prop_au', topic: 'memory-cleanup', target: 'au-a,au-b' });

    await applyProposal(vaultDir, 'prop_au', { actor: 'test' });
    await revertProposal(vaultDir, 'prop_au');

    const lines = fs.readFileSync(path.join(vaultDir, '.events', 'proposals.jsonl'), 'utf8')
      .trim().split('\n').map(JSON.parse);
    expect(lines.map(l => l.action)).toEqual(['apply', 'revert']);
    expect(lines[0].actor).toBe('test');
  });
});

describe('daemon auto-apply', () => {
  it('applies only what the allowlist permits, and leaves drafts alone', async () => {
    writeMemory({ slug: 'd-a', evidence_count: 1 });
    writeMemory({ slug: 'd-b', evidence_count: 5 });
    writeProposalFile({ id: 'prop_ok', topic: 'memory-cleanup', target: 'd-a,d-b', status: 'accepted' });
    writeProposalFile({ id: 'prop_draft', topic: 'memory-cleanup', target: 'd-a,d-b', status: 'draft' });

    const res = await applyAcceptedProposals(vaultDir);
    // Tracks the allowlist rather than hardcoding a count, so this test stays
    // meaningful whether or not memory-cleanup is currently auto-applicable.
    expect(res.applied).toBe(AUTO_APPLICABLE_TOPICS.has('memory-cleanup') ? 1 : 0);
    expect(getProposal(vaultDir, 'prop_draft').status).toBe('draft');
  });

  it('is EMPTY for this release — the daemon does not write to memory unattended', () => {
    // Within minutes of first running against a real vault, auto-apply merged
    // nodes grouped by an over-broad key. The guards are fixed but unproven on
    // live data. Re-enabling is a one-line change; do it deliberately.
    expect([...AUTO_APPLICABLE_TOPICS]).toEqual([]);
  });

  it('never auto-applies a topic outside the allowlist', async () => {
    writeProposalFile({ id: 'prop_skill', topic: 'skill-improvement', target: 'SKILL.md', status: 'accepted' });
    const res = await applyAcceptedProposals(vaultDir);
    expect(res.applied).toBe(0);
    expect(AUTO_APPLICABLE_TOPICS.has('skill-improvement')).toBe(false);
    expect(getProposal(vaultDir, 'prop_skill').status).toBe('accepted');
  });
});

describe('evaluateProposalGate can actually reject', () => {
  it('rejects a merge whose targets do not share a signature', async () => {
    writeMemory({ slug: 'g-a', predicate: 'use', object: 'api' });
    writeMemory({ slug: 'g-b', predicate: 'use', object: 'grpc' });
    const p = createProposal('memory-cleanup', 'merge', 'g-a,g-b', 'identical predicate:object');
    // The old gate accepted this: it only checked that the rationale *string*
    // contained "identical predicate:object" — the optimizer grading its own prose.
    expect(await evaluateProposalGate(p, null, vaultDir)).toBe(false);
    expect(p.status).toBe('rejected');
  });

  it('accepts a genuine duplicate set', async () => {
    writeMemory({ slug: 'g-c', predicate: 'use', object: 'api' });
    writeMemory({ slug: 'g-d', predicate: 'use', object: 'api' });
    const p = createProposal('memory-cleanup', 'merge', 'g-c,g-d', 'identical predicate:object');
    expect(await evaluateProposalGate(p, null, vaultDir)).toBe(true);
    expect(p.status).toBe('accepted');
  });

  it('sends protected-node merges to human review instead of auto-accepting', async () => {
    writeMemory({ slug: 'g-e', importance: 5 });
    writeMemory({ slug: 'g-f', importance: 5 });
    const p = createProposal('memory-cleanup', 'merge', 'g-e,g-f', 'identical predicate:object');
    expect(await evaluateProposalGate(p, null, vaultDir)).toBe(false);
    expect(p.status).toBe('draft');
  });

  it('parks unknown topics as draft rather than discarding them as rejected', async () => {
    const p = createProposal('skill-improvement', 'improve', 'SKILL.md', 'stale');
    expect(await evaluateProposalGate(p, null, vaultDir)).toBe(false);
    expect(p.status).toBe('draft');
    expect(p.review_reason).toMatch(/human review/);
  });
});

describe('pruneResolvedProposals', () => {
  it('deletes terminal proposals but never open ones', () => {
    writeProposalFile({ id: 'prop_open', topic: 'memory-cleanup', target: 'a,b', status: 'accepted' });
    writeProposalFile({ id: 'prop_done', topic: 'memory-cleanup', target: 'a,b', status: 'applied' });
    const dir = path.join(vaultDir, 'proposals');
    // Age both past the retention window.
    const old = Date.now() - 10 * 24 * 60 * 60 * 1000;
    for (const f of fs.readdirSync(dir)) fs.utimesSync(path.join(dir, f), old / 1000, old / 1000);

    const removed = pruneResolvedProposals(dir, 3 * 24 * 60 * 60 * 1000);
    expect(removed).toBe(1);
    expect(fs.existsSync(path.join(dir, 'prop_open.md'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'prop_done.md'))).toBe(false);
  });

  it('leaves an unparseable proposal in place rather than deleting what it cannot read', () => {
    const dir = path.join(vaultDir, 'proposals');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'broken.md'), '---\nnot: [valid\n');
    const old = Date.now() - 10 * 24 * 60 * 60 * 1000;
    fs.utimesSync(path.join(dir, 'broken.md'), old / 1000, old / 1000);
    expect(pruneResolvedProposals(dir, 1000)).toBe(0);
    expect(fs.existsSync(path.join(dir, 'broken.md'))).toBe(true);
  });
});

describe('over-broad duplicate detection (found against the live vault)', () => {
  it('refuses a set larger than the auto-merge cap', async () => {
    // 15 research-project nodes all carry `tracked_research_project:knowledge_vault`.
    // The old predicate:object key grouped them as one duplicate set; applying it
    // would have superseded 14 distinct project records.
    const slugs = Array.from({ length: 8 }, (_, i) => `big-${i}`);
    slugs.forEach(slug => writeMemory({ slug, subject: 'system', predicate: 'tracks', object: 'project', title: 'same', description: 'same' }));
    writeProposalFile({ id: 'prop_big', topic: 'memory-cleanup', target: slugs.join(',') });

    const result = await applyProposal(vaultDir, 'prop_big');
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/exceeds the auto-merge cap/);
    // Not superseded — a human should still look at it.
    expect(getProposal(vaultDir, 'prop_big').status).toBe('accepted');
  });

  it('refuses nodes that share a signature but say different things', async () => {
    writeMemory({ slug: 'proj-a', subject: 'system', predicate: 'tracks', object: 'project', title: 'Research: quantum error correction surface codes' });
    writeMemory({ slug: 'proj-b', subject: 'system', predicate: 'tracks', object: 'project', title: 'Research: sourdough hydration ratios and crumb' });
    writeProposalFile({ id: 'prop_diff', topic: 'memory-cleanup', target: 'proj-a,proj-b' });

    const result = await applyProposal(vaultDir, 'prop_diff');
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/content differs/);
  });

  it('distinguishes nodes by subject, not just predicate:object', async () => {
    // Same predicate:object, different subject — different facts.
    writeMemory({ slug: 'subj-a', subject: 'alpha', predicate: 'uses', object: 'postgres', title: 'shared wording here' });
    writeMemory({ slug: 'subj-b', subject: 'beta', predicate: 'uses', object: 'postgres', title: 'shared wording here' });
    writeProposalFile({ id: 'prop_subj', topic: 'memory-cleanup', target: 'subj-a,subj-b' });

    const result = await applyProposal(vaultDir, 'prop_subj');
    expect(result.ok).toBe(false);
    expect(result.supersede).toBe(true);
  });

  it('still merges a genuine near-identical pair', async () => {
    writeMemory({ slug: 'real-a', subject: 'system', predicate: 'uses', object: 'redis', title: 'The cache layer uses Redis for sessions', evidence_count: 1 });
    writeMemory({ slug: 'real-b', subject: 'system', predicate: 'uses', object: 'redis', title: 'The cache layer uses Redis for sessions', evidence_count: 4 });
    writeProposalFile({ id: 'prop_real', topic: 'memory-cleanup', target: 'real-a,real-b' });

    const result = await applyProposal(vaultDir, 'prop_real');
    expect(result.ok).toBe(true);
    expect(result.canonical).toBe('real-b');
  });

  it('the gate is never laxer than the applier', async () => {
    // If the gate accepted what the applier refuses, the daemon would retry the
    // same impossible merge every cycle forever.
    const slugs = Array.from({ length: 8 }, (_, i) => `gate-big-${i}`);
    slugs.forEach(slug => writeMemory({ slug, subject: 'system', predicate: 'tracks', object: 'thing', title: 'same' }));
    const p = createProposal('memory-cleanup', 'merge', slugs.join(','), 'identical predicate:object');
    expect(await evaluateProposalGate(p, null, vaultDir)).toBe(false);
    expect(p.status).toBe('draft');
  });
});

describe('revert does not feed the daemon queue', () => {
  it('a reverted proposal is not picked up by the next auto-apply run', async () => {
    // The undo/redo loop: revert → accepted → daemon re-applies → revert …
    writeMemory({ slug: 'loop-a', title: 'the cache layer uses redis for sessions', evidence_count: 1 });
    writeMemory({ slug: 'loop-b', title: 'the cache layer uses redis for sessions', evidence_count: 5 });
    writeProposalFile({ id: 'prop_loop', topic: 'memory-cleanup', target: 'loop-a,loop-b' });

    expect((await applyProposal(vaultDir, 'prop_loop')).ok).toBe(true);
    await revertProposal(vaultDir, 'prop_loop');

    const res = await applyAcceptedProposals(vaultDir);
    expect(res.applied).toBe(0);
    expect(getProposal(vaultDir, 'prop_loop').status).toBe('draft');
    expect(matter(fs.readFileSync(path.join(vaultDir, 'facts', 'loop-a.md'), 'utf8')).data.status).toBe('active');
  });
});
