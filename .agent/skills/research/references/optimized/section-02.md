## 🧭 RESEARCH AS SYSTEM 2 (read this first)

Background research is the brain's slow, deliberate thinking. It runs for exactly two reasons:

1. **A human asked.** They can ask in chat (the model's `queue_research` tool), from the browser extension (Research on a page or selection, or the Research tab), from the dashboard, from the CLI (`total-recall research add "<topic>"`, `total-recall share`), or from any API client (`POST /api/research`). No budget applies, and it runs ahead of autonomous work.
2. **The AI found a knowledge gap while working on a project.** After a session with a known project (the session's `cwd`), `ingestSessionTopics` infers gaps that would measurably improve the agent's work *on that project*. Typical gaps: post-cutoff APIs or libraries the project uses, errors it couldn't explain, places it guessed. `research-gate.mjs` admits them only within budget, and only when existing research doesn't already cover them.

   Default budgets, overridable under `autonomous:` in `config/research.yml`:
   - 3 pending per project
   - 6 per day
   - 2 per session
   - skip if an existing report already has cosine similarity ≥ 0.72

**Research never spawns research.** Removed on 2026-09-22 (RESEARCH_SYSTEM2):
- the expansion phase
- agenda follow-up gaps
- self-diagnosis topic invention
- the dream-cycle "Verify still-current" sweep
- hourly re-monitoring
- deliberation's self-queued tasks

The pipeline is **acquisition → deliberation → improvement → done**. Failed items retry at most 3 times.

**Where findings go:**
- **Instructions.** Finished research for the current project, plus research the user asked for in the last 30 days, appears as a **Background Research (System 2)** section in the compiled instructions (`research-surface.mjs`).
- **Chat.** Chat automatically adds research relevant to the user's message to the system prompt.
- **Only real research is surfaced.** Reports whose synthesis is empty or a meta-response are skipped.

Every queue item records provenance: `origin` (`user` | `autonomous`), `requested_via`, `project`, `rationale` and `session_id`.

