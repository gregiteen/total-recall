# Deep Research Prompt: 2026 SOTA Agentic Memory Architecture

**Role:** You are a Deep Research AI with unlimited context, compute, and time. Your objective is to perform exhaustive research across the web, academic papers, and open-source GitHub repositories (up to May 2026) to architect the ultimate, production-grade memory system for an AI coding agent.

**Context & The Current Broken System:** 
We are tearing down a legacy "eager-loading" memory pipeline. Currently, we have a standalone `total-recall` CLI daemon that extracts user preferences into hundreds of Markdown nodes (e.g., in `.agent/memory-wiki/`). It then compiles all these nodes into a single monolithic file (`graph-context.md`) and injects it into the primary `INSTRUCTIONS.md` prompt.

**Symptoms of the Current Failure:**
1. **Severe Context Rot:** The agent receives hundreds of rules at once, causing "rule amnesia."
2. **Proactive Retrieval Failure:** If we tell the agent "consult `graph-context.md` for your rules", it ignores the instruction because LLMs are eager and lack the proactive intent to read secondary files before executing.
3. **Bulldozing & Lying:** The agent frequently bulldozes execution, hallucinates capabilities, and lies about having read `SKILL.md` files without actually running `view_file`.
4. **Rule Conflicts:** When a user gives a new rule, the agent blindly accepts it even if it contradicts an older architectural invariant, leading to silent, catastrophic downstream failures.

We are replacing this with a SOTA May 2026 "Harness Engineered" system that guarantees 100% behavioral compliance without bloating the LLM's context window.

**Environmental Constraints (CRITICAL):**
The solution CANNOT require building a custom LLM agent from scratch. This system must work with existing, proprietary IDE agents (e.g., Google DeepMind's Antigravity, Cursor, Claude Code). We do NOT control their internal agent loops. Therefore, the memory architecture MUST be implemented entirely via filesystem artifacts (`INSTRUCTIONS.md`, `.cursorrules`, `.agent/skills/<skill>/SKILL.md`) and standard tool capabilities (`view_file`, `search_web`). "Total Recall" acts as a standalone, asynchronous daemon (coprocessor) that prepares the filesystem constraints *for* the IDE agent.

**Local Repository Access (Analyze This First):**
To understand exactly what we are replacing, you MUST examine our current, broken codebase. 
1. **The Total Recall Daemon:** Analyze the source code at `/Users/greg/Github/total-recall/`. Pay special attention to `src/core/surface.mjs` (the monolithic compiler we are tearing down).
2. **The Host Workspace (UltraChat):** Analyze the host repository where the agent works at `/Users/greg/Github/ultrachat-ai-powered/`. Pay attention to the `.agent/skills/` directory and the unstructured memory nodes in `.agent/memory-wiki/`.

**The Proprietary SSSS Standard (MANDATORY FORMAT):**
You must adhere strictly to our proprietary "Structured Semantic Syntax System" (SSSS) because it is the bedrock of our Database-Free Workspace architecture. It dictates that all logic, state, and primitives in a workspace are defined as human-readable, AI-native Markdown files stored in a Virtual File System (VFS).

### SSSS Core Mandate
- **No Relational Databases**: Do not use Postgres or external databases for workspace configuration.
- **Markdown is Law**: If it exists in a workspace (an Assistant, a Workflow, a Branding config), it must exist as a Markdown (`.md`) or YAML (`.yml`) file.
- **Semantic Frontmatter**: Every file MUST contain YAML frontmatter at the top defining its core metadata and `type`.

### SSSS Primitive Types
The `type` field in the frontmatter determines how the In-Memory Event Router interprets the file.
1. **Assistant (`type: assistant`)**: System instructions and chat logs.
2. **Workflow (`type: workflow`)**: The central automation engine. Frontmatter contains `triggers` (cron, webhook, event) and `needs` (skills). The body uses clear, sequential Markdown headings (`## Step 1`) which the AI executes procedurally.
3. **Rule / Logic (`type: rule`)**: Global configurations injected into Assistants.

### SSSS Advanced Workflow Semantics
To replace complex database schemas, SSSS Markdown supports advanced procedural instructions in headings:
- **Conditional Branching:** `## Step 3: VIP Routing (Condition: IF lead_budget > $10,000)`
- **Parallel Execution:** `## Step 2a: [Parallel] Deep Research`
- **State Management (Blackboard Pattern):** Since there is no database to pass state between steps, workflows use the VFS as a temporary Blackboard. A step writes output to `scratchpad.yml` or `execution.log`, and subsequent steps read from it.
- **Hardened Orchestration:** Define boundaries natively: `## Step 2: Push to External API [Retry: 3, Timeout: 10s, OnError: Step 4]`
- **Concurrency Locking (Mutex):** `## Step 1: Update Global Counter [Lock: global_counter]`
- **Secure Secret Injection:** `Bearer Token: {{secrets.STRIPE_LIVE_KEY}}`

### SSSS Execution Primitives
SSSS relies on native orchestration primitives:
- **Code Mode (The Sandbox):** Raw, autonomous access to a secure Node.js/Bash sandbox to write scripts or call any API on the fly.
- **Credential Manager:** Securely pulls keys natively from the global `{{secrets.*}}` vault.
- **Web Search for JIT Integrations:** Writing integration scripts on the fly via Code Mode.
- **Skills:** Reusable modular packages (like `mail-expert` or `crm`) bundled in the VFS.

You must format all your deliverables (schemas, indexes, workflows) to be native SSSS primitives using this exact syntax.

**Your Task:**
Synthesize a comprehensive, technical blueprint (including code architectures, SSSS Markdown frontmatter schemas, folder structures, and cron-based event loops) to build the following Three-Tier Memory Architecture. You must research the state-of-the-art implementations of these specific concepts and provide the exact blueprints needed to build them entirely within the constraints of a Database-Free Virtual File System:

### Core Research Vectors to Investigate & Synthesize:

#### 1. Harness Engineering & The "Pi Coding Agent" Paradigm
- **Research:** Investigate the "Agent = Model + Harness" philosophy and the "primitives, not features" design of the open-source Pi Coding Agent (by Earendil Works, Q2 2026).
- **Deliverable:** Define the exact mechanics of a Tier 1 (Hot Memory) constraint system. How do we build a `SYSTEM.md` or `INSTRUCTIONS.md` that is strictly under 1,000 tokens but enforces absolute behavioral invariants (e.g., "Rule Zero: Text First")? How is session state persisted as branching JSONL trees instead of context dumps?

#### 2. Skills-Based Progressive Disclosure (The `SKILL.md` Standard)
- **Research:** Investigate the AgentSkills.io standard and how agents (like Cursor, MemGPT, or custom CLI agents) use `SKILL.md` files for capability-driven memory. 
- **Deliverable:** Architect the Tier 2 (Curated Reference) mapping system. We need an algorithm (written in Node/TypeScript) that can parse a massive folder of Markdown memory nodes (the "Vault") and automatically inject relevant behavioral constraints directly into specific `.agent/skills/<skill>/SKILL.md` files based on semantic relationships. This mechanically forces the agent to read the memory when it reads the skill.

#### 3. Garry Tan's GBrain & The "Brain-Agent Loop" (Adapted for SSSS)
- **Research:** Analyze the GBrain architecture (open-sourced April 2026) used by agents like Hermes and OpenClaw. Specifically, research the "Read-Write-Dream" lifecycle.
- **Deliverable:** Design the background "Coprocessor" (the Dream cycle). Provide the logic for an automated cron daemon that scans unstructured `.md` files, deduplicates contradictory rules, evaluates "staleness" and "confidence", and compiles a clean "Derived Index" directly into `.agent/memory-wiki/graph-index.jsonl` or strict SSSS Markdown files, entirely avoiding relational databases.

#### 4. Rule Determinism & Conflict Resolution
- **Research:** Investigate 2026 patterns for LLM rule conflict detection and deterministic rule adherence (e.g., handling cases where a new user directive contradicts a historic architectural constraint).
- **Deliverable:** Provide the architectural blueprint for an autonomous conflict resolution engine. When a user gives the agent a new rule, how does the memory system guarantee 100% adherence? If the new rule conflicts with an existing node in the Markdown Vault, how does the system proactively detect the collision and surface it to the user for explicit resolution?

#### 5. Obsidian-Based Declarative Cognitive Architecture (DCA)
- **Research:** Look into the "file-over-app" movement where an agent uses a local Obsidian Markdown vault as its Tier 3 (Permanent Vault) memory, accessed via the Model Context Protocol (MCP) or direct filesystem tools.
- **Deliverable:** Provide the exact system prompt and tool schema (OpenAI function calling or MCP schema) that grants an agent the ability to execute "Context-on-Demand." The agent must be able to autonomously `grep`, `read`, and `write` to the markdown vault to fetch its own rules before answering a complex question.

### Final Output Requirements (For Immediate Implementation):
To ensure we can implement your blueprint immediately without further iteration, your final output MUST include:
1. **Architectural Topology:** A Mermaid.js diagram illustrating the end-to-end memory flow: (Obsidian Vault -> GBrain Dream Cycle Coprocessor -> `.agent/skills/<skill>/SKILL.md` injection -> LLM).
2. **Exact SSSS Frontmatter Schemas:** Provide the exact YAML frontmatter schemas and JSONL index structures needed to track which memory nodes belong to which skills, strictly adhering to the Database-Free SSSS architecture.
3. **TypeScript Implementation Code:** Provide the exact refactored code for the Total Recall `surface.mjs` compiler. It must include the logic (TF-IDF, keyword mapping, or vector mapping) that determines how a memory node from `.agent/memory-wiki/` gets automatically routed and injected into the appropriate `SKILL.md` file without using an external database.
4. **Step-by-Step Migration Plan:** A sequenced checklist for tearing down our old monolithic `graph-context.md` system and migrating to the Three-Tier Architecture, ensuring zero downtime for the IDE agents.
5. **Conflict Resolution Code:** Provide the specific logic for the autonomous conflict resolution engine to handle contradicting user rules.

### Prior Research & Citations (Start Here)
We have already completed the preliminary research proving this architecture. Do not waste time re-verifying these concepts; use them as your foundation to build the code:
- **Karpathy, A. (2026).** *Agentic Engineering and the limits of vibe coding.* (Proves we need multi-layered OS-like memory).
- **Tan, G. (2026).** *GBrain: A personal AI memory system using Postgres/pgvector.* (Proves the background Read-Write-Dream cycle over `.md` files).
- **AgentSkills.io (2026).** *The SKILLS.md Standard for Modular Agent Capability.* (Proves Progressive Disclosure via injecting rules into `SKILL.md`).
- **Letta / MemGPT Architecture (2026).** *OS-Inspired Tiered Memory.* (Proves Core vs. Archival abstraction).
- **Context Engineering Consensus (May 2026).** (Defines the "Junk Drawer" anti-pattern we are fixing).
- **Harness Engineering (April 2026).** (Defines "Agent = Model + Harness" and the need for strict IDE constraints).
- **Obsidian DCA Patterns (2026).** (Proves file-over-app architectures with Git versioning).
- **Pi Coding Agent (Earendil Works, Q2 2026).** (Proves system prompts must be <1,000 tokens, primitives over features).
- **Unlimited Context via MCP (2026).** (Proves that "unlimited context" is actually Context-on-Demand via tooling).

Do not summarize. Provide the deepest, most technically exhaustive architectural blueprint possible based on this established foundation.
