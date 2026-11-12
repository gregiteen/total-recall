# Memory decay

Total Recall keeps memory useful by setting aside memories that nobody uses. This is decay.

## What counts as use

A memory is used when:

- `total-recall recall` returns it, or
- a context capsule (`total-recall context` or `tr-preflight --ack`) includes it.

Each use is written to the access ledger, `memory-derived/access-ledger.json`, in the brain that owns the memory. The ledger stores the last use and a count for each memory, and the days on which the brain was used at all: its active days. A read never changes a vault file.

A global rule that a project capsule uses is recorded in the global brain's ledger.

## What decay does

The dream cycle runs decay on each brain:

1. It finds active memories with no use for 60 active days of their brain. Decay counts active days, not calendar days: a repo nobody works in has no active days, so nothing in it decays. The last use is the latest of the ledger, the memory's own `last_accessed`, and its last update.
2. It asks the local reasoning runtime, at most 5 memories per cycle, whether each one is still worth keeping.
3. For each memory the runtime does not keep, it writes a `smart-decay` proposal.
4. The gate checks each proposal against the live vault. The memory must still exist, be active, be unprotected, and have no use since it was judged.
5. For a proposal that passes, the applier saves an undo snapshot, then sets the memory's status to `deprecated`. A deprecated memory stays in the vault. It is no longer active.

## What decay never touches

- Rules: invariants, preferences and anti-patterns.
- Memories with `priority: absolute`.
- Memories with importance 5.

To keep a memory out of decay, give it importance 5.

## See and undo decay

```bash
total-recall proposals list
total-recall proposals show <proposal-id>
total-recall proposals revert <proposal-id>
```

`revert` restores the memory from its undo snapshot.

## Where it runs

Core provides the operations: the ledger, decay, the gate and the applier. The automations plugin schedules `total-recall dream --all-brains` per node. The cloud daemon runs scheduled tasks on every node through mesh. Each node dreams its global brain and its registered project brains, one at a time. Each brain uses its own vault and derived directory.

Preview the brains and their decay candidates without changes:

```bash
total-recall dream --all-brains --dry-run --json
```

`--json` prints an array of per-brain results. A failed brain does not stop the remaining brains. The command exits 1 after all brains run if any brain failed. Unknown options exit 2. An empty daemon queue does not create dream tasks.
