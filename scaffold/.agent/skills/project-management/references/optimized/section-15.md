### The SWE Project Lifecycle

0. **Audit** (AUDIT) — read the existing code, data, infrastructure and standing rules; run the baseline tests; register every finding. Nothing else starts before this is `Complete`.
1. **Discovery** (PRD & Architecture) — define *what* is being built and *how* the systems connect, given what the audit found.
2. **Planning** (Dev Plan & Tracker) — break the architecture into a step-by-step plan, then extract binary yes/no tasks into the tracker. Every P0/P1 finding has a tracker item.
3. **Execution** — never code blindly; every PR checks off a specific tracker box. Don't let work drift into a later phase while an earlier one is incomplete.

