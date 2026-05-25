# Total Recall — Codebase & Runtime Architecture Reference

This reference manual maps the architecture, VFS directory topologies, and background processes of the **Total Recall Sovereign AI OS**.

---

## 1. Directory Structure & VFS Topology

Total Recall relies on a strict, database-free directory layout under `.agent/` in the workspace root or the user's home directory.

```
.agent/
├── config/                    # System configurations
│   ├── brain.json             # Loaded brain URL and optional PAT token
│   └── clients.json           # Connected IDE clients registry
├── memory-vault/              # TIER 3: Local Sovereign Vault (Git-versioned)
│   ├── invariants/            # Absolute invariants (modality: must/must_not)
│   ├── patterns/              # Best practices and structural workflows
│   ├── anti-patterns/         # Taboos and coding patterns to avoid
│   ├── preferences/           # Custom style and project-specific preferences
│   ├── decisions/             # Permanent structural/architectural decisions
│   ├── concepts/              # Domain-specific terminology and definitions
│   └── facts/                 # Verified facts and deep research outputs
├── memory-derived/            # Ephemeral compiled indexes (Disposable)
│   ├── graph-index.jsonl      # Flat cache of active memory nodes
│   ├── memory-layers.jsonl    # Surfaced cognitive layers per node
│   ├── skill-routes.jsonl     # Output mapping of nodes routed to skills
│   └── semantic.index         # Dense vector embeddings binary file
├── memory-inbox/              # Inbox & Staging area
│   ├── pending/               # Raw captured memories awaiting checking
│   └── conflicts/             # Quarantined contradicting node pairs
├── sessions/                  # Branching JSONL conversation trees
├── skills/                    # TIER 2: Active Domain Skill Packages
│   ├── ssss/                  # SSSS protocol management skill
│   ├── project-management/    # Issues, sprint planning, and tracking skill
│   └── total-recall/          # Master control skill (this skill package)
└── interrupts/                # Event-driven messaging loop
    └── pending.md             # Active interrupts injected into next user turn
```

---

## 2. The Three-Tier Surfacing Engine

Surfacing rules efficiently without bloating the LLM prompt context is performed using a tiered progressive disclosure engine:

1. **Tier 1: Hot Invariants (`INSTRUCTIONS.md` and IDE shims)**:
   * **Scope**: Inviolable system directives (`priority: absolute` + `status: active`).
   * **Latency**: 0ms (pre-loaded directly into system prompt).
   * **Volume**: Strictly capped under 1,000 tokens.
2. **Tier 2: Relevant Domain Skills (`SKILL.md` packages)**:
   * **Scope**: Semantic matches filtered by TF-IDF & memory layer weights.
   * **Latency**: ~100ms (loaded dynamically when an agent targets a skill).
   * **Volume**: Capped at 7 active rules per skill.
3. **Tier 3: The Cold Memory Vault (`.agent/memory-vault/`)**:
   * **Scope**: Complete sovereign knowledge graph.
   * **Latency**: ~500ms (accessed via high-performance vector search REST API).
   * **Volume**: Unlimited files.

---

## 3. Core Runtime Systems & Loops

### 3.1 The Surface Compiler (`surface.mjs`)
The compiler compiles memory nodes from `.agent/memory-vault/` and inserts them into appropriate surfaces:
*   Collects all active absolute invariants.
*   Calculates TF-IDF vector weights across skills and maps active nodes dynamically.
*   Injects the routing results into individual `SKILL.md` files.
*   Consolidates the preamble, system guides, routing tables, and invariants into `INSTRUCTIONS.md`.
*   Propagates the consolidated block into all available IDE rules files (`.cursorrules`, `CLAUDE.md`, `GEMINI.md`, etc.) non-destructively, preserving user custom content.

### 3.2 The Autonomous Research Daemon (`daemon-loop.mjs`)
The background daemon cycles continuously to fetch, analyze, and synthesize knowledge:
1.  **Read Agenda**: Selects the highest priority item from `~/.agent/research-agenda.jsonl`.
2.  **Multi-source Crawl**: Executes web searches, DDG Instant Answers, Wikipedia lookups, arXiv fetches, and deep webpage scraping in parallel.
3.  **Local Synthesis**: Invokes local LLMs to generate a markdown facts summary with citations.
4.  **Inbox Routing**: Logs drafts into the inbox (`memory-inbox/pending/`). If confidence $\ge 0.7$, writes node to `memory-vault/` and triggers compilation; otherwise, quarantines to human inbox review.
5.  **Multiplication**: Adds any missing gaps identified during synthesis back to the agenda.
