import path from 'node:path';
import { resolveBrainDir, parseLayerFlag } from './agent-dir.mjs';
import {
  listProposals,
  getProposal,
  applyProposal,
  setProposalStatus,
  revertProposal,
  hasHandler,
  AUTO_APPLICABLE_TOPICS,
} from '../core/proposal-applier.mjs';
import { findStaleNodes } from '../core/optimizer.mjs';

function printHelp() {
  console.log(`
  total-recall proposals — Review and apply optimizer proposals

  Usage: total-recall proposals <subcommand> [options]

  Subcommands:
    list                   Show open proposals (default)
    show <id>              Full detail for one proposal
    apply <id>             Perform the proposed work
    reject <id> [reason]   Refuse a proposal permanently
    revert <id>            Undo an applied proposal from its snapshot
    supersede --topic <t>  Bulk-close every open proposal of a retired topic
    stale                  Nodes due for re-verification (read-only query)

  Options:
    --status <s>   Filter: draft | accepted | applied | rejected | superseded | all
    --topic <t>    Filter by proposal topic
    --dry-run      With apply: show the change without writing
    --global       Use the global brain
    --project      Use the project brain
    --help, -h     Show this help

${AUTO_APPLICABLE_TOPICS.size > 0
    ? `  Applied automatically during the dream cycle: ${[...AUTO_APPLICABLE_TOPICS].join(', ')}.
  Everything else waits here for review.`
    : `  Nothing is applied automatically in this release — every proposal waits for
  you to run \`apply\`. Applying is non-destructive (duplicates are superseded,
  never deleted) and \`revert\` restores the exact prior bytes.`}

  Examples:
    npx total-recall proposals
    npx total-recall proposals show prop_a1b2c3d4e5f6
    npx total-recall proposals apply prop_a1b2c3d4e5f6 --dry-run
    npx total-recall proposals reject prop_a1b2c3d4e5f6 "targets are not duplicates"
    npx total-recall proposals revert prop_a1b2c3d4e5f6
`);
}

const STATUS_ICON = {
  draft: '○',
  accepted: '◆',
  applied: '✓',
  rejected: '✗',
  superseded: '~',
};

function flagValue(args, name) {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : null;
}

export default async function proposals(args) {
  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    return;
  }

  const { layer, remainingArgs } = parseLayerFlag(args);
  const brainDir = resolveBrainDir(layer);
  const vaultDir = path.join(brainDir, 'memory-vault');

  const sub = remainingArgs[0] && !remainingArgs[0].startsWith('--') ? remainingArgs[0] : 'list';
  const id = remainingArgs[1] && !remainingArgs[1].startsWith('--') ? remainingArgs[1] : null;

  switch (sub) {
    case 'list': {
      const statusFlag = flagValue(remainingArgs, '--status');
      // Default view is the actionable queue. Terminal proposals are history, not
      // work — `--status all` shows them when you actually want them.
      const status = statusFlag === 'all' ? undefined : (statusFlag || ['draft', 'accepted']);
      const items = listProposals(vaultDir, {
        status,
        topic: flagValue(remainingArgs, '--topic') || undefined,
      });

      if (items.length === 0) {
        console.log('\n  No proposals match.\n');
        return;
      }

      console.log(`\n  ${items.length} proposal(s)\n`);
      for (const p of items) {
        const auto = AUTO_APPLICABLE_TOPICS.has(p.topic) && hasHandler(p.topic) ? ' [auto]' : '';
        console.log(`  ${STATUS_ICON[p.status] || '?'} ${p.proposal_id}  ${p.topic}${auto}`);
        console.log(`     ${p.summary || p.title}`);
        if (p.review_reason) console.log(`     ↳ ${p.review_reason}`);
        if (p.rejection_reason) console.log(`     ↳ ${p.rejection_reason}`);
      }
      console.log('\n  Apply one:  npx total-recall proposals apply <id>\n');
      return;
    }

    case 'show': {
      if (!id) { console.error('  ❌ Usage: proposals show <id>'); process.exitCode = 1; return; }
      const p = getProposal(vaultDir, id);
      if (!p) { console.error(`  ❌ Proposal not found: ${id}`); process.exitCode = 1; return; }
      console.log(`\n  ${p.proposal_id}  [${p.status}]  ${p.topic}\n`);
      console.log(`  Summary:   ${p.summary || p.title}`);
      console.log(`  Target:    ${p.target_path || '(none)'}`);
      console.log(`  Proposed:  ${p.proposed_at} by ${p.proposed_by}`);
      if (p.reviewed_at) console.log(`  Reviewed:  ${p.reviewed_at} by ${p.reviewed_by}`);
      if (p.applied_at) console.log(`  Applied:   ${p.applied_at} by ${p.applied_by}`);
      if (p.review_reason) console.log(`  Note:      ${p.review_reason}`);
      if (p.rejection_reason) console.log(`  Rejected:  ${p.rejection_reason}`);
      console.log(`\n  ${p.rationale || p.description || ''}\n`);
      return;
    }

    case 'apply': {
      if (!id) { console.error('  ❌ Usage: proposals apply <id>'); process.exitCode = 1; return; }
      const dryRun = remainingArgs.includes('--dry-run');
      const result = await applyProposal(vaultDir, id, { dryRun, actor: 'cli' });
      if (!result.ok) {
        console.error(`  ❌ Not applied: ${result.reason}`);
        process.exitCode = 1;
        return;
      }
      if (dryRun) {
        console.log(`\n  Dry run — would keep ${result.canonical}, supersede ${result.merged.join(', ')}\n`);
        return;
      }
      console.log(`\n  ✓ Applied ${id}`);
      console.log(`    Kept:     ${result.canonical}`);
      console.log(`    Merged:   ${result.merged.join(', ')}`);
      console.log(`\n  Undo:  npx total-recall proposals revert ${id}\n`);
      return;
    }

    case 'reject': {
      if (!id) { console.error('  ❌ Usage: proposals reject <id> [reason]'); process.exitCode = 1; return; }
      const reason = remainingArgs.slice(2).filter(a => !a.startsWith('--')).join(' ') || 'Rejected by user.';
      await setProposalStatus(vaultDir, id, 'rejected', { rejection_reason: reason, reviewed_by: 'user' });
      console.log(`\n  ✗ Rejected ${id}: ${reason}\n`);
      return;
    }

    case 'supersede': {
      // Bulk-resolve a whole topic. Needed when a generator is retired: its
      // already-filed tickets are neither wrong nor refused, they just describe
      // work that now flows somewhere else. Without this they sit in `list`
      // forever, and the terminal-only pruner correctly refuses to touch them.
      const topic = flagValue(remainingArgs, '--topic');
      if (!topic) {
        console.error('  ❌ Usage: proposals supersede --topic <topic> [--reason "..."]');
        process.exitCode = 1;
        return;
      }
      const reason = flagValue(remainingArgs, '--reason') || `Topic "${topic}" is no longer generated.`;
      const open = listProposals(vaultDir, { status: ['draft', 'accepted'], topic });
      if (open.length === 0) {
        console.log(`\n  No open proposals under topic "${topic}".\n`);
        return;
      }
      if (!remainingArgs.includes('--yes')) {
        console.log(`\n  Would supersede ${open.length} open "${topic}" proposal(s).`);
        console.log(`  Reason: ${reason}`);
        console.log('\n  Re-run with --yes to apply.\n');
        return;
      }
      for (const p of open) {
        await setProposalStatus(vaultDir, p.proposal_id, 'superseded', { superseded_reason: reason });
      }
      console.log(`\n  ~ Superseded ${open.length} "${topic}" proposal(s).\n`);
      return;
    }

    case 'revert': {
      if (!id) { console.error('  ❌ Usage: proposals revert <id>'); process.exitCode = 1; return; }
      try {
        const { reverted, deleted } = await revertProposal(vaultDir, id);
        console.log(`\n  ✓ Reverted ${id} — ${reverted} file(s) restored, ${deleted} removed.\n`);
      } catch (err) {
        console.error(`  ❌ ${err.message}`);
        process.exitCode = 1;
      }
      return;
    }

    case 'stale': {
      // Answers the question the old stale-knowledge-refresh generator used to
      // answer by writing one file per node, every cycle, forever.
      const stale = findStaleNodes(vaultDir);
      if (stale.length === 0) {
        console.log('\n  No stale high-importance nodes.\n');
        return;
      }
      console.log(`\n  ${stale.length} node(s) due for re-verification\n`);
      for (const n of stale.slice(0, 40)) {
        const days = Math.floor((Date.now() - new Date(n.last_accessed).getTime()) / 86400000);
        console.log(`  ${String(days).padStart(4)}d  [i${n.importance}]  ${n.slug}`);
      }
      if (stale.length > 40) console.log(`\n  … and ${stale.length - 40} more.`);
      console.log('\n  The dream cycle queues these for research automatically.\n');
      return;
    }

    default:
      console.error(`  ❌ Unknown subcommand: ${sub}`);
      printHelp();
      process.exitCode = 1;
  }
}
