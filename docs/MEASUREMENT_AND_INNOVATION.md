# Measurement and innovation pipeline

> **Status**: Living document. Last reviewed 2026-10-24.
> **Owner**: the active project in [`docs/projects/`](projects/README.md).
> **Not a project.** This file carries no acceptance criteria and no checklist. It records what is measured, what the measurements have already shown, and how a measured signal becomes a candidate. Work is scheduled by the active project, never here.

## 1. Why this exists

Two failures motivated it, both real:

1. **Decisions were argued from anecdotes.** `TOTAL_RECALL_LAUNCH_PLAN` inherited the claim *"the instruction capsule is unusable at its default budget — 12 of 13 capsules overflow."* That was true when recorded. Nobody could later say whether a change helped, or whether the gate still failed — because nothing measured it. Re-deriving the answer by hand took a full investigation, and the answer had changed.

2. **A design decision had no input.** The capsule budget (D2) was framed as "curate the 83 directives or raise the default." Neither side could be argued from data, because the data did not exist.

The rule this file enforces:

> **No metric gates a decision unless someone has read it, and no design decision is made without a measurement that could have contradicted it.**

## 2. What is measured today

### Capsule telemetry — `total-recall context-stats`

Every `total-recall context` call records one line. Read it with:

```sh
total-recall context-stats          # human-readable
total-recall context-stats --json   # machine-readable
```

What it answers:

| Question | Field |
| --- | --- |
| Which actions overflow, and how often? | `overflow_rate` per action |
| How close is the required set to the budget? | `required_avg` / `required_max` |
| Which rules are force-included every call? | `most_required` |
| Is the optional pool doing anything? | `excluded_total` |

**Measured 2026-10-24** (Mac mini, source `aee2ad0`+):

| Action | Samples | Overflow | Required (avg/max) | Excluded |
| --- | --- | --- | --- | --- |
| edit | 1 | 0% | 11,385 | 0 |
| test | 1 | 0% | 10,884 | 0 |
| publish | 1 | 0% | 10,327 | 0 |
| secrets | 1 | 0% | 10,206 | 0 |
| read | 1 | 0% | 10,099 | 0 |

Two findings already, neither of which was knowable before:

- **The gate passes.** The documented `ready:true` contract is satisfiable at the configured 16,000 budget, with ~5,900 tokens of headroom on the heaviest action. TR-003's evidence was stale.
- **`excluded` is 0 on every action.** Nothing is optional, so the budget is the *only* lever — `assembleContext` packs optional items opportunistically and sets `ready = required <= total`. Curation is what creates the optional pool it drops from.

### Other existing surfaces

| Surface | Measures | Home |
| --- | --- | --- |
| `rules audit` | Per-rule tokens, curation state, excluded rules | core |
| `.events/*.jsonl` | SSSS mutations with principal + capabilities | core |
| `usage-tracker.mjs` | Provider token cost accounting | core |
| `friction` | Log-based workflow bottlenecks | core |
| `plugin-state-store` ledgers | Per-plugin append-only records | plugin host |
| `code-quality` reports | Gate findings per repo | plugin |

## 3. What is NOT measured yet

Named so the gap is visible rather than assumed:

- **Whether a rule was ever acted on.** A rule can load on every call and never change an outcome. Nothing records that.
- **Capsule usefulness.** Tokens are measured; whether the right rules were included is not.
- **Time-to-first-correct-action** per task type.
- **Rule churn** — which rules are edited, superseded or ignored.
- **Plugin invocation counts** — installed is not used.
- **Which measurement anyone actually reads.** The most important one, given the rule in §1.

## 4. Guardrails

Non-negotiable, each learned from a real incident:

- **Bounded by construction.** An append-only log here reached **306 MB** and GitHub silently rejected every backup for five weeks. Capsule telemetry carries its own size cap and retention, enforced on write. Never let an unbounded stream into a brain.
- **Counts and identifiers only.** Never rule text, capsule content, query text or credentials. Queries are recorded as a length.
- **Local and tenant-private by default.** Telemetry must not become a fleet data leak.
- **Measurement never breaks a session.** Every path returns rather than throws.
- **Off switch.** `TR_CONTEXT_TELEMETRY=off`.
- **No dashboard without a reader.** A metric nobody consults is how drift starts.

## 5. The pipeline

A signal becomes a candidate only with evidence attached. Triage the candidate into a workstream of the active project — **never a new project folder** (see the custody rule in [`docs/projects/README.md`](projects/README.md)).

| Measured signal | Candidate it produces | Route to |
| --- | --- | --- |
| One action over budget, others fine | Action-scope or split the rules it loads | LR-3 |
| A rule on every call, never consulted | Demote to optional, or retire | LR-3 |
| `excluded_total` stays 0 | Nothing is droppable — curation is the blocker | LR-3 |
| A command run then immediately corrected | Missing capability | Rule #2: add to the owning CLI |
| A plugin installed but never invoked | Plugin not earning its place | LR-5 |
| The same manual sequence twice | Composable command | `composable-cli` |
| A failure reported with no owner | Ownership gap | §6 |

### Candidate template

```
Signal:    <metric> = <value>, measured <date> from <source>
Evidence:  <command that produced it>
Candidate: <the change it suggests>
Cost:      <tokens / effort / risk>
Route:     <workstream or "retire">
```

## 6. Review cadence

**Weekly**, and the review is the deliverable:

1. Read `context-stats` and note what moved.
2. Triage new candidates into the table in §5.
3. Retire anything whose signal stopped appearing — a candidate without evidence is deleted, not parked.
4. Record what changed in the active project's Action Log.

An unreviewed metric is deleted from §2 rather than kept as decoration.

## 7. Current candidates

Live, each with its evidence:

| Signal | Evidence | Candidate | Route |
| --- | --- | --- | --- |
| `excluded_total = 0` across all actions | `context-stats`, 2026-10-24 | Nothing is droppable. Curate more rules so the optional pool exists, rather than only raising the budget | LR-3 |
| `project:secrets-rekey-runbook` = 421 tokens, required on every `read` | `context --debug` | Action-scope to `secrets`; it is an incident runbook, not a universal directive | LR-3 |
| 16 anti-patterns required on every call | `rules audit` category counts | Incident write-ups warn; they should not gate. Move to the optional pool | LR-3 |
| TR-003's overflow claim was stale | `context-stats` shows 0% overflow | Reconcile the archived claim so the next agent does not re-investigate it | LR-3 |

## 8. Open design question

Should a rule record **whether it was ever acted on**? Today a rule's cost is measured and its value is not, which is why every rule looks equally worth keeping. That is the measurement most likely to change the curation policy — and it is the most invasive to add.
