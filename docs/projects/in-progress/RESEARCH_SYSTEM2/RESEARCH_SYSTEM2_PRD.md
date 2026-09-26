# RESEARCH_SYSTEM2 — PRD

## Problem

Background research is a self-feeding tree of unrequested topics (audit §2, G1–G7). It spends search and LLM budget on the laptop and never informs the AI, because finished research never reaches the instructions or the chat context (audit §3).

## Vision: research as System 2

Research is the brain's slow, deliberate thinking, running in the background:
- **It happens for a reason.** Either a human asked, or the AI noticed while working on a project that it lacks knowledge that would change how well it does that project.
- **It stops when the question is answered.** It never breeds more research.
- **Its conclusions are brought to the fast path (System 1).** They go into the compiled instructions for the project the research belongs to, and into chat when the conversation touches them.

## Requirements

### R1: Remove expansion and every self-spawning generator
- **R1.1** Delete the expansion phase: scheduling, phase transitions, the executor, `runResearchExpansionCycle`, and its prompt. The pipeline ends after improvement.
- **R1.2** Delete agenda follow-up spawning (G2), self-diagnosis topic invention (G3), the deep-research agenda re-add (G4) and the dream staleness sweep (G5).
- **R1.3** Stop the hourly re-monitor of `done` items (G6). `failed` items retry at most 3 times, then stay failed.
- **R1.4** A research task without an explicit topic does nothing. Nothing pulls "the next agenda topic" autonomously (G7).
- **R1.5** Migrate existing state:
  - items parked in expansion become `done` (they have a node) or `failed` (no node)
  - pending orphan `proactive-research-*` scheduler tasks created by expansion are cancelled
  - pending agenda follow-up and re-add entries are cancelled

  All changes are logged, and a backup is taken first.

### R2: Human-requested research, any time
- **R2.1** Every entry point records provenance: `origin: 'user'` and `requested_via: chat | extension | dashboard | cli | api | share`.
- **R2.2** A chat tool `queue_research(topic, notes?)` lets the AI queue background research when the user asks during conversation. The tool description limits it to explicit user requests. `search_web` stays the tool for immediate answers.
- **R2.3** User requests skip every autonomous budget and run ahead of autonomous items.

### R3: Autonomous, project-scoped background research
- **R3.1** The only autonomous trigger is post-session analysis of work **on a project**. The session's project is derived from the transcript (the `cwd` for Claude Code/Codex, or the `~/.claude/projects/<encoded-path>` folder).
- **R3.2** The inference prompt asks only for **knowledge gaps that would improve the AI's performance on that project**. Examples: APIs, libraries or services the project uses that post-date the model's training cutoff; errors the agent couldn't resolve; places the agent guessed. General curiosity doesn't count.
- **R3.3** Candidates already covered by existing research are skipped. Coverage means a semantic match with similarity ≥ 0.72 against research-layer nodes, or an open queue item with the same normalized topic.
- **R3.4** Budgets:
  - at most 3 autonomous items pending per project
  - at most 6 new autonomous items per day across all projects
  - at most 2 per session

  Budgets are configurable under `research.autonomous` in runtime config and can be disabled entirely.
- **R3.5** Autonomous items record `origin: 'autonomous'`, `project`, `rationale` and `session_id`.
- **R3.6** Secret-integration research (G9) is recorded as `origin: 'autonomous'` and counts against the daily budget.

### R4: Surface research (the System 2 → System 1 bridge)
- **R4.1** The compiled instruction surface gets a **"Background Research (System 2)"** section:
  - finished research for the current project, plus recent user-requested research
  - each entry is title, 2–4 key findings and the date, with the slug so the agent can `recall` the full report
  - limited to 6 briefs and about 2,500 characters
- **R4.2** Chat completions auto-ground on research. The latest user message is matched semantically against research-layer nodes, and the top 3 with similarity ≥ 0.55 are added to the system prompt as a clearly labelled "Background research" block, trimmed to about 1,500 characters each. This uses no extra LLM calls, only one embedding.
- **R4.3** Remove the false "now live in INSTRUCTIONS.md" log claim, or make it true (it becomes true once R4.1 ships).

### R5: Visibility
- **R5.1** `GET /api/research` returns `origin`, `project`, `requested_via` and `rationale`.
- **R5.2** The extension research list shows whether the user asked for an item or the AI queued it autonomously, and for which project.

## Out of scope
- Migrating the research queue and agenda from JSON files to SSSS VFS documents. That's a known VFS-first violation and needs its own project.
- A dashboard redesign of the Research page, beyond showing the new fields if the page already lists items.
- Changing the deep-research acquisition engine itself (sources, synthesis).

## Success criteria

| # | Criterion | Verified by |
|---|---|---|
| S1 | No code path calls `addToQueue`, `addToAgenda` or `persistTaskToDisk` for research except user entry points and the R3 gap inferrer | grep + spec |
| S2 | A research item that finishes improvement ends `done` and is never re-queued | scheduler/daemon specs |
| S3 | Autonomous inference respects all three budgets and skips covered topics | spec |
| S4 | The compiled surface contains a research brief for a done project-scoped item, and not for another project's | surface spec |
| S5 | Chat system prompt includes a relevant research excerpt, and none for an unrelated query | api spec |
| S6 | `queue_research` tool queues with `origin: 'user'`, `requested_via: 'chat'` | tools spec |
| S7 | Live queue after migration: 0 items in `expansion`, no pending orphan proactive tasks | live check |
| S8 | Full vitest suite green (Mac mini) | test skill |

## Priority (TR framework)
1. Data safety and cost: stop the runaway (R1).
2. Core daemon loop correctness: phase pipeline, retries (R1.3, R1.4).
3. LLM routing: surfacing (R4) and chat tool (R2.2).
4. Autonomous project research (R3).
5. UI visibility (R5).
