# Feature Ideation Vault — Master Catalog

> **What this is**: A long-lived, ever-refining catalog of feature ideas for Total Recall and the SSSS protocol. Not a roadmap. Not a backlog. An idea garden that gets weeded, watered, and replanted every pass.
>
> **How to read it**: Skim the North Star. Then browse threads. Every idea names the *structural lever* in SSSS that makes it uniquely possible — if it doesn't, it gets demoted.

---

## North Star — The Structural Levers

Total Recall is not a chatbot with memory. It has six structural properties that, together, do not exist in any other AI product. Every idea in this catalog must exploit at least one:

| # | Lever | Why it matters |
|---|-------|----------------|
| L1 | **Memory is files, not embeddings** | Forkable, git-versioned, user-readable, interoperable with every editor. |
| L2 | **Perpetual cognition budget** | ~1000+ inferences/day at near-zero cost via local Gemma kernel. Enables continuity humans can't sustain. |
| L3 | **Three explicit cognitive layers** | Conscious / System 2 / Research — most "AI memory" is one undifferentiated bag. |
| L4 | **Conflict-aware writes** | New beliefs are reconciled (supersedes/obsoletion), not accumulated. Slop-resistant. |
| L5 | **Workflow markdown as state machine** | `type: workflow` is parsed and run by the LLM — text becomes program. |
| L6 | **Semantic frontmatter ontology** | Subject/Predicate/Object + sentiment + modality enables O(1) conflict checks and queryable belief graph. |

Every idea below cites its levers. Ideas with no lever are generic AI features and live in the *Demoted* section at the bottom.

---

## Thread A — Daily-Life Applications via SSSS Extension

Treat life the way SSSS already treats code: lore, facts, preferences, decisions, with provenance and decay.

### A1. Personal Decision Vault
- **Pitch**: Every meaningful life decision (job, apartment, medication, finances) becomes a `decisions/` node with alternatives, reasoning, and predicted outcomes. Research engine periodically *audits past decisions* against current evidence.
- **Levers**: L2 (perpetual audit), L4 (supersedes when reality contradicts prediction), L6 (modality=must when "I will do X")
- **Sketch**: New node type `decision`, frontmatter adds `alternatives_considered[]`, `predicted_outcome`, `audit_schedule`. Daemon adds an audit task per decision with cadence based on `audit_schedule` (default 90d). System 2 phase compares predicted vs observed and either confirms or flags revisit.
- **User value**: Humans almost never revisit decisions systematically. This does it for them.
- **Open questions**: How does user record "observed outcome"? Voice journaling? Periodic prompts?

### A2. Body Memory / Symptom Pattern Engine
- **Pitch**: Symptoms, foods, sleep, exercise as observation nodes. SSSS conflict detection + research engine surface patterns the user never proposed ("8 headaches; 6 within 2 days of red wine").
- **Levers**: L4 (auto-correlation via predicate matching), L6 (subject/predicate/object lets us query "all observations where subject=body, predicate=symptom")
- **Sketch**: New schema `type: observation` with `recorded_at`, `domain` (sleep/food/exercise/symptom), `value`. Background pattern-detection task runs cosine similarity + temporal correlation across the observation set weekly.
- **User value**: Replaces 5 separate apps (Bearable, MyFitnessPal, sleep tracker) with one queryable vault — and adds emergent pattern detection none of them do.
- **Open questions**: Quick capture UX is everything; this dies without 1-tap logging.

### A3. Commonplace Book (Reading & Idea Capture)
- **Pitch**: Articles/books/podcasts → `facts/` and `concepts/` with citations. Tangent spawning surfaces "third source contradicting consensus on X" automatically.
- **Levers**: L2 (continuous re-reading of the corpus), L4 (contradictions in your reading become visible)
- **Sketch**: Browser extension / share-sheet ingests URL → research engine summarizes → stages in `facts/`. Weekly System 2 task compares new acquisitions against existing nodes for tension.
- **User value**: Turns passive reading into accumulating expertise.

### A4. Skill Acquisition Coach
- **Pitch**: User learning guitar/Mandarin/Go owns a `skills/<topic>/SKILL.md` that builds itself via the 5-phase research engine while user practices.
- **Levers**: L2, L5 (`type: workflow` for practice sessions), L3 (research finds new drills; conscious surfaces them when relevant)
- **Sketch**: User declares topic; daemon spawns skill scaffolding + research queue. Each practice session logs observations; weekly synthesis updates the skill file.
- **User value**: Personalized curriculum that adapts to *your* gaps, not a generic course's gaps.

### A5. Living Research Papers
- **Pitch**: Pick any personal topic of interest. The perpetual engine maintains a personal review article that updates forever — citations stay fresh, contradictions surface, emerging consensus tracked.
- **Levers**: L2, L3 (research layer never stops feeding facts), L1 (the paper is a markdown file you can read/export)
- **Sketch**: New project type `type: living-paper` with section structure. Research phase populates; Improvement phase polishes; Monitoring phase keeps cites fresh.
- **User value**: A Britannica-quality dossier on every topic you care about, automatically maintained.

### A6. Household / Family OS
- **Pitch**: Multi-user vaults — per-person subtrees with shared invariants. "Kids vegetarian on Tuesdays" is an invariant; "school field trip Thursday" is a `type: task`.
- **Levers**: L1 (git sub-folders per person), L6 (subject can be a family member, not just "agent")
- **Sketch**: Vault gains `agents/<person>/` subtrees. Surface compiler can render per-person views. Workflow can address `subject: spouse` etc.
- **Open questions**: Privacy model between household members; conflict resolution when two humans disagree.

### A7. Counterfactual Journal
- **Pitch**: Each decision node gets a daily background simulation: "what would have happened if X?" Cheap, repetitive, accumulates rich understanding of your real tradeoff space.
- **Levers**: L2 (free continuous simulation), pairs with **A1**
- **Sketch**: Daily P5 task per decision node generates a counterfactual narrative; logged as related research nodes.
- **User value**: Builds intuition about your own decision-making over months.

---

## Thread B — User-Defined App Platform

The unlock that turns Total Recall from a tool into a platform. **An app = vault subtree + skill bundle + workflow file(s) + schema. No code required for the common case.**

### B1. App Manifest & Installer
- **Pitch**: `npx total-recall install coffee-journal` clones an app's schema + starter skills + workflow files into your vault. Apps live as forkable git repos.
- **Levers**: L1 (git-native distribution)
- **Sketch**: New `app.yml` manifest at app root: name, version, schemas, skills, workflows, triggers, default categories. Installer merges non-destructively under `.agent/apps/<name>/`.
- **User value**: One command turns "I want to track X" into a working system.

### B2. Schema-Driven Custom Node Types
- **Pitch**: Apps extend `type: memory` with custom YAML keys validated by Zod schemas. Example: `type: workout` with `exercise`, `sets`, `reps`, `rpe`, `linked_program`. Still markdown, still git, still searchable.
- **Levers**: L1, L6
- **Sketch**: `app.yml` declares `schemas: [./schemas/workout.json]`. Steering and surface validate against the registered schema. Unknown types remain forward-compatible.
- **User value**: Domain-specific apps without losing the SSSS universal substrate.

### B3. Workflow Recorder ("Teach by Demonstration")
- **Pitch**: User performs a task once via computer-use / browser MCP. Daemon captures the sequence as a `type: workflow` markdown file. Replay later — LLM re-interprets at execution time so brittle selectors self-heal.
- **Levers**: L5 (workflow as state machine), L2 (LLM re-plans on each run)
- **Sketch**: New CLI: `total-recall record <slug>`. Records session JSONL → distillation step → workflow markdown with parameterized steps.
- **User value**: Macro recording for the AI age — no code, automation that doesn't break when selectors change.

### B4. Unified Trigger Fabric
- **Pitch**: Same schema for cron / file change / webhook / email arrival / semantic-match-in-journal / sensor reading. `triggers/*.md` fires `workflows/*.md`. Real automation, zero code.
- **Levers**: L5, L6 (triggers are first-class semantic nodes)
- **Sketch**: New `type: trigger` schema with `when` (cron expr, regex on filesystem, webhook URL, semantic query) and `then` (workflow slug). Daemon evaluates triggers on its loop.
- **User value**: Zapier-grade automation native to your brain.

### B5. App Store as Git Index
- **Pitch**: A registry repo (or DNS-discoverable index) listing public Total Recall apps. Anyone can publish; users `install` by name or URL. No central authority required.
- **Levers**: L1
- **Sketch**: A flat JSON index of app repos with name, author, description, install URL. Dashboard surfaces it. CLI: `total-recall search <query>`.

### B6. App Permissions Model
- **Pitch**: Apps declare what they can read/write: which vault categories, which secrets, which external network endpoints, whether they can use computer-use. User approves at install time.
- **Levers**: L1 (permissions are themselves markdown)
- **Sketch**: `app.yml` has `permissions:` block. Installer prompts user; granted permissions stored in `.agent/apps/<name>/grants.md` (which is itself a memory node, subject to audit).
- **Open questions**: How granular? Per-category? Per-slug? How is revocation handled mid-run?

### B7. App Isolation Boundaries
- **Pitch**: Apps write to their own `apps/<name>/` namespace by default. Cross-app reads require an explicit grant. Prevents an installed "coffee journal" app from accidentally clobbering your decisions vault.
- **Levers**: L1
- **Sketch**: Filesystem-level convention enforced by writer middleware. Cross-app citation via slug references.

### B8. Concrete Reference App: Recipe Journal
- **Pitch**: Ship one fully-spec'd app as proof-of-architecture. `type: recipe` schema, ingredients linked to a pantry, workflows for "plan the week" and "shop the list," triggers on grocery delivery confirmation email.
- **Levers**: B1–B7 in composition
- **Value**: Demoable in 60 seconds; doubles as the canonical example for app authors.

### B9. Concrete Reference App: Reading Queue
- **Pitch**: Pocket replacement. URL → research engine summary → `type: reading-item`. Workflow: "give me 1 hour of reading aligned with today's energy." Pairs with **A3**.
- **Levers**: B1–B7

### B10. Concrete Reference App: Freelance Client Tracker
- **Pitch**: `type: client` with invoicing reminders, project tracker, "always invoice within 7 days" as a per-app invariant.
- **Levers**: B1–B7

### B11. App Fork-as-Sync
- **Pitch**: Your installed app diverges from upstream. `total-recall sync <app>` pulls upstream improvements *without* clobbering your data — same fork-as-backup pattern already used for the vault.
- **Levers**: L1
- **Sketch**: Three-way merge with markdown-aware conflict resolution (use the existing steering engine).

### B12. In-Dashboard App Authoring
- **Pitch**: New tab in dashboard: "Create App." Form-driven: name your schema, declare workflows, set triggers. Generates the manifest + scaffolding. Zero command line.
- **Levers**: L1
- **Sketch**: React form → writes `app.yml` + skill stubs. Live preview of resulting node when user fills the schema form.

---

## Thread C — UX Innovations Only This Architecture Enables

Most "AI memory" UIs are chat sidebars. This system can do things they structurally cannot.

### C1. Vault-as-IDE Explorer
- **Pitch**: Not a sidebar — a file tree with semantic frontmatter as columns (importance, confidence, last_accessed, modality). Right-click → "see supersedes chain," "find contradictions," "promote to invariant."
- **Levers**: L1, L6
- **Sketch**: Replace current memory list with a virtual-tree component. Columns are sortable; filtering by tags/modality/status is one click.

### C2. Confidence/Decay as Visual Affordance
- **Pitch**: Old beliefs visibly fade in the UI. Decayed-but-not-deleted nodes appear ghosted. The cognitive lifecycle becomes tangible.
- **Levers**: L4
- **Sketch**: CSS opacity = confidence. Hover for half-life details. Click "revive" to reset access timestamp.

### C3. The "Why?" Provenance Pane
- **Pitch**: Click any compiled rule in `INSTRUCTIONS.md` → see source node + originating conversation + supersedes chain + survived conflicts. Provenance UI nothing else can offer.
- **Levers**: L1 (everything has a file), L4 (supersedes chain is real data)
- **Sketch**: Endpoint `/api/memory/:slug/provenance` returns full lineage. UI: timeline view + diff between versions.

### C4. Dream Cycle Live View
- **Pitch**: Live stream of the daemon's maintenance: "Promoted X, demoted Y, found conflict between A and B, resolved via recency." Makes unconscious work legible.
- **Levers**: L2, L3
- **Sketch**: SSE endpoint streaming dream-cycle events. Dashboard panel renders as event feed with click-through to affected nodes.

### C5. Inline Memory Candidates in Chat
- **Pitch**: Every meaningful conversational turn shows "+1 memory node candidate" — accept/edit/reject at speed of thought. Memory writes happen during the conversation, not after.
- **Levers**: L4 (steering accepts candidates and reconciles)
- **Sketch**: Chat UI surfaces a small chip when the model has detected a candidate fact/preference. One-click promote to vault.

### C6. Morning Briefing Voice Loop
- **Pitch**: Wake → Kokoro narrates overnight research + flagged decisions to audit + day's calendar friction. 5 minutes. Closes the loop between perpetual cognition and human action.
- **Levers**: L2 (overnight cognition), L3 (research surfaces, system 2 prioritizes)
- **Sketch**: Cron-triggered workflow at user's wake time. Pulls top N items from dream report, decision audit queue, calendar. Synthesizes 5-min monologue. Streams via Kokoro.

### C7. Conflict-as-Conversation (instead of auto-resolve)
- **Pitch**: When kernel detects a meaningful conflict, it can choose to *ask* rather than auto-resolve. Pop-up: "You said X yesterday. Today you said Y. Which holds?" User taps. Both get logged with provenance.
- **Levers**: L4
- **Sketch**: Steering engine gets a "ask threshold" — conflicts of high importance or low confidence delta route to user. Notification fabric (push, voice, email) carries the question.

### C8. Memory Weather / Season Metaphor
- **Pitch**: Visual rendering of vault state: which categories are "growing," which are "decaying," which are "in conflict storm." Treats memory as ecology, not database.
- **Levers**: L4
- **Sketch**: Dashboard widget. Heuristic: recent-additions, recent-supersedes, conflict density per category over rolling window.

### C9. Memory Portability Rituals
- **Pitch**: Bulk import — drop an Obsidian vault / Apple Notes export / journal txt. Research engine converts overnight to SSSS-conformant nodes. Bulk export — "give me my last 6 months as a printed book" — produces a real codex.
- **Levers**: L1
- **Sketch**: CLI `total-recall import <path>` queues background conversion tasks. CLI `total-recall export book --since <date>` generates pandoc PDF.

### C10. Genealogy of Beliefs Visualization
- **Pitch**: Pick any current invariant → see the full causal graph: which observations led to which patterns led to this rule. A DAG view of belief formation.
- **Levers**: L1, L4
- **Sketch**: Use existing supersedes/related/source links to draw a Mermaid/d3 graph. Click any node to navigate.

### C11. "+1 Memory" Hotkey Everywhere
- **Pitch**: System-wide keyboard shortcut (or selected-text action) that captures whatever the user is reading/saying as a vault candidate. Friction = zero.
- **Levers**: L1, paired with C5

---

## Thread D — Inference-Budget Unlocks

The point isn't "more AI." It's *cognitive patterns that require continuity humans can't sustain*.

### D1. Continuous Self-Audit
- **Pitch**: Every active memory node revisited on decay-weighted schedule: "still true?" Vault fact-checks itself against fresh research.
- **Levers**: L2, L3 (research), L4 (supersedes when stale)
- **Sketch**: Scheduler maintains a per-node next-audit timestamp. Audit task pulls fresh evidence, calls Frontier eval if uncertain, updates confidence or supersedes.

### D2. Adversarial Self-Play for Skills
- **Pitch**: Each `SKILL.md` periodically stress-tested: kernel generates 20 plausible prompts that *should* invoke this skill but might fail; runs them; logs failures as `system2-deliberation` tasks; fixes the skill autonomously.
- **Levers**: L2, L5
- **Sketch**: P4 self-eval task per skill, weekly. Eval rubric in skill manifest. Failures generate concrete amendments.

### D3. Belief-Graph Triangulation
- **Pitch**: Take every claim in `facts/`. Cross-reference against every other claim. Detect emergent contradictions humans miss because they accumulate beliefs over years.
- **Levers**: L4, L6 (SPO triples enable graph reasoning)
- **Sketch**: Periodic graph traversal over the SPO triples; flag pairs with same subject/predicate but conflicting object or polarity.

### D4. Slow-Thinking on Hard Questions
- **Pitch**: Park "should I change jobs?" → System 2 deliberates for 30 days at low cost, new angle daily. Humans can't deliberate this slowly because they forget context. The brain doesn't.
- **Levers**: L2, L3
- **Sketch**: New `type: deliberation` with `target_question`, `due_by`, deliberation log. Daily P3 task generates one new angle, logs to file.

### D5. Multi-Agent Inner Monologue
- **Pitch**: Spawn role-prior sub-agents (skeptic / optimist / pragmatist) to debate hard questions in branching JSONL sessions. User reads transcript next morning.
- **Levers**: L2, L5 (session DAG already supports branching)
- **Sketch**: For a chosen question, fork session with personas; each contributes a turn; synthesizer summarizes consensus + dissent.

### D6. REM Consolidation
- **Pitch**: Daily JSONL sessions synthesized into compressed narrative nodes; cross-day pattern detection. User wakes to *insight*, not notifications.
- **Levers**: L2, L3
- **Sketch**: Nightly P1 task: distill day's sessions into a `journal/<date>.md` node. Weekly task: find patterns across the last 7 daily journals.

### D7. Personal LoRA Training-Set Generation
- **Pitch**: Continuous (prompt, ideal-response-per-your-standards) pair extraction from sessions. Eventually a fine-tune that's uniquely yours.
- **Levers**: L2, L1 (training data is markdown)
- **Sketch**: Background task scans accepted-response sessions; emits to `.agent/training/<date>.jsonl`. Periodic `total-recall finetune` produces a LoRA.

### D8. Proactive Day Simulation
- **Pitch**: Each morning, kernel role-plays your calendar, flags likely friction: "your 2pm overlaps kid's pickup; you forgot to prep slides for 4pm; lunch spot closed Mondays."
- **Levers**: L2
- **Sketch**: Cron task pulls calendar; simulates each event; cross-references known anti-patterns (e.g., "agent: forgets to prep slides").

### D9. Counter-Example Generator
- **Pitch**: For every claimed invariant, kernel tries to generate a plausible exception. Healthy invariants survive; weak ones get downgraded or refined.
- **Levers**: L2, L4
- **Sketch**: Per-invariant weekly task: "produce 3 plausible counter-examples." If any pass System 2 review, invariant gets a refinement task.

### D10. Inference Receipts
- **Pitch**: Every LLM call generates a receipt node: prompt, response, cost, model, latency, why-called. Lets the user audit their own cognition usage.
- **Levers**: L1, L2
- **Sketch**: Wrap all inference calls; emit `type: receipt` to `.agent/receipts/<yyyy-mm>/`. Dashboard tab to browse and aggregate.

### D11. Future-Self Letters
- **Pitch**: Write a letter to yourself in 5 years; arrives on schedule. Implemented as a `type: future-letter` with `deliver_at`. Daemon delivers.
- **Levers**: L5 (workflow scheduled), L1 (markdown is the letter)
- **Sketch**: Simple new type + delivery worker. Surprisingly profound when paired with **A1** (audit decisions against past letters).

---

## Thread E — Cross-Cutting / Meta

Ideas that aren't a single feature but a posture toward the whole system.

### E1. Vault Federation
- **Pitch**: Multiple sovereign brains across devices (laptop / phone / cloud VM) sync via git. Each device is fully sovereign but conflicts are resolved by the steering engine, not last-write-wins.
- **Levers**: L1, L4
- **Sketch**: `total-recall remote add <git-url>`. Pull = three-way merge with conflict-aware reconciliation.

### E2. Cross-Vault Citations
- **Pitch**: Cite another user's *public* node in your own (consent-based). Memory becomes networked without losing sovereignty.
- **Levers**: L1
- **Sketch**: `cite:` field in frontmatter pointing to `git+ssh://...#slug`. Surface compiler dereferences for display.

### E3. Public Memory Garden
- **Pitch**: Opt-in publishing of select nodes as a static personal wiki. Vault → site, automatically. Build in public.
- **Levers**: L1
- **Sketch**: `publish: true` flag → static site generator (Astro/11ty) emits a public mirror of those nodes.

### E4. Time-Locked Memories
- **Pitch**: Write a node now, sealed until a future date. Useful for predictions ("I think X will happen by 2027") that auto-audit on unlock.
- **Levers**: L4
- **Sketch**: `unlock_at` field; surface compiler hides until time passes; auto-audit task at unlock time.

### E5. Memory Inheritance
- **Pitch**: Designate heirs. On death/incapacity (verified via dead-man's switch), select categories transfer.
- **Levers**: L1
- **Sketch**: Same federation infrastructure as E1; condition is a heartbeat workflow that hasn't fired in N days.

### E6. Memory Anti-Patterns Category
- **Pitch**: Explicit category for "things I keep forgetting." Tracked as anti-patterns. Surface compiler nags when the predicate is detected in current context.
- **Levers**: L6
- **Sketch**: Subdir `anti-patterns/personal/`. Heuristic: any pattern with `modality: must_not` and `subject: agent` qualifies.

### E7. Habit Graveyard
- **Pitch**: Superseded habits (the trail of failed self-improvement). Preserved, queryable, surfaced when a *new* attempt resembles a previously-failed one.
- **Levers**: L4
- **Sketch**: Use existing supersedes mechanism. Periodic alert when new habit attempt has high similarity to a superseded one.

### E8. Inverse Memory / Privacy Ratchet
- **Pitch**: What should *not* be remembered. Explicit anti-memory: "never mention my therapist's name in any output," "forget all dietary logging older than 90 days." First-class.
- **Levers**: L6 (`modality: must_not`)
- **Sketch**: New category `forgets/` with `redact_target` + `expiry`. Surface compiler enforces by stripping matching content from outputs.

### E9. Vault Diffing as Ritual
- **Pitch**: Weekly review = `git diff` of vault over the past 7 days, narrated by the kernel. "Here's what you came to believe; here's what you stopped believing."
- **Levers**: L1, L2
- **Sketch**: Cron workflow → git log + LLM synthesis → email or voice briefing.

### E10. Reverse RAG
- **Pitch**: Your vault as a retriever for *other* apps' LLM calls. Expose semantic search as a public-ish endpoint other tools query.
- **Levers**: L1, L6
- **Sketch**: Already nearly built (`/api/memory/search/semantic`). Add scoped tokens + per-app permissions.

### E11. Memory Bounty Board
- **Pitch**: Pay a future self (or another vault) to research X. Bounty = priority boost in research queue + optional escrowed payment.
- **Levers**: L2, L5
- **Sketch**: `type: bounty` with payout (in cycles or cash) on completion criteria. Federation extension lets a bounty be claimed by another vault.

### E12. Council Mode
- **Pitch**: Pick N memory nodes (e.g., past mentors' quotes, books you trust). Kernel role-plays them as personas in a debate over a current question.
- **Levers**: L2, L5
- **Sketch**: User selects nodes; deliberation workflow casts each as a persona; transcript saved as a session.

### E13. Negotiation / Commitment Memory
- **Pitch**: Every commitment to others (work, family, friends) becomes a `type: commitment` node with deadline and counter-party. Auto-audit: "you promised X by Friday; status?"
- **Levers**: L4, L6
- **Sketch**: New type; daily P1 task checks open commitments approaching deadline.

### E14. Skill Atrophy Detection (for humans)
- **Pitch**: Decay applies to user skills, not just memory confidence. "You last played guitar 47 days ago." Pairs with **A4**.
- **Levers**: L4
- **Sketch**: Practice-session observations refresh last_practiced; threshold triggers nudge workflow.

---

## Demoted (Generic AI Features Without a Lever)

Held here to remind us what *not* to build. These are good ideas in general but Total Recall has no structural advantage producing them:

- Generic chat with memory (every product has this).
- "Summarize this document" (every product has this).
- "Write me an email" (every product has this).
- AI image generation (already deferred; no SSSS lever).
- Voice cloning (no SSSS lever).
- Generic translation (no SSSS lever).

If any of these acquires a real SSSS lever in a later pass, promote it back up.

---

## Refinement Log

### Pass 1 — 2026-05-21 — Initial brain-dump
- Seeded 5 threads (A–E) with 50 ideas total.
- Established North Star with 6 structural levers (L1–L6).
- Every idea required to cite at least one lever.
- Created Demoted section to catch generic ideas.
- Ideas span: 7 daily-life apps (A), 12 platform features (B), 11 UX innovations (C), 11 inference-budget unlocks (D), 14 cross-cutting / meta (E) — though A4/C11 and others have natural pairings noted.

### Pass 2 — _(pending)_
- Deepen lever rationale on all Pass 1 ideas.
- Add concrete first-week implementation sketch for top 10.
- Identify dependencies between ideas (which require which).
- Identify "killer demo" compositions (e.g., A1 + D1 + C3 = audited-decisions demo).
- Net-add 10+ new ideas surfaced by deeper thinking.

### Pass 3 — _(pending)_
- Adversarial: for each idea, write its strongest critique.
- Kill or merge ideas that fail their critique.
- Flag ideas requiring user input to survive.

### Pass 4+ — _(pending)_
- See [PROJECT_TRACKER](./FEATURE_IDEATION_VAULT_PROJECT_TRACKER.md) for full pass plan.
