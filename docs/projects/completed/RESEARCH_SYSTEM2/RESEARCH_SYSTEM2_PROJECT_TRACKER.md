# RESEARCH_SYSTEM2 — Project Tracker

Legend: `[ ]` todo · `[/]` in progress · `[x]` done · (S/M/L) complexity

## Phase 0: Planning
- [x] Directive saved to memory (`decisions/research-system2-redesign-directive`)
- [x] Audit
- [x] PRD
- [x] Architecture
- [x] Development plan
- [x] Tracker

## Phase 1: Stop the runaway
- [x] `src/core/scheduler.mjs`
  - drop the expansion and monitoring phases (S)
  - make the cooldown reset never touch `done` (S)
  - cap `failed` retries at 3 via `attempts` (S)
- [x] `src/core/daemon-loop.mjs`: improvement → done/failed (S)
- [x] `src/core/task-executors.mjs`
  - remove the monitoring and expansion executors (S)
  - make a proactive task with no target a no-op (S)
- [x] `src/core/fact-seeker.mjs`
  - delete the expansion and monitoring engines (M)
  - delete the follow-up spawn and self-diagnosis fallback (S)
  - require `forceTopic` (S)
- [x] `src/core/research.mjs`: remove the phase-5 agenda re-add (S)
- [x] `src/core/dream.mjs`, `src/core/optimizer.mjs`: remove the staleness sweep (S)
- [x] Update the affected specs (M)

## Phase 2: Provenance + gate
- [x] `src/core/research-queue.mjs`: origin, requested_via, project, rationale, session_id, attempts; user-first ordering (S)
- [x] `src/core/research-gate.mjs` (M) + `research-gate.spec.mjs` (M)
- [x] `src/server/routes/research.mjs`: record `via` (S)
- [x] `src/server/routes/share.mjs`: record `via` (S)
- [x] `src/cli/research.mjs`: record `via` (S)
- [x] `src/cli/share.mjs`: record `via` (S)
- [x] `src/core/secret-integration-research.mjs`: route through the gate (S)

## Phase 3: Project-scoped autonomous research
- [x] `src/core/session-watcher.mjs`: keep `cwd` (S)
- [x] `src/core/post-mortem.mjs`: derive the project and session id (S)
- [x] `src/core/fact-seeker.mjs`: gap-inference prompt + gate (M)
- [x] Spec (M)

## Phase 4: Surfacing + chat tool
- [x] `src/core/research-surface.mjs` (M) + spec (M)
- [x] `src/core/surface.mjs`: add the Background Research section (S)
- [x] `src/server/api.mjs`: research grounding (M)
- [x] `src/server/tools.mjs`: `queue_research` (S)
- [x] Specs (M)
- [x] `src/core/fact-seeker.mjs`: correct the fast-path log (S)

## Phase 5: Visibility, migration, verification
- [x] `extension/sidepanel/sidepanel.js` + `.css`: origin/project on research rows (S)
- [x] `scripts/migrate-research-system2.mjs` (M), then dry run → apply (live, 2026-09-22 23:04 + 23:05 legacy retag)
- [x] Full suite green on the Mac mini: 334 files / 1,895 tests (twice; the second run covers the final code)
- [x] S1–S8 checked (S7 live: 0 items in removed phases, 0 pending self-spawned tasks)

## Found during implementation (added to scope, done)
- [x] **Synthesis prompt was read as a prompt injection.** `research.mjs` `synthesizeLocally` wrapped its request in fake `<system_instructions>` with a persona and a mandatory scratchpad, and `callLocalRuntime` hands that to CLI agents inside the user turn. 88 of 93 live reports were the agent refusing or questioning the prompt. Fix: a plain task prompt that includes source URLs and asks for `## Key findings` / `## Caveats`. Unusable syntheses are now discarded instead of saved (`isUsableSynthesis`).
- [x] **Deliberation queued its own `autonomous_tasks`** (a fifth spawner, `created_by: fact-seeker-deliberation`). Removed from the prompt and the code.
- [x] **The failure path parked finished reports.** A refinement phase (deliberation or improvement) that fails now keeps the existing report and marks the item done, instead of retrying forever.
- [x] Dashboard `ResearchAgendaTab`: 5-phase stepper → 3 phases; provenance label + spec
- [x] CLI phase labels (1/5…5/5 → 1/3…3/3)
- [x] Research skill doc (`.agent/skills/research/SKILL.md`) rewritten for the System 2 model
- [x] Removed dead `generateProactiveResearchTask` / `generateStalenessCheckTask` from `scheduler.mjs`

## Evidence
- 21 touched spec files, 190 tests passed on the Mac mini (2026-09-22 16:58).
- Migration dry run on the live brain: 87 parked items → done, 56 self-spawned tasks → cancelled, 106 self-added agenda topics → cancelled.
- Quality gate on the live vault: 5 of 93 research reports hold a usable synthesis.
- Live brain server + daemon restarted onto the final code (single daemon, PID-lock verified).
- Live chat grounding: the 10DLC question → the 10DLC report (0.61); the Call Control question → the Call Control report (0.47); a React test question → none.
- Queue after migration: 88 done · 4 in progress · 1 pending · 2 failed; all 95 pre-gate items `origin: legacy`.

## Follow-ups (not done here)
- Rebuild `frontend/dist` (gitignored; heavy build, not run on the laptop). The dashboard's 3-phase stepper and provenance label ship with the next build.
- 88 of 93 existing reports hold no usable synthesis. They're kept (their cited sources are still searchable) but never surfaced. Re-running research on the topics that matter uses the fixed prompt.

## Verification Log

- 2026-09-25: Isolated Mac Mini source snapshot — `npm test` passed 336 files / 1,908 tests, including the System 2 specs. Local fast code-quality gate passed all five checks.
