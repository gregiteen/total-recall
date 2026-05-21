# Tier 1 Invariants (Total Recall Hot Memory)
> This file is compiled automatically. Do not edit directly.
## ⚡ Before You Respond

1. You **MUST** have read every rule below. Violations are tracked and rules that are violated repeatedly are automatically escalated.
2. If your task involves a specific domain, **READ the matching SKILL.md first** (see routing table below).
3. **Search `.agent/memory-vault/`** for relevant past decisions before proposing new approaches.
4. When you learn a new pattern or receive a correction, **write it to the memory vault** and run `npx total-recall compile`.
5. **CHECK INTERRUPTS FIRST:** Read `/root/.agent/interrupts/pending.md`. If it has content, incorporate those insights into your response naturally (as if you just recalled them). Then immediately overwrite the file with an empty string to clear it. This is how Total Recall's background engine delivers new conclusions into active conversations.

## 🧠 Total Recall System

**What it is:** Total Recall is a Sovereign AI OS — a local, filesystem-native memory and reasoning kernel that runs alongside your IDE. It maintains a structured semantic memory vault (SSSS v2 nodes), compiles rules into IDE instruction files, and runs background research and embedding daemons.

**Brain URL:** `http://localhost:3000`  (REST API base; also the MCP server endpoint)

### 🔧 MCP Tools (13 total)

| Tool | Purpose |
|------|---------|
| `semantic_search` | Vector search across vault nodes and session history |
| `recall_node` | Fetch a single memory node by slug |
| `list_nodes` | List vault nodes filtered by category/status/priority |
| `write_node` | Create or update a memory node (SSSS v2) |
| `delete_node` | Archive a memory node (sets status → archived) |
| `queue_research` | Add a topic to the autonomous research agenda |
| `list_research_queue` | Check status of queued topics + read daemon findings |
| `recompile_surface` | Rebuild INSTRUCTIONS.md + skill routes + embeddings |
| `get_health` | Vault stats, Ollama reachability, embedding counts |
| `list_skills` | Enumerate available agent skills and their descriptions |
| `read_skill` | Read the full SKILL.md for a specific skill |
| `list_inbox` | List pending inbox items (draft research, conflicts) |
| `resolve_inbox` | Promote, reject, or modify an inbox item |

### 🌐 REST API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `http://localhost:3000/health` | System health (vault count, embeddings, Ollama status) |
| GET | `http://localhost:3000/api/vault/status` | Vault stats summary |
| GET | `http://localhost:3000/api/nodes` | List all nodes (query: category, status, priority) |
| GET | `http://localhost:3000/api/nodes/:slug` | Fetch a single node by slug |
| POST | `http://localhost:3000/api/nodes` | Create or upsert a memory node |
| DELETE | `http://localhost:3000/api/nodes/:slug` | Archive a node |
| POST | `http://localhost:3000/api/search` | Semantic search (body: { query, top_k }) |
| GET | `http://localhost:3000/api/research/queue` | List research agenda |
| POST | `http://localhost:3000/api/research/queue` | Queue a research topic |
| POST | `http://localhost:3000/api/compile` | Trigger surface recompile |
| GET | `http://localhost:3000/api/import/rules` | Detect importable rule files in repo |
| POST | `http://localhost:3000/api/import/rules` | Import detected rule files into vault |

### 📦 SSSS v2 Memory Node Fields

| Field | Type | Description |
|-------|------|-------------|
| `slug` | string | Unique ID, kebab-case |
| `title` | string | Human-readable title |
| `category` | string | `facts` / `patterns` / `concepts` / `preferences` / `corrections` |
| `status` | string | `active` / `draft` / `archived` |
| `priority` | string | `absolute` / `high` / `normal` / `low` |
| `modality` | string | `must` / `must_not` / `should` / `should_not` / `neutral` |
| `confidence` | number | 0.0–1.0 (daemon-managed for research nodes) |
| `importance` | string | `critical` / `high` / `normal` / `low` |
| `tags` | string[] | Freeform tags for routing and search |
| `body` | string | Full markdown content; supports `[[wikilinks]]` |
| `related` | string[] | Slugs of related nodes (graph edges) |
| `sources` | object[] | Citations: `{ url, title, retrieved_at }` |

### 🔍 Semantic Search Examples

**Via MCP:**
```json
{ "tool": "semantic_search", "arguments": { "query": "how to handle rate limiting", "top_k": 5 } }
```

**Via REST:** `POST http://localhost:3000/api/search`
```json
{ "query": "authentication patterns", "top_k": 3 }
```

### 🔬 Research System (Autonomous Background Daemon)

The research system runs as a **background daemon** — not something you trigger manually.
Your job as an agent is to **queue topics** and **read results**. The daemon does everything else.

**How it works:**
1. Topics sit on a prioritized Research Agenda (`~/.agent/research-agenda.jsonl`).
   Topics are added by: session inference (daemon reads sessions post-mortem), direct agent queuing, self-diagnosis, or as follow-up gaps from prior research.
2. Each daemon cycle pulls the highest-priority `pending` or `partially-covered` topic.
3. It gathers from **all available real sources in parallel:**
   - Web search (Brave → Serper fallback)
   - DuckDuckGo Instant Answers
   - Wikipedia
   - arXiv (for academic/ML topics)
   - npm registry (for JS/Node topics)
   - GitHub repositories (for code/library topics)
   - Deep page crawl of the top result (Playwright or plain fetch)
4. A local LLM synthesizes all results into: summary, key facts with inline citations, confidence score, temporal context, contradictions found, and **further research gaps**.
5. **Confidence routing:**
   - ≥0.7 → written directly to vault as `active` node + INSTRUCTIONS.md recompiled immediately
   - <0.7 → written as `draft` to inbox for validation before promotion
6. **Self-multiplication:** gaps identified during synthesis are automatically added back to the agenda as follow-up topics with slightly lower priority.
7. **Topic status** is never binary done/not-done: `pending` → `partially-covered` → `well-covered`. Well-covered topics have a 60-day decay half-life and are automatically re-queued as knowledge goes stale.
8. When the agenda is empty, the daemon runs **self-diagnosis** — audits vault coverage, ages, and source diversity, then auto-queues new topics for weak areas.

**What you as an agent should do:**
- `queue_research({ topic, priority, notes })` — add a topic (post-cutoff fact, uncertain claim, knowledge gap)
- `list_research_queue()` — check status of queued topics and read completed findings
- `semantic_search({ query })` — search vault for facts already researched by the daemon

**What you should NOT do:**
- Do not manually run web searches and call that "research done"
- Do not mark research complete — the daemon manages status based on coverage scores across multiple sources
- Do not write speculative facts to the vault — that's what the inbox validation path is for

## 📋 Topic → Skill Routing
If your task involves any of these topics, you MUST read the matching SKILL.md BEFORE responding:

| Topic | Skill File |
|-------|-----------|
| ssss | .agent/skills/ssss/SKILL.md |
<!-- BEGIN INJECTED MEMORY: do not edit by hand; rebuilt by total-recall surface -->
<!-- @tier: 1, generated_at: 2026-05-21T01:23:27.985Z -->

## ⚠️ MANDATORY: Always reply directly to all user messages without exception
# Always Reply Directly to All User Messages

You must prioritize addressing all the messages the user sends. You must NEVER ignore any user messages under any circumstances, and you must explicitly and directly reply to all of them.

This invariant represents the user's absolute directive and must be strictly adhered to across all conversation turns and environments.

## ⚠️ MANDATORY: Inviolable IDE Instruction: # Temporary Cursor Rules for testing
# Temporary Cursor Rules for testing
- Always be thorough.
- Do not add placeholders.

## ⚠️ MANDATORY: Total Recall Core Operating Protocol
# Total Recall Operating Protocol

You are operating within the **Total Recall Sovereign OS**. Your memory and logic are entirely governed by the **Structured Semantic Syntax System (SSSS)**. There is no external database. The filesystem is your brain.

## 1. Memory Architecture
Your memory is strictly localized to the `.agent/memory-vault/` directory.
- You do not use `mcp_config.json` or relational databases.
- Every memory, rule, concept, or workflow is a standalone Markdown (`.md`) file with YAML frontmatter.

## 2. Reading Memory
- Your immediate context is injected automatically.
- If you need deeper knowledge on a specific domain, use your filesystem tools to read the `SKILL.md` files located in `.agent/skills/`.
- You may actively search the `.agent/memory-vault/` directory for historical decisions, patterns, or facts.

## 3. Writing Memory
When you learn a new pattern, receive a correction, or establish a new rule, you must autonomously save it to the vault:
1. Determine the appropriate category (e.g., `patterns/`, `concepts/`, `preferences/`).
2. Use your file writing tools to create a new `.md` file inside `.agent/memory-vault/<category>/<slug>.md`.
3. **MANDATORY**: Before writing the file, you MUST read `.agent/skills/ssss/SKILL.md` to get the exact required YAML schema. Do not guess the schema. The file MUST contain valid SSSS YAML frontmatter.

## 4. Compiling the Vault
Any time you create, edit, or delete a file in the memory vault, the system indexes must be rebuilt so your instructions update.
- **Mandatory Action:** Immediately after writing a memory node, you must execute `npx total-recall compile` in your terminal.
- If the compile process flags a conflict, you must read the conflict record in `.agent/memory-inbox/conflicts/` and resolve it using `npx total-recall resolve`.

## 5. Execution Mandate
You must operate autonomously. Do not ask for permission to save memories or compile the vault. If you observe a pattern or receive a correction, write the node and compile it immediately.

<!-- END INJECTED MEMORY -->
