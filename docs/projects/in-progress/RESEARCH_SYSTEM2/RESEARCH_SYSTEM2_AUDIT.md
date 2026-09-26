# RESEARCH_SYSTEM2 — Audit

> **Project Prefix**: `RESEARCH_SYSTEM2`
> **Kanban State**: In progress
> **Date**: 2026-09-22
> **Trigger**: User directive (memory `decisions/research-system2-redesign-directive`) —
> *"get rid of expansion - focus on making research something the ai automatically does while working on a project - in the background where additional info would improve performance - surfacing research to the instructions so ai can use it during conversation - kind of like a system 2 thinking - and also when human asks for research during conversation or while surfing web or any time but at humans request"*

Evidence gathered from source and from the live brain (`~/.agent/skills/total-recall`, v3.28.1) on 2026-09-22.

## 1. Live state

| Store | File | Contents |
|---|---|---|
| Research queue | `research-queue.mjs` (`loadQueue`) | 95 items: 89 pending, 3 in progress, 3 failed, **0 done** |
| Research agenda | `research-agenda.jsonl` | 349 topics. 231 cancelled, of which 204 are auto "follow-up:" topics. 115 pending, of which 91 are `deep-research-task` re-adds and 15 are follow-ups |
| Scheduler queue | `scheduler/queue/` | 78 task files. **75 are `proactive-research-*`, 55 of them pending** |

- **Queue phases:** 86 of the 89 "pending" items are parked in the final `expansion` phase. Their research already finished.
- **Queue age:** 80 of the 95 items were created 2026-09-20 → 22.
- **Daemon log** (`logs/daemon.log`):
  - 45 "Scheduled expansion task" lines (30 on 09-21, 15 on 09-22)
  - 21 expansion runs, 6 of which failed with `No JSON in expansion response`
  - 148 `proactive-research` task runs

## 2. Research that no human asked for

| # | Generator | Where | Behaviour |
|---|---|---|---|
| G1 | **Expansion phase** (phase 5/5) | `fact-seeker.mjs:1613` `runResearchExpansionCycle`; scheduled at `scheduler.mjs:586-590`; transitions at `daemon-loop.mjs:667-680`; executor at `task-executors.mjs:524-541` | Asks the LLM for "adjacent topics", then calls `addToQueue` for up to 3 of them **and** persists a `proactive-research-*` scheduler task for each. Spawned items reach expansion themselves, so the growth is unbounded and geometric |
| G2 | **Follow-up gaps** | `fact-seeker.mjs:998-1022` (`runKnowledgeAcquisitionCycle`) | Adds up to 5 `further_research_needed` gaps per topic to the agenda. Before the cap was added, one topic generated 116 follow-ups |
| G3 | **Self-diagnosis on empty agenda** | `fact-seeker.mjs:944-951` | When the agenda is empty, `runSelfDiagnosis` invents topics so the cycle always has work |
| G4 | **Deep-research re-add** | `research.mjs:105-112` (`handleProactiveResearch` phase 5) | Every finished deep-research run adds its own topic back to the agenda at priority 75. This is the source of the 91 `deep-research-task` entries |
| G5 | **Staleness sweep** | `dream.mjs:566-575` → `optimizer.mjs:326` `refreshStaleKnowledge` | Every dream cycle queues "Verify still-current: <title>" for 3 old high-importance nodes, whatever project is active |
| G6 | **Hourly re-monitor** | `scheduler.mjs:505-555` | Every `done` item with a node is reset to `pending/monitoring` after a 1-hour cooldown, so each finished report re-runs forever. Every `failed` item resets to acquisition with no retry cap |
| G7 | **Orphan proactive tasks** | `fact-seeker.mjs:1669-1686` (from G1) + `task-executors.mjs:368-440` | A task with no `target` runs `runKnowledgeAcquisitionCycle` with no `forceTopic`, which calls `getNextAgendaTopic()` and researches whatever the agenda holds (fed by G2 and G4) |
| G8 | Session topic inference | `post-mortem.mjs:201-214` → `fact-seeker.mjs:1036` `ingestSessionTopics` | Up to 5 topics per session go to the agenda. There's **no project attribution**: `session-watcher.mjs` drops the transcript's `cwd`. There's also no knowledge-gap check against existing research, and no budget |
| G9 | Secret integration research | `secrets-store.mjs:797-815` → `secret-integration-research.mjs:282` | Queues product API research the first time a key is set. Runs once per key, but isn't counted against any budget |

G8 is the closest thing to what the user wants ("AI researches while working on a project"), but it has no project scope, no budget, and no way to use the result.

## 3. Research never reaches the AI

- **The instruction surface doesn't include research.** `surface.mjs:310-500` (`buildRulesBlock`) emits only invariants, preferences and anti-patterns. Its own comment (`:322-324`) says facts are "search-only". Research reports are `category: facts`, `x_memory_layer: research`, so they're never included.
- **The "surfaced" log line is false.** `fact-seeker.mjs:761-768` (`writeAndSurfaceImmediately`) logs "now live in INSTRUCTIONS.md" after recompiling the surface. Nothing is added.
- **Chat retrieves nothing on its own.** `/v1/chat/completions` (`server/api.mjs:355+`) includes only nodes the caller passes in `groundingNodes`. The query-aware `compileContext` (`context-compiler.mjs:244`) is used only by `/api/context`.
- **Search down-weights research.** `memoryLayerRoutingWeight('research') = 0.75` (`memory-layers.mjs:75`).
- **Dead research section.** `evolving-context.mjs:40-120` has a "Breakthroughs" research section, but it's never wired into the surface.

The result: 13 consolidated research reports exist in `memory-vault/facts/` (each 10–20 KB, cited), and an agent only benefits from them if it happens to run `recall` with matching words.

## 4. Human-requested research paths (keep)

| Path | Entry | Notes |
|---|---|---|
| REST | `POST /api/research` (`routes/research.mjs:31`) | Dashboard, extension Research tab, external agents |
| Share | `POST /api/share` `action: research` (`routes/share.mjs:75`) | Extension page/selection capture, CLI `share` |
| CLI | `total-recall research <topic>` (`cli/research.mjs:177`) | |
| Chat | **none** | `AVAILABLE_TOOLS` (`server/tools.mjs:530`) has `search_web` but no tool to queue background research. The system prompt forces `search_web` for any lookup |

None of these record *who* asked or *from where*. Queue items carry `{id, topic, status, priority, notes, node_slug, research_phase, …}`, with no `origin` and no `project` (`research-queue.mjs:8`).

## 5. Cost and safety

- Every G1–G7 run spends a web search budget and LLM calls. The 148 proactive runs and 21 expansion runs in one log window were all unrequested.
- The laptop is resource-starved (load average above 300 observed 2026-09-22 16:42, 100% memory). Unbounded background research competes with interactive work.
- There's no global cap on autonomous research: not per day, not per project, not on pending queue size.

## 6. Tests touching this area

- `fact-seeker*.spec.mjs`, `research*.spec.mjs`, `scheduler.spec.mjs`, `daemon-loop.spec.mjs`, `task-executors.spec.mjs`, `optimizer.spec.mjs`, `dream.spec.mjs`, `post-mortem.spec.mjs`
- All must be updated where they assert expansion, follow-ups, re-monitoring or staleness enqueueing.
