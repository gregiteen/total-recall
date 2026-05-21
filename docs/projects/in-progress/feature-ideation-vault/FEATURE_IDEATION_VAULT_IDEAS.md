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

---

# Pass 2 — Depth, Composition, Net-Add

## Deeper Lever Analysis (Pass 2)

Pass 1 cited levers as labels. Pass 2 explains *why* the lever is non-obvious for ideas that look generic at first glance.

- **A1 Decision Vault** — looks like a journaling feature. Lever L4 is the unlock: the auto-audit only works because `supersedes` and `superseded_by` are real graph edges. Without that, "audit past decisions" is just "re-read your journal." Same goes for L6: structured predicate (`predicted_outcome` vs `observed_outcome`) lets the auditor *compute* divergence rather than asking an LLM to vibe-check.
- **A2 Body Memory** — looks like a tracker. Lever L6 is the unlock: SPO triples let the pattern engine ask "all observations where subject=body AND predicate=symptom AND temporal-window=±48h relative to predicate=ingestion." That's a query, not a vibe. Without L6 the LLM can hallucinate correlations.
- **B3 Workflow Recorder** — looks like Selenium with extra steps. Lever L5 is the unlock: at replay time the LLM *re-interprets* the markdown workflow, so changing the page layout doesn't break the recording — the LLM regenerates the selector path from intent. Without L5 it's just a brittle recording.
- **C3 Provenance Pane** — looks like git blame. Lever L1 + L4 together: every node has its file *and* a structured supersedes chain. You don't have to scan diffs — you traverse a typed graph.
- **D3 Belief-Graph Triangulation** — looks like contradiction-spotting. Lever L6 is the unlock: triples are the input. Without SPO frontmatter you can only do embedding-cosine which catches paraphrase but not directional contradiction (X is good vs X is bad both embed close).
- **D4 Slow-Thinking** — looks like "let the LLM think longer." Lever L2 + L3: cheap continuous budget enables one deliberation step *per day* over weeks. Frontier models can't do this — too expensive per call, no persistent state. The local kernel + research layer is what makes month-long deliberation tractable.
- **E1 Vault Federation** — looks like Dropbox. Lever L4: conflicts get reconciled by the *steering engine*, not by overwrite. Multi-device "memory" with semantic reconciliation has no commodity equivalent.
- **E8 Inverse Memory** — looks like a do-not-mention list. Lever L6: `modality: must_not` is a first-class enforcement primitive that surface compiler honors at every output. It's a property of the belief graph, not a regex.

## First-Week Sketches — Top 10 (Pass 2)

For the highest-leverage ideas, what would shipping week 1 look like? Goal: prove the lever, not the feature.

1. **A1 Decision Vault — Week 1**: Add `type: decision` schema; CLI `total-recall decide` opens a structured editor; one scheduled audit task per decision; dashboard tab listing decisions with "audit due" badges. Stop. The auto-audit logic itself is Week 2.
2. **D1 Continuous Self-Audit — Week 1**: For nodes already in `facts/`, add per-node `next_audit_at` field; scheduler picks the oldest due each cycle; runs research-engine refresh against that node's topic; updates confidence or appends supersedes. No UI yet — just observe the dream report.
3. **B1+B2 App Manifest + Schema — Week 1**: Define `app.yml` schema; installer copies files into `.agent/apps/<name>/`; Zod validates declared node schemas. Ship one reference app (Recipe Journal **B8**) as the test case. Don't tackle permissions/isolation yet.
4. **C4 Dream Cycle Live View — Week 1**: SSE endpoint streams existing dream events; dashboard panel with auto-scroll feed; click a node to open it. Pure read; no actions. Makes the daemon's existing work visible — *zero new daemon code*.
5. **C5 Inline Memory Candidates — Week 1**: Surface candidates already produced by steering as chips in dashboard chat; click → promote with default frontmatter. Re-uses existing steering output.
6. **D6 REM Consolidation — Week 1**: Nightly task that writes `journal/<date>.md` from the day's session JSONL. Just summarization. Cross-day patterns are Week 2+.
7. **C3 Provenance Pane — Week 1**: API endpoint `/api/memory/:slug/provenance` returns lineage; render as a simple timeline. No graph viz yet.
8. **B3 Workflow Recorder — Week 1**: CLI captures a Playwright session; LLM converts to `type: workflow` markdown with intent-labeled steps; replay manually. No GUI yet.
9. **D10 Inference Receipts — Week 1**: Middleware wrapping the inference client emits a JSONL receipt per call. Dashboard tab lists last 100 with filters. Aggregation analytics is Week 2.
10. **E9 Vault Diffing as Ritual — Week 1**: Cron-triggered workflow that runs `git log --since=7.days.ago` + LLM synthesis; emits a `weekly/<date>.md` node. Read on Sunday morning. Zero UI.

## Dependency Graph (Pass 2)

Which ideas require which? Build order matters.

```
Foundation tier (no deps):
  L1-L6 (already exist)
  D10 Inference Receipts ──► observability for everything below
  C4 Dream Cycle Live View ─► makes existing daemon legible

Platform tier (depends on foundation):
  B1 App Manifest ──┐
  B2 Schemas     ───┼──► B5 App Store, B6 Permissions, B7 Isolation, B8/B9/B10 Reference Apps
  B6 Permissions ───┘

Memory-quality tier (depends on D10 + dream cycle):
  D1 Continuous Self-Audit ──► A1 Decision Vault auto-audit
  D3 Triangulation ──────────► E16 Cross-Person Reconciliation
  D6 REM Consolidation ─────► E9 Vault Diffing

Surfacing tier (depends on memory-quality):
  C3 Provenance Pane
  C5 Inline Candidates
  C8 Memory Weather
  C10 Genealogy Viz

Composition tier:
  A1+D1+C3 = Audited Decisions demo
  A4+E14 = Skill Acquisition + Atrophy
  B3+B4 = Recorded-and-Triggered automations
  D5+D4+E12 = Council Mode + Slow-Thinking + Inner Monologue

Federation tier (last, hardest):
  E1 Vault Federation ──► E2 Cross-Vault Citations, E5 Inheritance, E11 Bounty Board
```

## Killer Demo Compositions (Pass 2)

Single features are forgettable. Combinations are demoable.

### Demo 1: The Audited Decision (A1 + D1 + C3 + C7)
Open the dashboard. See yesterday's decision: "Take the contract job." Click it. Provenance pane shows the conversation where you made it. Below: a System 2 audit appended this morning — "the contract terms you negotiated assume X; the latest research indicates X has shifted; revisit?" Two buttons: revisit / confirm. This is the entire pitch for the system in 30 seconds. **Nobody else can do this.**

### Demo 2: The Self-Maintaining Skill (A4 + D2 + C3)
User practices guitar. Logs a frustrating session. Overnight, the kernel notices: this is the 3rd session frustrated by the same chord transition. Adversarial self-play on the skill file generates 5 alternative practice drills. Next morning the practice page surfaces the new drill at the top with "added overnight because Wed/Thu/Sun were rough on this transition." User sees the kernel *teaching itself how to teach better*.

### Demo 3: The Honest Calendar (D8 + E13 + C6)
Morning briefing voice (Kokoro): "Good morning. You have a 4pm with X. Two weeks ago you promised them the proposal by yesterday — it's not done. Your 2pm overlaps the school pickup again. Should I reschedule the 4pm or surface the missed commitment to them first?" One sentence reveals *3 things no calendar app can*: the broken commitment, the recurring conflict, the proactive question.

### Demo 4: The Inheritance Ritual (E5 + E1 + E15 + E9)
Late in life: user opens the vault and reads the year's accumulated wisdom letter (A8). Selects categories to transfer (decisions/, lore/, lessons-from-marriage/). Designates an heir. Years later the heir receives a federated read-only fork — not a will, *an instructable life*. This is what the architecture *means*.

### Demo 5: The Slow Question (D4 + D5 + E12)
User parks "should I move to Lisbon?" Tags it. Daily for 30 days the kernel adds one new angle: a contradicting source today (D4), a council debate tomorrow (E12), a tangent expansion the day after (research engine). Day 30: synthesized recommendation with all evidence, citations, counter-arguments. The user has *thought longer than humanly possible* about this one question.

## New Ideas (Pass 2 Net-Add)

### Thread A — Daily-Life (continued)

#### A8. Annual Letter From the Vault
- **Pitch**: Year-end synthesis: kernel writes a letter summarizing the year's evolution of beliefs, the decisions you made, the contradictions you resolved, the things you came to believe vs. abandoned. Mailed to you on Dec 31.
- **Levers**: L2 (a year's worth of cheap reflection), L4 (supersedes chains tell the *story* of changed beliefs)
- **Sketch**: Cron workflow at year-end. Pulls all supersedes events + new invariants + closed decisions + journal nodes. Synthesizes into a long-form letter; saves to `letters/<year>.md`.

#### A9. Mourning Layer
- **Pitch**: Special handling for memory of deceased people or ended relationships. Nodes can be marked `mourning: true`; surface compiler softens references and stops proactive surfaces about them (no "remember to text mom" if mom died).
- **Levers**: L6 (modality + lifecycle state), L1 (it's just a flag in markdown)
- **Sketch**: New lifecycle status `memorialized`. Surface compiler filters proactive triggers. Search still finds the nodes; the system just stops *initiating* about them.
- **Open questions**: How does the kernel know? Manual transition vs detected via federation heartbeat (E5).

#### A10. Apprenticeship Mode
- **Pitch**: User declares a mentor (could be a person, a book, a public-garden vault). Kernel maintains the relationship as a node graph. When user faces a question, surfaces the mentor's relevant prior thinking before the kernel's own.
- **Levers**: L1 (mentor can be any markdown corpus), L6 (relationship as typed edge)
- **Sketch**: `apprenticeship/` category; mentor source can be `book:`, `vault:`, `person:`. Surface compiler boosts mentor-attributed nodes when relevant.

#### A11. Cooking / Hosting Memory
- **Pitch**: What worked for whom on what occasion. "Last time Sara visited you served X and she mentioned the cilantro." Now you're hosting Sara again — surface that.
- **Levers**: L6 (subject can be a guest), L4 (preferences supersede over time)
- **Sketch**: Pairs with B8 Recipe Journal. Adds `served_to:` and `feedback:` fields. Cross-references guest list on next event.

#### A12. The Question Garden
- **Pitch**: A persistent place to plant *open questions* — not tasks. Each grows over time as research and conversation touch it. "Why do I work better in the morning?" plants a question. Months later it's a small dossier.
- **Levers**: L2 (long-running curiosity), L3 (research feeds it)
- **Sketch**: New `questions/` category. Each is a long-lived node accumulating linked observations, research, decisions. Distinct from D4 (deliberation has a deadline; questions don't).

### Thread B — App Platform (continued)

#### B13. App Telemetry as Memory
- **Pitch**: Apps emit usage events as observation nodes. "Which app did I use most this week?" answered without external analytics. App authors learn from anonymized federation.
- **Levers**: L1, L6
- **Sketch**: Apps write to `.agent/apps/<name>/usage/` as observations. Queryable like any vault.

#### B14. Marketplace Reputation as Memory
- **Pitch**: When an app misbehaves, your *notes about it* ARE the reputation system. No central ratings server. Federation lets reputation be a public-garden node citable by others.
- **Levers**: L1, E2 (cross-vault citations)
- **Sketch**: Standard `reviews/apps/<name>.md` schema. Anyone can publish; consumers aggregate from trusted vaults.

#### B15. Per-App Voice / Persona
- **Pitch**: An app declares its voice ("the coach speaks with brevity and intensity"). System prompt adapts when that app's workflows run.
- **Levers**: L5 (workflow controls execution context)
- **Sketch**: `app.yml` declares `voice:` string or markdown file. Workflow runner appends to system prompt during execution.

#### B16. Hot-Reloadable Workflows
- **Pitch**: Edit a workflow markdown; daemon picks up changes on next invocation. No restart. Iterating on automations feels like editing a paragraph.
- **Levers**: L1, L5
- **Sketch**: Workflow loader checks mtime on each run. Trivial; affirms the markdown-is-program ethos.

#### B17. App Composition (apps depending on apps)
- **Pitch**: An app declares it depends on another app's schemas. Recipe Journal depends on Pantry app. Installer resolves dependencies the way npm does.
- **Levers**: L1
- **Sketch**: `app.yml: depends_on: [pantry]`. Installer pulls graph; missing deps offered for install.

#### B18. App Sunset Protocol
- **Pitch**: When you uninstall an app, you choose: delete its data / archive its data as read-only / keep its data and orphan the schemas. Failure modes are explicit.
- **Levers**: L1 (data is just files)
- **Sketch**: `total-recall uninstall <app> --mode=archive|delete|orphan`.

### Thread C — UX (continued)

#### C12. Audio Vault Browsing
- **Pitch**: Voice-only mode: ask "what did I believe last March?" — Kokoro reads back. The phone-while-walking interface for the brain.
- **Levers**: L2 (Kokoro is free), pairs with C6
- **Sketch**: Voice loop: STT → semantic search → top-3 nodes → Kokoro reads first; "more" or "next" navigates.

#### C13. The "Today" Page
- **Pitch**: One canonical dashboard view: open commitments, decisions to audit, fresh research surfaces, today's friction predictions, recent memory candidates. *Single* screen. Probably the most-used surface.
- **Levers**: L1, L3
- **Sketch**: Aggregates outputs of D1, D8, E13, C5 into a designed scroll. Replaces the current generic chat-first home.

#### C14. Memory Marginalia
- **Pitch**: Annotate any node — yours or someone else's (via federation) — *without* modifying it. Notes-on-notes. Forks-without-supersedes.
- **Levers**: L1, L4
- **Sketch**: New `type: annotation` with `target_slug`, `target_vault`, `comment`. Renders inline in node view.

#### C15. Quick-Capture Modes
- **Pitch**: Voice, photo, text — all flow to inbox with smart routing to inferred categories. The "+1 hotkey" (C11) plus its modalities.
- **Levers**: L1
- **Sketch**: One-tap modes; LLM tags into inbox with provisional category; user confirms in dashboard later.

#### C16. The Empty-Vault First-Run
- **Pitch**: First-time UX is where most "second-brain" tools fail. Total Recall's onboarding is a 10-minute conversation that *produces* the user's first 30 memory nodes — about themselves, their goals, their constraints — so the vault is *useful at minute 11*.
- **Levers**: L1, L6 (structured capture from the start)
- **Sketch**: Onboarding workflow markdown that walks user through self-portrait questions. Each answer becomes a node. Ends with a generated "about me" surfaced in the system prompt.

### Thread D — Inference-Budget (continued)

#### D12. Sleep-Cycle Aligned Cognition
- **Pitch**: Heavy System 2 deliberation runs at night; light surfacing during active hours. Reduces competing-for-attention; respects diurnal rhythm.
- **Levers**: L2 (the budget is yours to schedule), L6 (preferences encode quiet hours)
- **Sketch**: Scheduler reads `preferences/cognitive-hours.md`; assigns P1/P3 tasks to overnight, P0/P5 to daytime.

#### D13. Anomaly Detection Over Self
- **Pitch**: Statistical pattern over the user's vault: "you usually log workouts 4×/week; you've logged 0 this week. Want to acknowledge?" Not nagging — *noticing*.
- **Levers**: L2, L6
- **Sketch**: Per-predicate rolling baselines; alert when current window deviates >2σ.

#### D14. Cross-Domain Insight Mining
- **Pitch**: Look for predicates that recur across unrelated categories — `procrastinate` appearing in work / fitness / relationships — surface the meta-pattern. "You procrastinate when you're uncertain about the *audience*, not the task."
- **Levers**: L2, L6
- **Sketch**: Weekly P4 task scans predicate frequencies cross-category; LLM proposes hypotheses; user accepts/rejects.

#### D15. Quiet Hours / Cognitive Etiquette
- **Pitch**: User declares cognitive quiet periods (no proactive surfaces, no notifications, no morning briefing if user is on vacation). Vault as well-mannered roommate.
- **Levers**: L1, L6
- **Sketch**: Preference node enforced by all proactive triggers.

#### D16. Confidence Calibration Tracking
- **Pitch**: Every prediction the kernel makes gets logged. Periodically: "your kernel's 80%-confidence claims were right 62% of the time — over-confident." User-visible calibration plot.
- **Levers**: L2 (it can self-track at scale)
- **Sketch**: Wrap claim-making with `prediction` log; auto-resolve when supersedes or audit gives ground truth; emit Brier score weekly.

#### D17. Hypothesis Pool
- **Pitch**: Kernel maintains a small set of *hypotheses about the user* ("user works better with caffeine before 11am"). Each gets passively tested over time; promoted to preferences when significant, retracted when refuted.
- **Levers**: L2, L4
- **Sketch**: New `hypotheses/` category with `evidence_count`, `support_count`, `next_test_at`. The kernel's own model of you, queryable.

### Thread E — Cross-Cutting (continued)

#### E15. Vault as Inheritance Artifact
- **Pitch**: Better than a will: a vault carries beliefs, decisions, hard-won lessons. Combined with E5, vault inheritance is *the* meaningful artifact of a life.
- **Levers**: L1 (markdown survives), L4 (supersedes chain shows growth)

#### E16. Cross-Person Memory Reconciliation
- **Pitch**: In a household, two people disagree on a fact ("we agreed X" vs "we agreed Y"). Vault stores both *subject-tagged*. The system never picks; it surfaces the disagreement when relevant.
- **Levers**: L4, L6 (subject is person, not "agent")
- **Sketch**: Conflict resolution can short-circuit to `status: open-disagreement` when subjects differ.

#### E17. Memory as Therapy Adjunct
- **Pitch**: User marks a session as "therapeutic reflection." Different surfacing rules — kernel optimizes for self-understanding, not action. Doesn't try to fix; surfaces patterns gently.
- **Levers**: L3 (research vs system 2 vs conscious distinction matters), L6
- **Sketch**: New `mode: therapeutic` on sessions; suppresses task generation; bias toward observation and connection.

#### E18. Vault Commit as Ritual
- **Pitch**: Regular git commits aren't IT chore — they're memorialization. Dashboard surfaces a weekly "commit your week" prompt with a meaningful message.
- **Levers**: L1
- **Sketch**: Reuses git infra. Suggested message draws on E9 diffing synthesis.

#### E19. Mutual Vault Reading Time
- **Pitch**: For couples / close friends — synchronized weekly time where both browse shared categories together. The vault as joint reflection space, not just personal one.
- **Levers**: L1
- **Sketch**: Federation + a shared `joint/` category. Tooling for synchronized reading sessions (cursor presence, optional voice).

#### E20. The Conscious-Unconscious Boundary
- **Pitch**: First-class concept in UI: what's the kernel *thinking about right now* (research queue + system 2 queue + active deliberations) vs what's *settled*. Makes the cognitive layer model legible.
- **Levers**: L3 (this is literally the layer architecture)
- **Sketch**: Dashboard tab "Thinking Now" showing live queue contents.

## Pass 2 Refinement Log

### Pass 2 — 2026-05-21 — Depth, Composition, Net-Add
- Added Deeper Lever Analysis for 8 of the subtlest ideas — explained *why* the lever is non-obvious and what generic features fail at.
- Added Top-10 First-Week Sketches: scoped each to "prove the lever, ship in a week, defer the polish."
- Added Dependency Graph showing build-order tiers (foundation → platform → memory-quality → surfacing → composition → federation).
- Added 5 Killer Demo Compositions — concrete 30-second pitches that combine multiple ideas into demoable products. Demo 1 (Audited Decision) and Demo 5 (Slow Question) are the strongest stand-alone narratives.
- Net-added 23 new ideas: A8–A12 (5), B13–B18 (6), C12–C16 (5), D12–D17 (6), E15–E20 (6). Catalog is now at **73 ideas total**.
- Notable new entries with high promise:
  - **A12 Question Garden** — distinct from D4 Deliberation; questions don't need deadlines.
  - **D17 Hypothesis Pool** — the kernel's *own model of you*, passively tested. Most novel idea in Pass 2.
  - **C13 The "Today" Page** — likely the single most-used surface; pulls together D1/D8/E13/C5.
  - **D16 Confidence Calibration** — gives the kernel epistemic honesty; almost no system has this.
  - **A8 Annual Letter** — the emotional anchor that gives users a reason to use the vault for life.

---

---

# Pass 3 — Adversarial Review

For each meaningfully-at-risk idea: the sharpest critique I can construct, then a verdict. **Kill** = strike from active set. **Merge** = absorbed into another. **Strengthened** = survives with explicit hardening. **Needs input** = decision belongs to the user.

> Nothing is deleted. Killed/merged ideas remain referenced below for provenance.

## Critiques & Verdicts

### A6 Household OS — *Strengthened*
- **Critique**: Multi-user memory is *a separate product*. Privacy between household members is a research problem. Conflict resolution between humans is a UX minefield. Most "households" want shared calendars and lists, not shared cognition.
- **Verdict**: Survives, but **scoped down**: ship single-user-with-multi-subject (you tag observations about other people, but only you read the vault). Real multi-vault federation deferred to E1.

### A9 Mourning Layer — *Needs input + Strengthened*
- **Critique**: Risk of being trivially wrong (kernel forgets to surface mom's birthday when the user wanted that to be the memorial trigger). Also: should a *tool* be making decisions about grief etiquette?
- **Verdict**: Survives only as **explicit user-driven** state transition — never auto-detected. Frame as "memorialize this person/relationship" — user-initiated only.
- **Needs input**: Do you want this in the catalog at all? It's emotionally heavy and easy to do badly.

### B5 App Store as Git Index — *Merged into B1*
- **Critique**: This is just GitHub. There's no "store" to build — apps are repos, install is `npx total-recall install <url>`. The "index" is whatever search you want to use over `topic:total-recall-app`.
- **Verdict**: **Merged** into B1 (App Manifest & Installer). The index is just `gh search` with a topic. No new feature work needed; the discoverability is downstream of B1 + naming convention.

### C2 Confidence as Visual Affordance — *Strengthened*
- **Critique**: Pretty without purpose. Does fading text actually change user behavior? Could become tweeness without research evidence.
- **Verdict**: Survives only paired with **action**: faded nodes get a one-click "revive / archive / refine" affordance. Without action, drop it.

### C8 Memory Weather Metaphor — *Killed*
- **Critique**: Generic dashboard candy. Doesn't answer "what should I do next?" Doesn't map to a clear lever. Smells like data viz for its own sake.
- **Verdict**: **Killed**. Re-promote only if Pass N produces a concrete user task it accelerates.

### D7 Personal LoRA Training-Set Generation — *Strengthened — defer*
- **Critique**: Fine-tuning is a serious engineering investment. Most users don't want a personal model — they want a personal *behavior*, which prompt-engineering already provides via the vault. LoRA is a 6-month project with uncertain payoff.
- **Verdict**: Survives but **deferred to v2**. Keep emitting the JSONL training pairs (cheap), defer the actual fine-tune until evidence shows it adds something the in-context vault can't.

### D8 Proactive Day Simulation — *Strengthened*
- **Critique**: Calendar apps already do "you're double-booked." The novelty has to be the *cross-domain integration* with the vault (your invariants, your missed commitments, your patterns). If it's just "your 2pm overlaps your 3pm," it's commodity.
- **Verdict**: Survives only when grounded in **vault-derived friction** — not generic calendar conflicts. Pairs hard with E13 (commitments) and D14 (cross-domain patterns).

### D7 (LoRA) and D2 (Adversarial Self-Play) Cohabit — *Strengthened*
- **Note**: Pass 2 sketched D2 as "weekly," but adversarial self-play burns inference budget fast. Constrain: D2 runs only on skills with recent usage (last 14 days), and only when scheduler has spare cycles.

### E1 Vault Federation — *Strengthened*
- **Critique**: Distributed systems are where good ideas go to die. Three-way merge of markdown with semantic reconciliation is non-trivial. Most users have one machine.
- **Verdict**: Survives **scoped to read-only mirrors first**. Bi-directional sync with conflict reconciliation is v2. Phase 1: phone reads a static export of laptop's vault. Most of the user-value is there.

### E2 Cross-Vault Citations — *Merged into E1 v2*
- **Critique**: Depends on federation maturity. Without trust + identity + revocation, citing someone else's node is a footgun.
- **Verdict**: **Merged** into E1 v2 — surfaces only when federation has mutual-trust primitive.

### E5 Memory Inheritance — *Needs input + Strengthened*
- **Critique**: Death is heavy. Dead-man's switches have UX failure modes (false positives are *bad*). Legal status of a vault inheritance is undefined. The technical primitive (federated read-only fork triggered by heartbeat absence) is straightforward; the *product* requires thought.
- **Verdict**: Survives **as a technical primitive only**. Don't market or UX it. Document it as a capability advanced users can wire up; don't put a button on the dashboard yet.
- **Needs input**: Comfort level with shipping this concept at all.

### E10 Reverse RAG — *Strengthened*
- **Critique**: Already partially built (`/api/memory/search/semantic`). The "feature" is really just: scoped tokens + permissions + docs. Don't over-design.
- **Verdict**: Survives as a small concrete shipment: scoped PAT tokens with per-category read grants, public docs page. Maybe 1 day of work.

### E11 Memory Bounty Board — *Killed-for-now*
- **Critique**: Economic primitives are out of scope. "Pay yourself in cycles" is cute but doesn't motivate. Inter-vault payment is identity + payments + trust = three hard problems.
- **Verdict**: **Killed** for the foreseeable future. The *priority-boost-in-research-queue* idea survives as a trivial feature of the research queue without any economics.

### E14 Skill Atrophy — *Strengthened*
- **Critique**: Could become nagging. "You haven't played guitar in 47 days" is exactly the kind of micro-shame the kernel should *avoid*. Quantified-self burnout is real.
- **Verdict**: Survives only if **surfaced on user request**, not pushed. Show on dashboard when user opens a relevant page; don't notify.

### A8 Annual Letter — *Strengthened*
- **Critique**: Pretty but is it a *feature*? Could be a one-shot generation any LLM does.
- **Verdict**: Survives because of L4 — only Total Recall has the *supersedes chain* to narrate "what you stopped believing." That's the unique thread. Frame the letter explicitly around belief evolution, not life events.

### C12 Audio Vault Browsing — *Strengthened*
- **Critique**: Quality of voice interaction depends entirely on Kokoro and STT pipeline. Easy to ship a janky version that no one uses.
- **Verdict**: Survives but **deferred until** C6 (morning briefing) ships and proves voice UX works.

### E17 Memory as Therapy Adjunct — *Needs input*
- **Critique**: Mental-health-adjacent claims invite real liability. "Therapy adjunct" framing is a problem. The underlying capability (a different surfacing mode that's gentler, suppresses task generation) is fine; the *positioning* is not.
- **Verdict**: Capability survives as "reflective mode." Drop "therapy" framing.
- **Needs input**: Confirm.

### E19 Mutual Vault Reading Time — *Killed-for-now*
- **Critique**: Niche to the point of being a separate product. Couples-mode is a marketing direction, not a kernel feature.
- **Verdict**: **Killed** for v1. Revisit if E1 federation lands and users ask.

### D16 Confidence Calibration — *Strengthened*
- **Critique**: Brier scoring requires resolved ground truth. Many vault claims are never falsified — they just decay. Where does the ground-truth signal come from?
- **Verdict**: Survives only on the subset of claims that have **terminal events**: predictions with `due_by`, decisions with `audit_outcome`, hypotheses with `next_test_at`. The full vault doesn't calibrate; the testable subset does.

### B12 In-Dashboard App Authoring — *Strengthened — defer*
- **Critique**: A GUI builder is a big project. Probably yak-shave compared to shipping the CLI authoring path and a few reference apps first.
- **Verdict**: Survives but **deferred**. CLI + markdown templates first; GUI when an app author asks for it.

## Surviving Catalog: Cluster Themes

The 73 ideas (minus the 3 killed, minus the 3 merged) cluster into 7 coherent themes. Each theme is *also* a potential product narrative.

### Theme 1: Cognition Continuity
*"The kernel does cognitive work humans cannot sustain — long memory, slow thinking, continuous audit."*
- D1 Continuous Self-Audit · D4 Slow-Thinking · D6 REM Consolidation · D14 Cross-Domain Insight · D17 Hypothesis Pool · A1 Decision Vault · A7 Counterfactual Journal · A12 Question Garden · A5 Living Research Papers · A8 Annual Letter

### Theme 2: Belief Hygiene
*"Beliefs reconcile, decay, calibrate. The vault is slop-resistant by design."*
- D3 Belief-Graph Triangulation · D9 Counter-Example Generator · D16 Confidence Calibration · D17 Hypothesis Pool · E4 Time-Locked Memories · E7 Habit Graveyard · E8 Inverse Memory · E16 Cross-Person Reconciliation

### Theme 3: Platform Substrate
*"Total Recall is a platform — users and third parties build apps in markdown."*
- B1 App Manifest · B2 Schemas · B3 Workflow Recorder · B4 Trigger Fabric · B6 Permissions · B7 Isolation · B8/B9/B10 Reference Apps · B11 Fork-Sync · B13 App Telemetry · B14 Reputation as Memory · B15 Per-App Voice · B16 Hot Reload · B17 App Composition · B18 Sunset Protocol

### Theme 4: Personal Provenance
*"You can see how your beliefs formed and evolved. UI for self-understanding."*
- C3 Provenance Pane · C10 Belief Genealogy · C4 Dream Cycle Live View · E9 Vault Diffing · E18 Vault Commit as Ritual · E20 Conscious-Unconscious Boundary

### Theme 5: Quiet Companion
*"The kernel has manners. Surfaces when useful, silent otherwise."*
- D12 Sleep-Cycle Cognition · D15 Quiet Hours · C13 The Today Page · C5 Inline Candidates · C6 Morning Briefing · C11 +1 Hotkey · C15 Quick-Capture Modes · C16 Empty-Vault First-Run · E17 Reflective Mode (renamed from "therapy adjunct")

### Theme 6: Cross-Brain Society
*"Sovereign vaults can talk to each other without losing sovereignty."*
- E1 Vault Federation (read-only first) · E3 Public Memory Garden · E10 Reverse RAG · E16 Cross-Person Reconciliation · A10 Apprenticeship Mode

### Theme 7: Lifetime Artifact
*"The vault is the meaningful record of a life."*
- A8 Annual Letter · E4 Time-Locked Memories · E5 Memory Inheritance (technical primitive) · E15 Vault as Inheritance Artifact · E18 Vault Commit as Ritual · D11 Future-Self Letters · A9 Mourning Layer

## Pass 3 Refinement Log

### Pass 3 — 2026-05-21 — Adversarial Review
- Critiqued 20 of the most vulnerable ideas; verdicts logged.
- **Killed (3)**: C8 Memory Weather, E11 Bounty Board, E19 Mutual Reading Time. Held in record below; revivable if a future pass produces a real lever or user demand.
- **Merged (2)**: B5 App Store → into B1; E2 Cross-Vault Citations → into E1 v2.
- **Needs user input (3)**: A9 Mourning Layer, E5 Memory Inheritance, E17 Therapy Adjunct (renamed → "Reflective Mode" pending decision).
- **Strengthened with constraints (12)**: most notably C2 (must pair with action), D7 LoRA (defer), E1 Federation (read-only first), E14 Skill Atrophy (pull not push), D8 Day Simulation (vault-derived only).
- Identified 7 cluster themes — each is also a candidate **product narrative**. Theme 1 (Cognition Continuity) + Theme 5 (Quiet Companion) is the strongest single-narrative pair: "the kernel thinks for you, quietly, when you can't."
- Catalog now at **70 active ideas** (73 − 3 killed) plus 3 needing user input.

### Open questions for the user after Pass 3:
1. A9 Mourning Layer — in or out of catalog?
2. E5 Memory Inheritance — comfortable shipping the technical primitive, even silently?
3. E17 — accept rename to "Reflective Mode" and drop therapy framing?

---

---

# Pass 4 — Cross-Pollination & Composition

Pass 2 found 5 demos. Pass 4 looks for **emergent ideas** — when two ideas combined produce a third that neither contains alone — and for **product narratives** that tie many ideas into one story.

## Compositional Ideas (Net-New from Combinations)

Each composition is named, its component atoms cited, and the emergent property identified — the thing that *neither parent had alone*.

### Comp-1. The Living Self-Model
- **Components**: D17 Hypothesis Pool + D1 Continuous Self-Audit + D16 Confidence Calibration
- **Emergent**: The kernel maintains its **model of you** as a queryable, calibrated, self-correcting graph. "Here is what I currently believe about you, with confidence intervals, and what I've been wrong about lately." No system claims this because no system has the substrate.
- **Levers**: L2 (continuous), L4 (supersedes when wrong), L6 (model is structured)
- **Why emergent**: D17 alone is just a list of hunches. D1 alone is just refresh. D16 alone is scoring without ground truth. Together: a *self-aware persona* of the kernel's read on you.

### Comp-2. Long Questions
- **Components**: A12 Question Garden + D4 Slow-Thinking + E12 Council Mode + D5 Multi-Agent Monologue + D9 Counter-Examples
- **Emergent**: A canonical treatment of questions that resist one-day answers. Plant a question; it grows over weeks; council debates it; counter-examples refine it; you check on it monthly. The product feels like the system *takes your hard questions seriously*.
- **Levers**: L2, L3, L5
- **Why emergent**: D4 alone is just "think longer." E12 alone is "talk to personas once." Stacked with persistence (A12), counter-evidence (D9), and council, the question gets *real-er* over time. Months later it's a small book on you.

### Comp-3. Living Automations
- **Components**: B3 Workflow Recorder + B4 Trigger Fabric + B15 Per-App Voice + B16 Hot Reload + D2 Adversarial Self-Play
- **Emergent**: Personal automations that *re-plan at runtime*, *fire on rich triggers*, *speak with their own voice*, *update on save*, and *stress-test themselves weekly*. The "Zapier of the AI age" only if you stack all five; less than that and it's just brittle recording.
- **Levers**: L5, L1, L2

### Comp-4. The Insight Engine
- **Components**: D6 REM Consolidation + D14 Cross-Domain Mining + E9 Vault Diffing + A8 Annual Letter + D13 Anomaly Detection
- **Emergent**: A pipeline that produces **weekly insights you couldn't have noticed yourself** — overnight pattern detection, cross-domain mining, diff narration, annual synthesis, anomaly flagging. The kernel becomes your *honest mirror*.
- **Levers**: L2, L3, L6

### Comp-5. The Prediction Substrate
- **Components**: A1 Decision Vault + D17 Hypothesis Pool + D16 Calibration + E4 Time-Locked Memories + D11 Future-Self Letters
- **Emergent**: Every meaningful claim about the future is recorded, sealed, audited on unlock, and contributes to your calibration score. Over years the kernel learns *how* you're miscalibrated and tells you. This is the *Tetlock superforecaster pipeline* as a personal substrate.
- **Levers**: L2, L4, L6
- **Why emergent**: A1 alone is journaling. E4 alone is novelty. Stacked, you get *epistemic feedback over decades*. No app does this.

### Comp-6. The Self-Biography Engine
- **Components**: C3 Provenance Pane + C10 Belief Genealogy + E9 Vault Diffing + A8 Annual Letter + E18 Commit as Ritual + D11 Future-Self Letters + E15 Inheritance Artifact
- **Emergent**: Your beliefs across time become a navigable, narratable, exportable life-document. Not "what happened" — *who you became*. Closest analogue: the supersedes-aware version of a personal Wikipedia.
- **Levers**: L1, L4

### Comp-7. The Frictionless Capture Layer
- **Components**: C5 Inline Candidates + C11 +1 Hotkey + C15 Quick-Capture Modes + C16 Empty-Vault First-Run + B3 Workflow Recorder
- **Emergent**: A *capture-everything-anywhere* foundation that doesn't require thinking about categories or schemas. Without this, every other feature dies — because users won't write nodes. This is *load-bearing infrastructure*, not a feature.

### Comp-8. The Honest Day
- **Components**: E13 Commitments + D8 Day Simulation + E16 Cross-Person Reconciliation + C6 Morning Briefing + C13 Today Page + D15 Quiet Hours
- **Emergent**: Each morning, the kernel surfaces what you promised, where you'll struggle, who you're letting down, and what to address first — *with manners*. Demo 3 from Pass 2, expanded into a full daily ritual.

### Comp-9. Self-Improving Automations
- **Components**: B3 Workflow Recorder + D2 Adversarial Self-Play + B15 Per-App Voice + B4 Triggers
- **Emergent**: Workflows that stress-test themselves and propose amendments. Recording today, hardening tomorrow, refactored next week. Workflow as a *living document*.

### Comp-10. Total Mastery Loop
- **Components**: A4 Skill Acquisition Coach + D2 Self-Play + B3 Recorder + E14 Skill Atrophy + A12 Question Garden
- **Emergent**: Pedagogy as a closed system — coach generates drills, drills stress-test the user's recorded performance, atrophy surfaces when practice lapses, open questions about the skill grow over time. A complete *learning OS* for any single discipline.

### Comp-11. Models of Other People
- **Components**: D17 Hypothesis Pool + E16 Cross-Person Reconciliation + A6 Household OS (scoped) + A11 Cooking/Hosting Memory + A10 Apprenticeship
- **Emergent**: The kernel maintains hypotheses about people in your life — calibrated, supersedable. "Sara prefers X. You've been right about her preferences 7/9 times this year." Pairs with E1 Federation v2 for explicit consent.
- **Levers**: L4, L6 (subject = other person)
- **Risk**: Sliding into creepy surveillance. **Constraint**: only behaviors the user explicitly observes; never inferred from third-party data.

### Comp-12. The Personal Web (Indieweb-style)
- **Components**: E1 Federation + E3 Public Garden + A10 Apprenticeship + E10 Reverse RAG + B14 Reputation
- **Emergent**: Your vault publishes selectively, cites others' vaults, follows mentors' public nodes, and exposes scoped retrieval for other apps. A protocol-native social layer that *isn't a platform* — federated, sovereign, citable.
- **Levers**: L1, L6
- **Closest existing analogue**: Indieweb + RSS + microformats — but for cognition.

### Comp-13. The Quiet Brain
- **Components**: D12 Sleep-Cycle Cognition + D15 Quiet Hours + C13 Today Page + C5 Inline Candidates + D6 REM Consolidation + C6 Morning Briefing
- **Emergent**: A kernel that *thinks at night and behaves at day*. Most cognition happens while you sleep; interaction is concise and respectful. The product feels like a well-mannered roommate, not an attention-greedy app.
- **Levers**: L2, L3

### Comp-14. The Memory Cathedral
- **Components**: A8 Annual Letter + E5 Inheritance + E15 Vault as Artifact + E18 Commit Ritual + E4 Time-Locked + D11 Future-Self Letters + C10 Genealogy + Comp-6 Self-Biography
- **Emergent**: The vault as a *deliberately built lifetime structure* — annual chapters, sealed predictions, generational transfer. Frames Total Recall not as productivity tool but as *life work*. Distinct positioning that no productivity app can claim.

### Comp-15. Calibration-Aware Recommendation
- **Components**: D16 Calibration + D1 Self-Audit + Comp-1 Living Self-Model + C5 Inline Candidates
- **Emergent**: When the kernel makes a recommendation, it cites its own calibration. "Suggested action: X. I've been right about your preferences in this domain 73% of the time." Sets *truthful expectation* with the user — the antidote to AI sycophancy.
- **Levers**: L2, L4

## Product Narratives (which compositions tell a single story)

Several compositions can be braided into a single product-narrative — the kind of thing that fits on a homepage or in a 30-second pitch. Three candidates:

### Narrative A — "The Quiet Companion"
**Pitch**: *Total Recall thinks at night so you can think clearly by day.*
- Anchors: Comp-13 Quiet Brain, Comp-4 Insight Engine, Comp-8 Honest Day, Comp-7 Frictionless Capture
- Strength: Most accessible to non-technical users. Solves real attention pain. Differentiation = "respectful AI."
- Risk: Underplays the platform/sovereignty story.

### Narrative B — "The Honest Mind"
**Pitch**: *An AI brain that knows what it doesn't know, audits its beliefs, and tells you when it's wrong.*
- Anchors: Comp-1 Living Self-Model, Comp-5 Prediction Substrate, Comp-15 Calibration-Aware Rec, D3 Triangulation, Theme 2 Belief Hygiene
- Strength: Sharpest differentiation from frontier chatbots. Speaks to people who distrust AI confidence.
- Risk: Niche audience initially; requires sophistication.

### Narrative C — "The Lifetime Vault"
**Pitch**: *Build a memory that lasts a lifetime — and outlasts it.*
- Anchors: Comp-6 Self-Biography, Comp-14 Memory Cathedral, Theme 7 Lifetime Artifact
- Strength: Emotional gravity. Hard to clone (requires SSSS substrate).
- Risk: Late-payoff feature; users may not buy in until years in.

### Narrative D — "The Sovereign Platform"
**Pitch**: *Your own AI brain — and your own AI apps. No clouds, no lock-in.*
- Anchors: Theme 3 Platform Substrate, Comp-3 Living Automations, Comp-12 Personal Web
- Strength: Tech-audience differentiation; clear vs Notion/Mem/Obsidian.
- Risk: Sovereignty is fashionable but doesn't sell broadly.

**Recommendation**: Lead with A (Quiet Companion) as the public face; let B (Honest Mind) be the *evidence* of A; let C (Lifetime Vault) be the *long-term promise*; let D (Sovereign Platform) be the *power-user track*. They're not competing — they're concentric.

## Atomic Net-Adds Surfaced by Composition

Looking at the compositions, a few *atomic* ideas were implicit but never named. Adding them now:

### A13. Calibrated Recommendation Surface
- **Pitch**: Any time the kernel surfaces a suggestion, it can cite its own recent calibration in that domain. "Suggested: X (I've been right about your food preferences 73% of the time this quarter.)"
- **Levers**: L2, L4
- **Sketch**: Recommendation pipeline reads the relevant calibration aggregate; appends to the surfacing text.
- **From**: Comp-15

### D18. Catalog-of-Selves Index
- **Pitch**: Auto-generated chronological index of "who you were" — the supersedes chain of your *invariants and major preferences* rendered as biographical chapters.
- **Levers**: L1, L4
- **Sketch**: Periodic synthesis task; output to `selves/<year>.md` with the year's defining beliefs and their lineage.
- **From**: Comp-6 / Comp-14

### B19. App as Workflow Bundle (no schema needed)
- **Pitch**: Lightest-weight app form: just a folder of workflows + triggers, no custom schemas. Lower entry barrier than B2's full schema apps.
- **Levers**: L1, L5
- **Sketch**: Manifest with empty `schemas:` block; installer skips schema validation. Pure automation apps.

### C17. Surface Diet
- **Pitch**: User can set a *maximum surfacing budget*: "no more than 3 candidates per day." Backpressure on the kernel's enthusiasm.
- **Levers**: L1, L6
- **Sketch**: Preference `surfacing_max_per_day`; surface compiler enforces by ranking candidates and dropping below threshold.
- **From**: Comp-13 Quiet Brain

### E21. Vault-Native RSS / ATOM
- **Pitch**: Your `published: true` nodes are an RSS feed. Subscribers (other vaults, regular feed readers) get updates. Pairs with E3 Public Garden.
- **Levers**: L1
- **Sketch**: Generator emits `feed.xml` from published-flagged nodes.

### D19. Disagreement-as-Signal
- **Pitch**: When the kernel and the user disagree (user overrides a recommendation), that's the highest-signal training data. Logged explicitly to `.agent/disagreements/<date>.md` with both positions + outcome.
- **Levers**: L2, L4
- **Sketch**: When user rejects a candidate/recommendation, prompt for reason; store as observation node.

## Pass 4 Refinement Log

### Pass 4 — 2026-05-21 — Cross-Pollination & Composition
- Added 15 compositional ideas (Comp-1 through Comp-15). Each one names the atomic components it combines and the *emergent property* that the parents don't have alone. Comp-1 Living Self-Model, Comp-5 Prediction Substrate, Comp-14 Memory Cathedral are the most novel.
- Identified 4 product narratives (Quiet Companion / Honest Mind / Lifetime Vault / Sovereign Platform). Recommended **A as the public face, B as the evidence, C as the promise, D as the power-user track** — they're concentric, not competing.
- Net-added 6 atomic ideas surfaced by compositional thinking: A13 Calibrated Recommendation, D18 Catalog-of-Selves, B19 Workflow-Only Apps, C17 Surface Diet, E21 Vault-Native RSS, D19 Disagreement-as-Signal.
- Catalog now at **76 active atomic ideas + 15 compositions + 4 narratives**.
- The "Living Self-Model" (Comp-1) is the single most novel idea in the catalog. It's the only one with no analogue in any other system. If we ship one thing first, it's a candidate for *the* differentiator.

---

---

# Pass 5 — First-Run Aha & Demoability

Great ideas die on the first-run cliff. Pass 5 specs **the exact moment a user feels the magic** for each strong idea, classifies them by setup-cost and time-to-aha, and ranks them by demoability.

## Setup-Cost / Time-to-Aha Matrix

| Idea | Setup | Time-to-Aha | The Aha Moment |
|------|-------|-------------|----------------|
| **C3 Provenance Pane** | Zero | Day 1 | Click any rule. See the conversation it came from. *"I can SEE the lineage."* |
| **C4 Dream Cycle Live View** | Zero | Day 1 | Glance at dashboard. Watch the daemon promote / demote / resolve nodes in real time. *"It's actually doing stuff."* |
| **C5 Inline Candidates** | Zero | Day 1 | Chat for 30s. See "+1 memory" chip. Click. Memory now exists. *"Capture costs nothing."* |
| **C11 +1 Hotkey** | Zero | Day 1 | Highlight text anywhere on system. Press shortcut. Captured. *"It's everywhere."* |
| **D10 Inference Receipts** | Zero | Day 1 | Open Receipts tab. See every kernel call with cost. *"I can audit my own AI."* |
| **B1 + B8 Install Recipe App** | Light | Day 1 | `npx total-recall install recipe-journal`. New tab appears. Add first recipe. *"Apps are real."* |
| **B3 Workflow Recorder** | Light | Day 1 | Record once: "tweet a summary of latest blog post." Replay tomorrow — selector changed, kernel adapts. *"It heals itself."* |
| **D6 REM Consolidation** | Zero | Day 2 | Wake up. `journal/<yesterday>.md` exists with 3-sentence synthesis. *"It read my day."* |
| **C6 Morning Briefing** | Light | Day 2 | Wake to Kokoro reading 5 things. *"It briefed me without being asked."* |
| **Comp-1 Living Self-Model** | Medium | Week 1 | Open "About Me" tab. Read what the kernel believes about you with confidence scores. *"It knows me — and it tells me what it's unsure about."* |
| **C13 Today Page** | Medium | Week 1 | Single screen with everything that matters today, drawn from vault state. *"This is my command center."* |
| **D17 Hypothesis Pool** | Zero | Week 2 | Dashboard surfaces "Hypothesis: you work best 9-11am (evidence: 7 sessions). Confirm?" *"It noticed something I never articulated."* |
| **D13 Anomaly Detection** | Zero | Week 2 | "You usually log workouts 4×/week; 0 this week. Acknowledge?" *"It's watching without nagging."* |
| **E9 Vault Diffing** | Zero | Week 2 | Sunday: weekly digest narrated by Kokoro. *"My week, summarized."* |
| **A2 Body Memory + D14 Cross-Domain** | Medium | Month 1 | "8 headaches; 6 within 48h of red wine." *"It found a pattern I missed."* |
| **A1 Decision Vault + D1 Audit** | Medium | Month 3 | First decision audit fires. *"It's holding me accountable to my own thinking."* |
| **Comp-5 Prediction Substrate** | Medium | Month 6 | First sealed prediction unlocks. Calibration nudge: "you said 70%; you were right." *"My forecasting is being graded."* |
| **A8 Annual Letter** | Heavy | Year 1 | Dec 31 letter arrives, narrating the year of belief change. *"This is who I became."* |
| **E5 Inheritance** | Heavy | Lifetime | Years later, heir receives a federated read-only fork. *"This was the real legacy."* |

**Setup tiers**:
- **Zero**: Works on install, no user data required.
- **Light**: Needs a single user action (install app, record one workflow, set wake time).
- **Medium**: Needs accumulated vault content (~1 week of capture).
- **Heavy**: Needs ongoing usage (decisions logged, predictions made, calendar wired).

## Onboarding Architecture — The First 10 Minutes

The user's first session is *the entire product*. Most second-brain tools fail here. The first 10 minutes should produce **enough vault content that 4 day-1 ahas are immediately demonstrable**.

```
Minute 0-2 — Welcome
  - Single screen. "Tell me 3 things about you."
  - Kernel asks 3 questions; answers become first 3 nodes.

Minute 2-4 — Capture demo
  - "+1 hotkey" demo: capture a thought from the page they're reading.
  - Show it appearing in the vault.

Minute 4-6 — Install one reference app
  - "Pick one: Recipe / Reading Queue / Decisions / Skill Coach."
  - Installs. Schema appears. They add one entry.

Minute 6-8 — Show the Today page
  - Already populated by their 5+ nodes from previous minutes.

Minute 8-10 — Show the Provenance pane and Dream Cycle live view
  - "Here's where every rule comes from. Here's the kernel maintaining itself."

Day 2 — Wake to first REM journal + first morning briefing
  - Two passive ahas without lifting a finger.

Week 1 — Today page is dense; first hypothesis appears
  - First active ahas based on accumulated data.

Week 2-4 — Pattern detection, anomaly flagging, weekly digest
  - The system starts noticing things they didn't.
```

The pipeline is **fast aha → passive aha → active aha → reflective aha**. Each tier earns the right to the next.

## Demoability Rankings (Top 10 for a 60-second Video)

For a landing-page video / sales demo, ordered by impact:

1. **Comp-1 Living Self-Model** — The "About Me" screen. Single screenshot makes the whole pitch.
2. **C3 Provenance Pane** — Click → reveal lineage → animated supersedes chain. Demoable in 5 seconds.
3. **Comp-8 Honest Day** (morning briefing) — Voice + visible insights. Emotional resonance.
4. **D6 + E9 Overnight Magic** — Time-lapse: user sleeps, journal/digest appear. Magical.
5. **B3 Workflow Recorder** — Record. Selectors change. Replay still works. Surprising.
6. **C4 Dream Cycle Live View** — Live activity feed. Makes the daemon visible.
7. **D17 Hypothesis Pool** — "I think you do X because Y. Confirm?" One screenshot.
8. **D2 Adversarial Self-Play** — Skill improves itself overnight. Show before/after of a SKILL.md.
9. **Comp-15 Calibration-Aware Recommendation** — Recommendation cites its own track record. *No other AI does this.*
10. **C11 +1 Hotkey** — Anywhere → vault in one shortcut. Tactile.

## Slow-Burn / Fast-Reward Pairings

Long-payoff features must ship paired with their day-1 companion or users will churn:

| Slow-burn feature | Time-to-aha | Required day-1 companion |
|---|---|---|
| A1 Decision Vault audit | Month 3 | C3 Provenance Pane on the decision; D11 future-self letter readable now |
| A8 Annual Letter | Year 1 | E9 Vault Diffing weekly preview of the format |
| Comp-5 Prediction Substrate calibration | Month 6+ | D11 Future-Self Letters readable at any time; weekly calibration snapshot |
| E5 Inheritance | Lifetime | E18 Vault Commit Ritual making the artifact visible weekly |
| D17 Hypothesis Pool (accuracy) | Month 6 | Same-day "first hypothesis surfaced" notification (Week 2) |
| Comp-14 Memory Cathedral | Lifetime | A8 Annual Letter preview / D18 Catalog of Selves draft any time |

The principle: **every lifetime feature has a weekly companion that proves the architecture works**.

## Net-Adds Surfaced by Pass 5

### C18. Backfill Importer with Aha-Pre-Seeding
- **Pitch**: User imports an Obsidian vault / Notes export / journal. The research engine pre-seeds the vault overnight so the next morning's *first* REM journal already has rich content. Hard problem: time-to-aha for power users who already have years of notes.
- **Levers**: L1
- **Sketch**: `total-recall import <path>`; classifier inserts each entry as draft node; overnight system 2 promotes the highest-confidence ones.

### C19. Demo Mode (Synthetic Vault)
- **Pitch**: Optional first-run mode using a fictional vault to demonstrate all features instantly. User sees the Today page, audited decisions, hypotheses *populated* — then opts in to a clean start of their own.
- **Levers**: L1
- **Sketch**: Bundle a `demo-vault.tar.gz` of a fictional user's 6-month-old vault. User can switch back to empty when ready.
- **Rationale**: Solves the empty-vault chicken-and-egg without forcing users to wait a week.

### A14. Decision Backfill Conversation
- **Pitch**: First-run optional flow: "Walk me through 3 recent meaningful decisions." Conversational ingestion creates 3 instant Decision Vault nodes with audit dates already scheduled.
- **Levers**: L1, L6
- **Sketch**: Onboarding workflow that produces real audited decisions on day 1, so the user has skin in the game before week 1.

### D20. Day-Zero Hypothesis Seeding
- **Pitch**: After onboarding's 3 questions, kernel proposes 3 initial hypotheses about you. User confirms / refutes. Hypothesis Pool now has signal day 1, not week 2.
- **Levers**: L2, L4
- **Sketch**: LLM call over the 3 self-portrait nodes; generates hypotheses with confidence < 0.4 (low, by design); user calibrates immediately.

### E22. Vault Anniversary Ritual
- **Pitch**: On the date of vault creation each year, a celebratory ritual surfaces — "Today is your vault's 1st birthday. Here's what changed." Builds emotional attachment to the artifact.
- **Levers**: L1
- **Sketch**: Trivial. Cron task on creation-date anniversary.

## Pass 5 Refinement Log

### Pass 5 — 2026-05-21 — First-Run Aha & Demoability
- Mapped 19 strong ideas to setup-cost + time-to-aha + the actual aha-sentence. 9 ideas demonstrate **day-1**; 6 by **week 1-2**; 4 long-payoff.
- Designed the **10-Minute Onboarding Architecture**: a sequenced ritual producing 4 day-1 ahas. Pipeline = fast aha → passive aha → active aha → reflective aha.
- Ranked top-10 ideas by **demoability for a 60-second video**. Comp-1 Living Self-Model is the single most demoable; Comp-15 Calibration-Aware Recommendation is the most differentiated.
- Identified **slow-burn / fast-reward pairings** so no lifetime feature ships without a weekly companion proving the architecture works.
- Net-added 5 onboarding-focused ideas: **C18 Backfill Importer, C19 Demo Mode, A14 Decision Backfill, D20 Day-Zero Hypothesis Seeding, E22 Vault Anniversary**. These are all *bridging* ideas — they exist to make other ideas land faster.
- Catalog now at **81 atomic ideas + 15 compositions + 4 narratives**.
- Key insight: **C19 Demo Mode** may be the most underrated idea in the catalog. It alone could 10x conversion by sidestepping the empty-vault death zone.

---

---

# Pass 6 — Effort, Risk, Leverage Scoring

Effort: **S** (1-3d) · **M** (1-2w) · **L** (1-2mo) · **XL** (3mo+). Risk axes: Tech / UX / Phil — low/med/high. Value 1-5. Leverage score = Value / (EffortPoints × MaxRiskPoints), where Effort {S:1, M:2, L:4, XL:8} and Risk {low:1, med:2, high:3}.

## Scored Atoms (Strong Ideas)

| Idea | Effort | Value | Tech | UX | Phil | **Leverage** |
|------|:---:|:---:|:---:|:---:|:---:|:---:|
| **Comp-15 Calibration-Aware Recommendation** | S | 5 | L | L | L | **5.0** |
| **C3 Provenance Pane** | S | 4 | L | L | L | **4.0** |
| **C5 Inline Candidates** | S | 4 | L | L | L | **4.0** |
| **A8 Annual Letter** | S | 4 | L | L | L | **4.0** |
| **E9 Vault Diffing** | S | 4 | L | L | L | **4.0** |
| **D19 Disagreement-as-Signal** | S | 4 | L | L | L | **4.0** |
| **D15 Quiet Hours** | S | 4 | L | L | L | **4.0** |
| **C16 Empty-Vault First-Run** | S | 5 | L | M | L | **2.5** |
| **C19 Demo Mode** | M | 5 | L | L | L | **2.5** |
| **D6 REM Consolidation** | M | 4 | L | L | L | **2.0** |
| **C11 +1 Hotkey (Cross-platform)** | S | 4 | M | L | L | **2.0** |
| **D11 Future-Self Letters** | S | 3 | L | L | L | **3.0** |
| **C4 Dream Cycle Live View** | S | 3 | L | L | L | **3.0** |
| **D10 Inference Receipts** | S | 3 | L | L | L | **3.0** |
| **A12 Question Garden** | S | 3 | L | L | L | **3.0** |
| **C17 Surface Diet** | S | 3 | L | L | L | **3.0** |
| **B8 Recipe Reference App** | S | 3 | L | L | L | **3.0** |
| **E22 Vault Anniversary** | S | 2 | L | L | L | **2.0** |
| **B1 App Manifest & Installer** | M | 5 | M | M | L | **1.25** |
| **D17 Hypothesis Pool** | M | 5 | M | M | L | **1.25** |
| **A1 Decision Vault** | M | 5 | L | M | L | **1.25** |
| **C13 Today Page** | M | 5 | L | M | L | **1.25** |
| **D1 Continuous Self-Audit** | M | 5 | M | L | L | **1.25** |
| **B2 Custom Schemas** | M | 4 | M | M | L | **1.0** |
| **D2 Adversarial Self-Play** | M | 4 | M | L | L | **1.0** |
| **D3 Belief Triangulation** | M | 4 | M | L | L | **1.0** |
| **D16 Calibration Tracking** | M | 4 | M | M | L | **1.0** |
| **D8 Honest Day** | M | 4 | M | L | L | **1.0** |
| **E13 Commitments** | M | 4 | L | M | L | **1.0** |
| **D14 Cross-Domain Insight** | M | 4 | M | L | L | **1.0** |
| **C6 Morning Briefing** | M | 4 | M | L | L | **1.0** |
| **C15 Quick-Capture Modes** | M | 4 | M | L | L | **1.0** |
| **C18 Backfill Importer** | M | 4 | M | M | L | **1.0** |
| **D13 Anomaly Detection** | M | 3 | L | L | L | **1.5** |
| **A2 Body Memory** | M | 4 | M | H | L | **0.67** |
| **Comp-1 Living Self-Model** | L | 5 | M | M | L | **0.63** |
| **B3 Workflow Recorder** | L | 5 | H | M | L | **0.42** |
| **E5 Memory Inheritance** | M | 3 | M | M | H | **0.5** |
| **E1 Federation (read-only)** | L | 4 | H | M | L | **0.33** |
| **D7 LoRA** | XL | 3 | H | M | L | **0.13** |

## Bundles by Leverage

### Bundle 1 — Quick Wins (ship in 1 quarter)
*Total effort: ~20 days. Total value: very high. Ships the architecture's "soul."*

C3 · C5 · C4 · D10 · D11 · D15 · D17 (small first-week version) · D19 · C17 · A8 (preview format) · E9 · C16 · D6 · C19 Demo Mode · E22 · B8 Recipe App · Comp-15 Calibration-Aware (depends on D16 minimal version)

**Deliverable**: A fully-functional Total Recall that demos 5 of the top-10 demoable ideas on day-1 and 3 more by week-2. **This bundle alone is the public launch.**

### Bundle 2 — Platform & Continuous Cognition (next quarter)
*Total effort: ~40 days. Establishes Total Recall as a platform.*

B1 · B2 · B4 Triggers · B6 Permissions · B7 Isolation · B11 Fork-Sync · B16 Hot-reload · B17 Composition · B18 Sunset · A1 · D1 · D2 · D3 · D16 · D17 (full) · C13 Today · C18 Importer

**Deliverable**: User-installable apps + the kernel actively maintaining and questioning its own beliefs.

### Bundle 3 — Compositions (third quarter)
*Total effort: ~30 days. Ships emergent product behaviors.*

Comp-1 Living Self-Model (full) · D8 Honest Day · D14 Cross-Domain · D13 Anomaly · E13 Commitments · C6 Morning Briefing · A2 Body Memory · A12 Question Garden · D4 Slow-Thinking · D9 Counter-Examples

**Deliverable**: The kernel exhibits *characteristic behaviors* not just features.

### Bundle 4 — Workflow Recorder & Compositions (fourth quarter)
*Total effort: ~30 days. Highest-effort/highest-payoff atoms.*

B3 Workflow Recorder · B15 Per-App Voice · A4 Skill Coach · D5 Multi-Agent · E12 Council Mode · D18 Catalog-of-Selves · E20 Conscious-Unconscious Boundary

### Deferred / Future
E1 Federation, E2 Cross-Vault Citations, E5 Inheritance, B12 GUI App Builder, D7 LoRA, A6 Multi-User Household, Comp-11 Models-of-Others, Comp-14 Memory Cathedral (composite of long-payoff)

## Risk Map — Tripwires

Things that, if mishandled, could *kill the product* even if individual features work.

1. **Capture Friction Death** — If Comp-7 (frictionless capture: C5+C11+C15) feels heavy, the vault stays empty and no other feature has data to work on. **Mitigation**: ship capture *first*, then add features that consume it.
2. **Empty-Vault Death Zone** — Users open a barren dashboard, churn before week 1. **Mitigation**: C19 Demo Mode + C16 Empty-Vault First-Run + A14 Decision Backfill + D20 Day-Zero Hypothesis Seeding. Make day-1 dense.
3. **Nagging Spiral** — D13 Anomaly, E14 Atrophy, C6 Morning Briefing, D17 Hypothesis Pool all risk becoming pestering. **Mitigation**: D15 Quiet Hours + C17 Surface Diet ship *before* any of those proactive features.
4. **Slop Accumulation** — Without D1+D3+D9, the vault grows but loses signal. **Mitigation**: ship D1 Continuous Self-Audit in Bundle 2, not later.
5. **Surveillance Vibes** — D17 "I think you work best 9-11am" can feel creepy. **Mitigation**: framing always shows *evidence count* and *user can refute*. Calibration is the antidote — the kernel saying "I might be wrong" defuses creepiness.
6. **Sovereignty Theater** — If we lean on "sovereign" marketing without delivering federation (E1), it's hollow. **Mitigation**: ship E1 read-only mirrors in Bundle 4. Don't over-promise meanwhile.
7. **Emotional Mishandling** — A9 Mourning, E5 Inheritance, E17 Reflective Mode touch grief/death/mental-health. **Mitigation**: make all user-initiated only. Never auto-detect grief. Never market as therapy.
8. **Demo-Reality Gap** — Comp-1 Living Self-Model looks magical in demo; reality requires sustained vault use. **Mitigation**: C19 Demo Mode is honest about being demo data.
9. **Engineering Distraction** — B3 Workflow Recorder and D7 LoRA are intellectually seductive, expensive, and not in early bundles. **Mitigation**: defer explicitly; revisit only after Bundle 1+2 land.

## Highest-Leverage Single Idea

**Comp-15 Calibration-Aware Recommendation (Leverage 5.0)** has the rare property of being:
- Cheap (S effort)
- High-value (5)
- Universally low-risk
- Composable on top of any other recommendation surface
- A *single unique selling point* no other AI product can match (LLMs cannot honestly cite their own track record)

**Recommendation**: even if we ship nothing else, ship Comp-15 in Bundle 1. It's the **first AI product that's allowed to say "I might be wrong about this — here's my recent track record"**, and that single property does enormous PR work.

## Pass 6 Refinement Log

### Pass 6 — 2026-05-21 — Effort, Risk, Leverage
- Scored **40 atomic ideas** (S/M/L/XL effort, value 1-5, Tech/UX/Phil risk).
- Calculated leverage scores; ranked top-15.
- Grouped scored ideas into **4 sequential bundles** mapped to quarters: Quick Wins → Platform → Compositions → Workflow Recorder. Plus an explicit Deferred list.
- Identified **9 tripwires** with mitigations — risks that could kill the product even with working features. The most acute are Capture Friction Death, Empty-Vault Death Zone, and Nagging Spiral.
- Surfaced single highest-leverage idea: **Comp-15 Calibration-Aware Recommendation** (Leverage 5.0). Probably the strongest single shippable.
- Catalog unchanged in count (81 atoms + 15 comps + 4 narratives); the contribution this pass is **structure for execution**.

---

---

# Pass 7 — Promotion Candidates

Three ideas (well, three idea-bundles) are ripe to leave this catalog and enter the standard `/project-management` SWE Lifecycle as their own `docs/projects/in-progress/<slug>/` epics with PRD + Architecture + Dev Plan + Tracker.

## Promotion 1 — Project: Quiet Companion (Public Launch Package)

**Target directory**: `docs/projects/in-progress/quiet-companion-launch/`
**Estimated effort**: ~20 days (one quarter)
**Source**: Bundle 1 from Pass 6
**Narrative**: Narrative A — *"Total Recall thinks at night so you can think clearly by day."*

### One-paragraph PRD summary
Ship the public-launch bundle of Total Recall: a kernel that makes its **continuous cognition legible** and its **surface respectful**. The package includes seven low-effort, high-leverage features that together produce four day-1 ahas, three week-2 ahas, and zero nagging behaviors. Capture is one keystroke; provenance is one click; nightly synthesis is automatic; the kernel cites its calibration when it suggests anything. The bundle deliberately excludes the platform (apps), the heavy compositions (Living Self-Model), and the deferred infrastructure (federation) — those land in subsequent quarters. Success criterion: a fresh-install user can demo five distinct "wait, no other AI does that" moments within 10 minutes, and uses the system continuously for 30 days without uninstalling.

### Scope (atoms)
**Capture & surface (the foundation)**:
- C5 Inline Memory Candidates · C11 +1 Hotkey · C15 Quick-Capture Modes · C16 Empty-Vault First-Run · C19 Demo Mode

**Daily ritual**:
- D6 REM Consolidation · E9 Vault Diffing · A8 Annual Letter (preview/format only — full version arrives Year 1)

**Provenance**:
- C3 Provenance Pane · C4 Dream Cycle Live View · D10 Inference Receipts · C10 Belief Genealogy (minimal version)

**Manners**:
- D15 Quiet Hours · C17 Surface Diet · D19 Disagreement-as-Signal

**Differentiator** (depends on a minimal D16):
- Comp-15 Calibration-Aware Recommendation · D16 Calibration Tracking (minimal subset on testable claims only)

**Bridging**:
- D11 Future-Self Letters · E22 Vault Anniversary · A14 Decision Backfill Conversation · D20 Day-Zero Hypothesis Seeding

### Out of scope
- App platform (next quarter)
- Full Living Self-Model (depends on this; ships after)
- Federation, inheritance, workflow recorder

### Success metrics
- 4 day-1 ahas verified in scripted demo
- 30-day retention after fresh install (target ≥ 60%)
- Comp-15 visible on every actionable recommendation surface
- No proactive notification fires during user-declared quiet hours

---

## Promotion 2 — Project: The Honest Mind (Cognitive Differentiator)

**Target directory**: `docs/projects/in-progress/honest-mind/`
**Estimated effort**: ~30 days
**Source**: Bundle 2 + Bundle 3 calibration-aligned atoms; centered on Comp-1
**Narrative**: Narrative B — *"An AI brain that knows what it doesn't know."*

### One-paragraph PRD summary
Ship the **Living Self-Model** (Comp-1) and the cognitive substrate that makes it possible. The kernel maintains a queryable, calibrated, self-correcting graph of its beliefs about the user — including its own track record. This is the single most novel composition in the catalog: D17 Hypothesis Pool (the kernel's hunches) + D1 Continuous Self-Audit (testing them) + D16 Calibration (scoring them) + D3 Belief-Graph Triangulation (cross-referencing them). The product output is an "About Me" surface where users see *what the kernel believes about them, with confidence scores, and what it's been wrong about lately*. Success criterion: any informed visitor agrees no other AI product can honestly produce this surface, and the kernel demonstrably improves its calibration over a 90-day window.

### Scope (atoms)
- D1 Continuous Self-Audit
- D2 Adversarial Self-Play (constrained)
- D3 Belief-Graph Triangulation
- D9 Counter-Example Generator
- D14 Cross-Domain Insight Mining
- D16 Calibration Tracking (full)
- D17 Hypothesis Pool (full)
- A1 Decision Vault (depends on D1)
- A12 Question Garden
- C13 Today Page (consumes most of the above)
- Comp-1 Living Self-Model (the composition target)

### Out of scope
- Federation (sharing self-model across vaults)
- Models of other people (Comp-11)
- LoRA training (D7) deferred

### Success metrics
- "About Me" page displays ≥ 20 calibrated beliefs by week 4
- Brier score visible and improving on testable subset
- ≥ 70% of hypotheses receive user feedback (accept / refute) within 14 days of generation
- D1 audits surface at least one supersedes-worthy update per week

---

## Promotion 3 — Project: Sovereign App Platform

**Target directory**: `docs/projects/in-progress/sovereign-app-platform/`
**Estimated effort**: ~40 days
**Source**: Thread B (B1-B19), Bundle 2's platform half
**Narrative**: Narrative D — *"Your own AI brain — and your own AI apps."*

### One-paragraph PRD summary
Define and ship the **Sovereign App Platform**: a contract, installer, and runtime that lets any user or third party publish an installable Total Recall app — vault subtree + skill bundle + workflow + schema — distributed as a git repo, installed in one command, and run inside the user's sovereign brain without code. Apps declare their schemas, permissions, triggers, voice, and dependencies; the kernel enforces isolation by default and lets users fork without losing upstream updates. Ship three reference apps (Recipe Journal, Reading Queue, Freelance Client Tracker) as proof of architecture and as the canonical authoring examples. Success criterion: a non-engineer can install an existing app and have it producing value in under 60 seconds; an interested third party can author a new app from scratch in under an hour using only markdown and the manifest.

### Scope (atoms)
- B1 App Manifest & Installer
- B2 Custom Schemas
- B4 Trigger Fabric
- B6 Permissions Model
- B7 App Isolation
- B11 Fork-as-Sync
- B13 App Telemetry as Memory
- B14 Reputation as Memory (minimal — public reviews only)
- B15 Per-App Voice
- B16 Hot-Reloadable Workflows
- B17 App Composition
- B18 Sunset Protocol
- B19 Workflow-Only Apps (lightweight variant)
- B8 Reference App: Recipe Journal
- B9 Reference App: Reading Queue
- B10 Reference App: Freelance Tracker

### Out of scope
- B3 Workflow Recorder (separate project; depends on platform but is its own beast)
- B12 In-Dashboard App Authoring (GUI builder — Q4 at earliest)
- Marketplace economics / billing
- E1 Federation between vaults (separate epic)

### Success metrics
- `npx total-recall install <name>` works end-to-end with zero post-install steps
- Three reference apps installed in 30s each on a clean vault
- App-author quick-start docs let a third party publish a working app in < 60 minutes
- Apps respect declared permissions; cross-app reads require grant

---

## Recommended Sequence

1. **Q1** — Promotion 1 (Quiet Companion). Ships the public face. Validates capture-first hypothesis.
2. **Q2** — Promotion 2 (Honest Mind). Builds the cognitive substrate that *needs* the Quiet Companion's vault content to be interesting.
3. **Q3** — Promotion 3 (Sovereign App Platform). With public traction from Q1 and differentiation from Q2, the platform invites third-party developers.
4. **Q4** — Workflow Recorder + Compositions (Bundle 4 from Pass 6).

The remaining catalog (Deferred from Pass 6, plus Comp-12 Personal Web, Comp-14 Memory Cathedral, federation, inheritance) stays in this Ideation Vault until pulled.

## Pass 7 Refinement Log

### Pass 7 — 2026-05-21 — Promotion Candidates
- Identified **3 promotion candidates** for the standard `/project-management` SWE Lifecycle. Each is sized as a quarter-scale epic with clear scope, out-of-scope, atoms, and success metrics.
- **Project 1 — Quiet Companion**: public-launch bundle. ~20 days. Validates capture + surface + manners.
- **Project 2 — Honest Mind**: cognitive differentiator. ~30 days. Centers on Comp-1 Living Self-Model.
- **Project 3 — Sovereign App Platform**: turns the product into a platform. ~40 days. Three reference apps included.
- Recommended sequence Q1 → Q2 → Q3 → Q4. Each project depends on the previous for vault content / narrative.
- Catalog atoms unchanged (81). The contribution this pass is **promotion readiness**: each of the 3 candidates has a one-paragraph PRD summary that can drop straight into a real PRD.md.
- Next step (Pass 8) is the **Validation Pass** — read the whole document end-to-end, fix contradictions, verify lever coverage, confirm scannability. After that, hand off the three promotion candidates to `/project-management`.

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
