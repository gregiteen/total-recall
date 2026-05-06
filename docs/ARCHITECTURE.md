# Architecture Guide

> Deep dive into how Total Recall works under the hood.

## Table of Contents

- [Mental Model](#mental-model)
- [Multi-Repo Architecture](#multi-repo-architecture)
- [Data Flow](#data-flow)
- [Module Map](#module-map)
- [IDE Adapter Architecture](#ide-adapter-architecture)
- [Surface Sync System](#surface-sync-system)
- [Concurrent Handoff Model](#concurrent-handoff-model)
- [Signal Scoring Deep Dive](#signal-scoring-deep-dive)
- [Co-Processor Pipeline](#co-processor-pipeline)
- [Dream Cycle](#dream-cycle)
- [System 2 Research](#system-2-research)
- [Multi-Agent Pipeline](#multi-agent-pipeline)
- [Wiki Node Lifecycle](#wiki-node-lifecycle)

---

## Mental Model

Think of Total Recall as a **brain with four distinct memory systems**, similar to how neuroscience describes human memory:

| Human Memory | Total Recall Layer | What It Stores | Durability |
|---|---|---|---|
| **Episodic Memory** | Layer 1: Episodes | "Remember that session where we fixed the auth bug?" | Permanent, append-only |
| **Associative Recall** | Layer 2: FTS5 Index | "This reminds me of..." (fast lookup) | Disposable, rebuilt on demand |
| **Semantic Memory** | Layer 3: Wiki Graph | "I know that templates are banned" | Durable, versioned, linked |
| **Muscle Memory** | Layer 4: Behavioral Surface | Instinctive rules — no thinking required | Compiled, always in context |

The key insight: **each layer serves a different purpose**, and information flows upward through compilation, not downward through queries.

```
Episodes → [Dream Daemon] → Wiki Nodes → [Surface Compiler] → System Prompt
          (consolidation)                  (ranking + compilation)
```

## Multi-Repo Architecture

Total Recall operates at two levels: **per-repo** (local `.agent/` directory) and **global** (`~/.total-recall/`).

```
~/.total-recall/                          # Global brain (cross-repo)
├── config.mjs                            # Repo registry + global settings
│   └── repos: ['~/Github/project-a',     # All known repos
│                '~/Github/project-b']
├── threads/                              # Thread-to-project tags
│   └── <conversation-id>.tag             # Which repo/project this thread belongs to
├── thread-registry.md                    # All threads across all repos
└── knowledge/                            # Global knowledge (user-level)

~/Github/project-a/                       # Per-repo memory
├── .agent/                               # Local brain (repo-scoped)
│   ├── memory-wiki/                      # Knowledge graph for this repo
│   ├── memory/episodes/                  # Session archive for this repo
│   └── learning/learning.db              # FTS5 index for this repo
└── docs/projects/                        # Project tracking Kanban
    ├── in-progress/                      # Active work
    ├── backlog/                          # Queued
    ├── planned/                          # Designed
    ├── completed/                        # Done
    └── archived/                         # Historical
```

### Repo Registration

`total-recall install` registers a repo in the global brain:

1. Adds the repo path to `~/.total-recall/config.mjs → repos[]`
2. Auto-runs `init` to scaffold `.agent/` and `docs/projects/` if missing
3. Health-checks with `install --list` (🟢 initialized / 🟡 not initialized / ❌ missing)

### Thread Isolation

Every conversation thread is tagged with a project slug via `project-detect.mjs`. The detection heuristic:

1. **Explicit** — user names the project (semantic inference by the LLM)
2. **Open files** — IDE open files match `docs/projects/in-progress/<slug>/`
3. **Git activity** — recent commits touch project directories
4. **Fallback** — `general`

Tags live in `~/.total-recall/threads/<id>.tag`. The thread registry provides cross-repo visibility into all active and historical threads.

### Project Tracking

Each repo has a `docs/projects/` directory with a Kanban-style layout. Projects move between states:

```
planned → backlog → in-progress → completed → archived
```

Each project directory can contain a `*_PROJECT_TRACKER.md` (task ledger), `*_DEVELOPMENT_PLAN.md` (architecture), `HANDOFF.md` (session state), and any related documentation.

## Data Flow

### Write Path (Learning)

When something happens in a session:

```
User says "NEVER use templates" 
    │
    ├─→ [Steering]  Creates wiki node: anti-patterns/no-templates.md
    │                Hot-patches INSTRUCTIONS.md immediately
    │                Appends to USER.md
    │
    ├─→ [Co-Processor] Detects sentiment (negative, intensity 9)
    │                   Logs to daily log
    │
    └─→ [Episode Archive] Session archived as episodes/2026/05/01/session-xxx.md
```

### Read Path (Recall)

When the agent needs to remember:

```
Agent starts new session
    │
    ├─→ IDE auto-injects .agent/rules/graph-context.md (Layer 4)
    │   → "Never use templates" is in the compiled graph surface
    │   → No tool call needed — IDE reads rules/ on every turn
    │
    ├─→ On-demand: `total-recall consult --prompt "..."` 
    │   → Synchronous graph query for immediate context
    │
    └─→ Programmatic search via tr-query
        → Full-text search across all 4 layers
```

### Consolidation Path (Dream)

Background maintenance:

```
Daily Logs ─→ [NREM] ─→ Extract patterns, deduplicate ─→ New wiki nodes
Wiki Nodes ─→ [REM]  ─→ Cross-reference, detect duplicates
Wiki Nodes ─→ [Decay] ─→ Reduce confidence over time
Wiki Nodes ─→ [Prune] ─→ Move zero-access stale nodes to .trash/
Wiki Graph ─→ [Memory] ─→ Regenerate MEMORY.md summary
```

## Module Map

```
src/
├── core/                          # The engine (stateless, testable)
│   ├── index.mjs                  # Public API re-exports
│   ├── utils.mjs                  # YAML parsing, slugify, config loading
│   ├── fts5.mjs                   # SQLite FTS5 search index
│   ├── wiki.mjs                   # Knowledge graph (CRUD, lint)
│   ├── ranking.mjs                # Signal score algorithm
│   ├── surface.mjs                # Behavioral surface compiler + compileSurfaceFromGraph
│   ├── steering.mjs               # Behavioral steering cascade
│   ├── episodes.mjs               # Episode archive operations
│   ├── dream.mjs                  # Dream daemon (NREM/REM/decay/prune)
│   ├── crypto.mjs                 # AES-256-GCM config encryption (PBKDF2 600K)
│   └── sync-prompts.mjs           # Multi-IDE surface sync (Phase 14)
│
├── coprocessor/                   # Real-time background daemon
│   ├── daemon.mjs                 # Main daemon loop (heartbeat-based)
│   ├── inject.mjs                 # ACTIVE CONTEXT injection into system prompt
│   ├── notify.mjs                 # Multi-channel notification dispatcher
│   ├── checks/
│   │   ├── steering.mjs           # Detect "always/never/correct" directives
│   │   ├── sentiment.mjs          # Detect user mood shifts
│   │   ├── relevance.mjs          # Surface related memories
│   │   ├── contradiction.mjs      # Flag conflicting statements
│   │   └── researcher.mjs         # System 2: web-backed fact checking
│   └── watchers/
│       └── antigravity.mjs        # IDE-specific conversation watcher
│
├── notifications/                 # Notification channel adapters
│   └── channels/
│       ├── macos.mjs              # macOS native notifications (osascript)
│       ├── slack.mjs              # Slack webhook
│       ├── discord.mjs            # Discord webhook
│       └── email.mjs              # SMTP email
│
├── agents/                        # Multi-agent orchestration
│   └── switch-memory-pipeline.mjs # 3-agent extraction pipeline
│
├── tests/                         # Node.js built-in test runner (73 tests)
│   ├── utils.test.mjs
│   ├── ranking.test.mjs
│   ├── wiki.test.mjs
│   ├── episodes.test.mjs
│   ├── dream.test.mjs
│   ├── fts5.test.mjs
│   ├── crypto.test.mjs
│   └── watchers.test.mjs
│
templates/                         # Customizable prompt templates
└── prompts/
    ├── archivist.md               # Memory extraction prompt
    ├── synthesizer.md             # Surface compilation prompt
    └── fact-checker.md            # Codebase verification prompt
```

## IDE Adapter Architecture

Total Recall is IDE-agnostic via two adapter interfaces: **Watchers** (input) and **CLI Adapters** (output).

### Watcher Interface

Watchers monitor IDE-specific conversation logs and extract new turns for the co-processor:

```
┌───────────────────────────────────────────────────────────┐
│                    WATCHER INTERFACE                       │
├───────────────────────────────────────────────────────────┤
│                                                           │
│  getLatestTurns()                                         │
│  → Returns: Array<{ role: string, text: string }>         │
│  → Purpose: Extract new conversation turns since last     │
│             check for the co-processor pipeline           │
│                                                           │
│  Available Watchers:                                      │
│  ┌─────────────┬──────────────────────────────────┐      │
│  │ antigravity │ overview.txt (plain text log)     │      │
│  │ claude-code │ ~/.claude/projects/*.jsonl         │      │
│  │ cursor      │ .cursor/ internal DB              │      │
│  │ aider       │ .aider.chat.history.md            │      │
│  │ windsurf    │ .windsurf/ hooks                  │      │
│  │ generic     │ User-specified path + format      │      │
│  └─────────────┴──────────────────────────────────┘      │
│                                                           │
└───────────────────────────────────────────────────────────┘
```

Each watcher lives in `src/coprocessor/watchers/<name>.mjs` and exports a class with `getLatestTurns()`.

### CLI Adapter Interface

CLI Adapters enable the multi-agent pipeline to dispatch work to any CLI-based AI agent:

```
┌───────────────────────────────────────────────────────────┐
│                  CLI ADAPTER INTERFACE                     │
├───────────────────────────────────────────────────────────┤
│                                                           │
│  buildCommand(model, promptFile)                          │
│  → Returns: { binary: string, args: string[] }            │
│  → Purpose: Construct CLI invocation for each agent       │
│                                                           │
│  Built-in Adapters:                                       │
│  ┌──────────┬────────────┬───────────────────────────┐   │
│  │ gemini   │ gemini     │ -p <prompt> --sandbox=no  │   │
│  │ claude   │ claude     │ -p <prompt> --allowedTools│   │
│  │ codex    │ codex      │ <prompt file via stdin>   │   │
│  │ aider    │ aider      │ --message <prompt>        │   │
│  │ copilot  │ gh copilot │ <prompt>                  │   │
│  └──────────┴────────────┴───────────────────────────┘   │
│                                                           │
│  Override all with: agents.default in config              │
│                                                           │
└───────────────────────────────────────────────────────────┘
```

Each adapter handles stdin/stdout piping, model flags, and error extraction for its specific CLI tool.

## Surface Sync System (Phase 20: SyncGraph Architecture)

Phase 20 replaced the legacy section-injection model with a **standalone rule file** approach. Instead of finding and replacing a `## DISTILLED MEMORY` section inside `INSTRUCTIONS.md`, the surface compiler now writes the entire compiled output to `.agent/rules/graph-context.md`. The IDE auto-injects all files in `.agent/rules/` on every turn as hard rules — no tool calls required.

```
┌─────────────────┐     ┌──────────────┐     ┌────────────────────┐
│   Wiki Graph    │────▶│   Surface    │────▶│   Rule File Write  │
│  (Layer 3)      │     │  Compiler    │     │                    │
└─────────────────┘     │  (ranking +  │     │  .agent/rules/     │
                        │  graph mode) │     │  graph-context.md  │
                        └──────────────┘     │                    │
                                              │  IDE reads this    │
                                              │  automatically on  │
                                              │  every turn.       │
                                              └────────────────────┘
```

Additionally, `total-recall consult --prompt "..."` provides **synchronous** graph querying. The prompt is classified (answer/execute/discuss/emergency), the graph is traversed, and the compiled surface is printed to stdout for immediate use.

### Format Strategies

| IDE | File | Strategy | Notes |
|-----|------|----------|-------|
| Antigravity | `.agent/rules/graph-context.md` | Standalone rule file | Auto-injected every turn by IDE |
| Claude Code | `CLAUDE.md` | Symlink detection | If symlink → skip; else section injection |
| Cursor | `.cursor/rules/total-recall.mdc` | MDC file | YAML frontmatter + `alwaysApply: true` |
| Windsurf | `.windsurf/rules/total-recall.md` | Rule file | Self-contained markdown with header |
| Roo Code | `.roo/rules/total-recall.md` | Rule file | Self-contained markdown |
| Continue | `.continue/rules/total-recall.md` | Rule file | Self-contained markdown |

### Detection
The sync system scans for IDE-specific markers (directories and files) to determine which IDEs are active. No configuration needed — detection is automatic.

### Synchronous Consult (CLI)
```bash
# Query the graph for context-aware instructions
total-recall consult --prompt "deploy the API to production"

# Output: compiled surface tailored to "execute" mode
```

## Concurrent Handoff Model

Phase 17 solved the handoff bottleneck: both outgoing and incoming agents can be alive simultaneously.

```
OUTGOING AGENT (/switch)                 INCOMING AGENT (/start)
────────────────────────                 ───────────────────────
Step 1: Write HANDOFF.md ─────────▶ HANDOFF.md available immediately
    │                                        │
    │   (self-sufficient: includes           ▼
    │    session state, next steps,    Priority cascade:
    │    file refs, agent mandates)    1. START.md (if fresh)
    │                                  2. HANDOFF.md ← always available
Step 2: Identity reflection          3. Raw files (legacy fallback)
Step 3: Daily log entry                      │
Step 4: Code quality checks                  ▼
Step 5: repo-expert update            Agent starts working
Step 6: Learning persistence         (no waiting for /switch)
Step 7: Wiki maintenance
Step 8: Memory pipeline (background)
Step 9: Code quality verify
Step 10: Distill START.md ──────────▶ START.md enriches NEXT session
```

### Key Properties
- **HANDOFF.md is Step 1**: Written first, self-sufficient. The incoming agent can start immediately.
- **START.md is Step 10**: Written last (by Gemini Flash distillation). Enriches the next session but is not required.
- **Resilient boot**: `/start` uses a priority cascade. Missing START.md is a warning, not a failure.
- **Zero blocking**: Steps 2-10 are fire-and-forget enrichment. The outgoing agent works at its own pace.

## Signal Scoring Deep Dive

The ranking algorithm determines which wiki nodes appear in the behavioral surface. It's deliberately simple — no ML, no embeddings, just math that maps to human intuition:

```
signal_score = intensity × (access + 1)^0.5 × max(0.1, 0.5^(days / half_life))
```

### The Three Factors

**1. Intensity** (1-10): How emotionally significant was the experience?
- User screams "NEVER DO THIS AGAIN" → intensity 9-10
- User says "nice, that works" → intensity 5-6
- Routine observation → intensity 3-4

**2. Access Factor** `(access + 1)^0.5`: How often is this knowledge retrieved?
- Square root means diminishing returns — 100 accesses isn't 10x more important than 1
- The `+1` ensures even never-accessed nodes get a nonzero factor

**3. Recency Decay** `max(0.1, 0.5^(days / half_life))`: How fresh is this?
- Half-life is type-specific:
  ```
  preference:   90 days  (user tastes change slowly)
  anti-pattern: 60 days  (bad habits are memorable)
  pattern:      30 days  (good patterns need reinforcement)
  concept:      30 days
  decision:     45 days  (decisions are somewhat sticky)
  project:      14 days  (project context ages fast)
  conclusion:   30 days  (research conclusions moderate)
  ```
- The `0.1` floor means nothing ever fully decays — a user preference from 6 months ago still gets 10% weight

### Example Scores

| Node | Intensity | Access | Days Old | Half-Life | Score |
|------|-----------|--------|----------|-----------|-------|
| "Never use templates" | 9 | 12 | 2 | 60 | 9 × 3.6 × 0.98 = **31.7** |
| "Use dark mode" | 5 | 0 | 30 | 90 | 5 × 1.0 × 0.79 = **4.0** |
| "Project X uses Redis" | 4 | 2 | 60 | 14 | 4 × 1.7 × 0.1 = **0.7** |

## Co-Processor Pipeline

The daemon runs on a 15-second heartbeat (configurable). Each tick:

```
┌──────────────────────────────────────────────────┐
│                DAEMON HEARTBEAT                   │
├──────────────────────────────────────────────────┤
│                                                   │
│  1. Poll Watcher → Any new conversation turns?    │
│     └─ Antigravity: reads overview.txt changes    │
│                                                   │
│  2. Extract text from new turns                   │
│     └─ User messages + Model responses            │
│                                                   │
│  3. Run 4 parallel checks:                        │
│     ├─ Steering:      "always/never/correct"?     │
│     ├─ Sentiment:     mood shift detected?        │
│     ├─ Relevance:     FTS5 memory search          │
│     └─ Contradiction: conflicts with wiki?        │
│                                                   │
│  4. Write graph surface to .agent/rules/           │
│     └─ graph-context.md (auto-injected by IDE)    │
│                                                   │
│  5. Fire-and-forget: System 2 Research            │
│     └─ Dispatches Gemini Flash for fact-checking  │
│        (never blocks the main pipeline)           │
│                                                   │
└──────────────────────────────────────────────────┘
```

### Injection Format

The daemon writes to a designated section in the system prompt file:

```markdown
## ACTIVE CONTEXT

> [!TIP]
> **Related Memory**: The user previously expressed strong preference for
> zero-shot generation over templates (intensity: 9/10).

> [!IMPORTANT]
> **Fact Check**: GPT Image 2 supports 2048px native resolution.
> DALL-E is completely deprecated. (Verified via web search)
```

This section is volatile — it's overwritten each cycle with the most relevant context.

## Dream Cycle

The dream cycle runs at `/start` (session boot) and mimics sleep consolidation:

### NREM (Slow-Wave Sleep)
- Reads daily logs since the last dream
- Extracts entries by category: critical-failures, user-preferences, patterns, wiki
- Deduplicates against existing wiki nodes (by slug matching)
- Counts raw → unique ratio to measure information density

### REM (Rapid Eye Movement)
- Walks the entire wiki graph
- **Duplicate detection**: Normalizes titles and finds nodes with identical concepts
- **Stale detection**: Flags nodes past their type-specific medium threshold
- **Orphan detection**: Finds nodes with no `related` links and no `[[backlinks]]`

### Confidence Decay
- Scans all wiki nodes with `last_verified` dates
- Applies type-specific thresholds:
  - `high → medium` at the first threshold (e.g., 30 days for patterns)
  - `medium → low` at the second threshold (e.g., 90 days for patterns)
- Access or re-verification resets the clock

### Pruning
- Only prunes nodes that are: `confidence: low` AND `access_count: 0` AND past 2× their medium threshold
- Moves to `.trash/` — never hard-deletes
- This is the most conservative operation in the system

### MEMORY.md Regeneration
- Reads the full wiki graph
- Groups by category, sorts by signal score
- Writes a human-readable summary with top-5 per category
- Uses confidence emoji: 🟢 high, 🟡 medium, 🔴 low

## System 2 Research

Named after Kahneman's "Thinking, Fast and Slow" — this is the slow, deliberate reasoning system.

### Detection

The researcher scans model responses for two types of claims:

**Uncertain claims** (8 patterns):
- "I think...", "I believe...", "IIRC..."
- "probably", "might be", "should be..."
- "if I remember correctly", "not sure but..."

**Verifiable technical claims** (7 patterns):
- Version numbers: "X uses v2.3"
- API references: "the endpoint is /api/v1/..."
- Architecture: "X uses Y internally"
- Deprecation: "X was deprecated in..."

### Research Pipeline

```
Claim detected → Gemini Flash (web search) → Parse JSON result
                                                    │
                                     ┌──────────────┼──────────────┐
                                     │              │              │
                                  verified      contradicted    inconclusive
                                     │              │              │
                              create wiki     create wiki       skip
                              node (TIP)    node (CAUTION)
                                     │              │
                              inject into    inject + notify
                             ACTIVE CONTEXT   via macOS alert
```

If Gemini fails (timeout/rate-limit), falls back to Codex CLI with `--search`.

## Multi-Agent Pipeline

During `/switch` (session handoff), three agents work in parallel:

### Archivist (Gemini Flash)
- Reads the conversation overview.txt
- Creates a structured episode in `episodes/YYYY/MM/DD/`
- Extracts new wiki nodes from the conversation
- Updates USER.md and SOUL.md if new preferences/rules emerged

### Synthesizer (Claude)
- Reads the entire wiki graph
- Ranks all nodes by signal score
- Generates a new DISTILLED MEMORY block
- Writes to `.agent/rules/graph-context.md` (auto-injected by IDE)

### Fact-Checker (Codex)
- Reads all wiki nodes
- For each technical claim, verifies against the current codebase
- Updates `last_verified` for confirmed claims
- Sets `confidence: low` for contradicted claims

All three run via `Promise.allSettled` — one failure doesn't block the others.

## Wiki Node Lifecycle

```
                    ┌─────────┐
    User directive  │ Created │  (confidence: high)
    or extraction   └────┬────┘
                         │
              ┌──────────┼──────────┐
              │          │          │
         accessed    not accessed   │
         (score ↑)   (score ↓)    fact-checked
              │          │          │
              │     ┌────┴────┐    verified
              │     │ Decayed │    (last_verified
              │     │ to      │     reset)
              │     │ medium  │
              │     └────┬────┘
              │          │
              │     ┌────┴────┐
              │     │ Decayed │
              │     │ to low  │
              │     └────┬────┘
              │          │
              │     ┌────┴────────────┐
              │     │ access > 0?     │
              │     │  YES → keep     │
              │     │  NO + 2× stale  │
              │     │  → .trash/      │
              │     └─────────────────┘
              │
         still active
         (stays in surface)
```

---

*Total Recall is MIT licensed. Built for the [AgentSkills.io](https://agentskills.io) ecosystem.*
