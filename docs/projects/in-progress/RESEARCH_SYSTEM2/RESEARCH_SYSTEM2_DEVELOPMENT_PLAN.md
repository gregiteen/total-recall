# RESEARCH_SYSTEM2 — Development Plan

## Phase 1: Stop the runaway (R1)

- [ ] Remove expansion and monitoring:
  - scheduling (`scheduler.mjs`)
  - transitions (`daemon-loop.mjs`)
  - executors (`task-executors.mjs`)
  - engines (`fact-seeker.mjs`)
- [ ] Remove the follow-up spawn, self-diagnosis fallback and agenda pull (`fact-seeker.mjs`), and the deep-research re-add (`research.mjs`)
- [ ] Remove the staleness sweep (`dream.mjs`, `optimizer.mjs`)
- [ ] Scheduler cooldown: never reset `done`; cap `failed` retries at 3
- [ ] Update the specs that asserted the removed behaviour

**Done when:**
- `grep -rn "runResearchExpansionCycle\|research-expansion-\|follow-up:\|refreshStaleKnowledge" src` finds only removal comments and specs asserting absence.
- The touched specs pass.

## Phase 2: Provenance + gate (R2.1, R2.3, R3.3–R3.6)

- [ ] `research-queue.mjs`: new fields, defaults, user-first ordering
- [ ] `research-gate.mjs` + spec
- [ ] Wire the entry points: REST, share, CLI, secrets

**Done when:** the `research-gate.spec.mjs` and `research-queue.spec.mjs` specs pass.

## Phase 3: Project-scoped autonomous research (R3.1, R3.2)

- [ ] `session-watcher.mjs` keeps `cwd`
- [ ] `post-mortem.mjs` derives the project
- [ ] `fact-seeker.mjs` gap-inference prompt → gate

**Done when:** a post-mortem spec with a project session queues ≤ 2 items with `origin: 'autonomous'` and a `project` value.

## Phase 4: Surfacing (R4) and the chat tool (R2.2)

- [ ] `research-surface.mjs` + spec, wired into `buildRulesBlock`
- [ ] Chat research grounding in `api.mjs`
- [ ] `queue_research` tool in `tools.mjs`
- [ ] Fix the false "now live" log claim

**Done when:** the surface, api and tools specs pass.

## Phase 5: Visibility (R5) + migration (R1.5) + verification

- [ ] Extension research rows show origin and project
- [ ] Migration script: dry run, then `--apply` on the live brain
- [ ] Full suite on the Mac mini
- [ ] Live checks for S7
