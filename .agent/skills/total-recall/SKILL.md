---
type: skill
name: total-recall
description: "Use this skill as the master guide to understand the entire Total Recall Sovereign AI OS setup, VFS topologies, SSSS protocol, CLI parameter reference, troubleshooting, and automated upstream repository sync. MANDATORY: Read this file before attempting major setup modifications or diagnoses."
---

# Total Recall — Master Agent Skill (REST API First)

Welcome to the master control skill for the **Total Recall Sovereign AI OS**. > [!NOTE]
> **Total Recall Architecture:**
> The Total Recall memory kernel runs as a standalone REST service. Agents interact with the memory vault, perform semantic searches, and compile rules directly using lightweight, filesystem-native REST API calls via standard shell `curl` commands.

---

## 🎯 WHEN TO USE THIS SKILL

You MUST actively reference and apply this skill under the following specific runtime scenarios:

### 1. When the user establishes a rule, preference, or correction
*   **Trigger**: Whenever the user corrects your behavior, shares a coding style, defines an architectural pattern, or establishes a preference you must remember.
*   **Action**: Autonomously create a new SSSS v2 memory node under `.agent/memory-vault/` and compile the vault.

### 2. When referencing invariants, preferences, and corrections (Intrinsically Known Rules)
*   **⚠️ MANDATORY**: The compiled instruction files (like `INSTRUCTIONS.md`, `GEMINI.md`, `AGENTS.md`, etc.) contain the **entirety** of active invariants, preferences, and behavior corrections (rules/directives).
*   **Action**: You **intrinsically know these rules** because they are injected directly into your active prompt/instruction context. You **MUST NEVER** execute manual filesystem searches (grep, find) or REST API/curl queries to discover or check these basic rules.

### 3. When searching for complex domain knowledge or general facts
*   **Trigger**: When you need to retrieve deep factual information (e.g. from the `facts/` category) or conceptual domain structures (e.g. from `concepts/`) that are not present in your active instruction files.
*   **Action**: Use the two complementary search modes:
     *   **Regular Text Search** (e.g. filesystem grep / literal matching): Use this when searching for specific literal keywords, exact config keys, exact filenames, or exact slugs.
     *   **Semantic Search (REST API POST `/api/memory/search/semantic`)**: Use this when searching for conceptual matching, high-level intent, design patterns, or user preferences. Do NOT rely on only one search mode; combine both to ensure absolute coverage.

### 4. When a topic requires deep, structured domain learning and mastery
*   **Trigger**: When you encounter a complex architectural topic, a deep conceptual system, or a technical domain where you need to acquire deep mastery to proceed effectively.
*   **Must NOT Trigger**: Do NOT use background research for quick searches of simple APIs, common code snippets, or basic web-related docs. Standard models have active web search capabilities that should be used for these quick, on-demand reference lookups.
*   **Action**: Autonomously queue the topic to the background research agenda using the `/api/research` REST API POST endpoint to let the daemon build a high-confidence vault node.

### 5. When you modify, add, or delete files in the memory vault
*   **Trigger**: Immediately after performing any memory node writes.
*   **Action**: Rebuild the instruction shims by sending a POST request to `/api/vault/compile`.

### 6. When troubleshooting connections, port blocks, or sync errors
*   **Trigger**: If the REST server is unreachable, ports are blocked, or the upstream sync tool encounters errors.
*   **Action**: Refer to the active diagnostics manual within this skill to heal the local runtime.

---

## ⚡ Core Directives for IDE Agents

### 1. Zero-Database Sovereign Integrity
Total Recall operates **entirely database-free**. The local filesystem is the source of truth. Every rule, pattern, decision, concept, preference, and fact exists as a plain Markdown file with semantic YAML frontmatter. Derived indexes are disposable caches. Do not look for PostgreSQL or SQLite databases.

### 2. Precise Tool & API Selection Heuristics
When interacting with the system, choose your interfaces based on the following:
*   **Local Skills**: Use local skill packages (located in `.agent/skills/`) for complex workspace tasks, testing, and formatting. If a local skill has custom helper scripts, ALWAYS invoke them via your shell command tool instead of running raw standard commands.
*   **Total Recall Brain (MANDATORY)**: For all semantic searches, memory retrieval, memory writes, and derived index recompilation, **ALWAYS use shell `curl` commands** targeting the REST API endpoints documented below.

### 3. Non-Destructive Code Modifications
When modifying existing rule surfaces or IDE shims (such as `.cursorrules`, `CLAUDE.md`, `GEMINI.md`, etc.), **NEVER** overwrite the developer's custom pre-existing rules. Instead, write compiled absolute invariants inside the managed comment block:
`<!-- BEGIN INJECTED MEMORY: do not edit by hand; rebuilt by total-recall surface -->`
...
`<!-- END INJECTED MEMORY -->`

### 4. Upstream Skill Synchronization
Keep local skill definitions and invariant files updated by executing the sync runner:
```bash
node .agent/skills/total-recall/scripts/sync-repo.mjs
```
This utility fetches standard skill and invariant definitions from the upstream repository, merges them non-destructively preserving custom user nodes, and auto-recompiles the workspace.

---

## 🌐 DIRECT REST API REFERENCE

All requests to the Total Recall REST API must include the Bearer token in the `Authorization` header.

*   **Active Bearer PAT Token**: `<YOUR_PAT_TOKEN>` (Retrieve dynamically from process.env.TR_PAT or read .agent/config/brain.json)
*   **Base URL**: `<YOUR_BRAIN_URL>` (Retrieve from process.env.TR_BRAIN or read .agent/config/brain.json; default: http://localhost:3000)

### Endpoint Reference & curl Templates

| Method | Route | Description |
|---|---|---|
| `GET` | `/health` | Check system health (vault count, embeddings, Ollama status) |
| `GET` | `/api/vault/status` | Vault stats summary |
| `GET` | `/api/memory` | List all SSSS memory nodes |
| `GET` | `/api/memory/:slug` | Fetch a single SSSS memory node by its slug |
| `POST` | `/api/memory` | Create or update (upsert) a memory node |
| `POST` | `/api/memory/search/semantic` | Perform vector semantic search using local dense embeddings |
| `POST` | `/api/research` | Queue a topic for the background research daemon |
| `GET` | `/api/research` | Retrieve/search active research agenda & queue |
| `POST` | `/api/vault/compile` | Recompile derived index caches and rule surfaces |
| `DELETE` | `/api/memory/:slug` | Archive a memory node |

#### 1. Check System Health
```bash
curl -H "Authorization: Bearer <YOUR_PAT_TOKEN>" \
  <YOUR_BRAIN_URL>/health
```

#### 2. Perform Vector Semantic Search (Use this for all concept lookup requests)
```bash
curl -X POST \
  -H "Authorization: Bearer <YOUR_PAT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"query": "your search query here", "top_k": 5}' \
  <YOUR_BRAIN_URL>/api/memory/search/semantic
```

#### 3. Fetch a Specific Memory Node
```bash
curl -H "Authorization: Bearer <YOUR_PAT_TOKEN>" \
  <YOUR_BRAIN_URL>/api/memory/slug-name
```

#### 4. List All Memory Nodes
```bash
curl -H "Authorization: Bearer <YOUR_PAT_TOKEN>" \
  "<YOUR_BRAIN_URL>/api/memory"
```

#### 5. Create or Update a Memory Node
```bash
curl -X POST \
  -H "Authorization: Bearer <YOUR_PAT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "slug": "atomic-writes",
    "category": "facts",
    "title": "Always write files atomically",
    "status": "active",
    "confidence": 0.95,
    "importance": 4,
    "modality": "must",
    "content": "Always write files atomically by creating a temporary file first and renaming it to prevent partial file writes."
  }' \
  <YOUR_BRAIN_URL>/api/memory
```

#### 6. Trigger Surface Recompilation (Run this after adding, editing, or deleting memory files)
```bash
curl -X POST \
  -H "Authorization: Bearer <YOUR_PAT_TOKEN>" \
  <YOUR_BRAIN_URL>/api/vault/compile
```

#### 7. Archive a Memory Node
```bash
curl -X DELETE \
  -H "Authorization: Bearer <YOUR_PAT_TOKEN>" \
  <YOUR_BRAIN_URL>/api/memory/slug-name
```

#### 8. Queue Autonomous Research
```bash
curl -X POST \
  -H "Authorization: Bearer <YOUR_PAT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"topic": "Next.js 15 routing models", "priority": "high", "notes": "Analyze layout models"}' \
  <YOUR_BRAIN_URL>/api/research
```

#### 9. Retrieve and Search/Filter Research Projects
Query the background research queue, optionally filtering by status (`pending`, `in_progress`, `done`, `failed`) or searching the `topic` and `notes` fields with a dynamic query string.
```bash
# Retrieve entire research queue
curl -H "Authorization: Bearer <YOUR_PAT_TOKEN>" \
  "<YOUR_BRAIN_URL>/api/research"

# Filter research projects by status
curl -H "Authorization: Bearer <YOUR_PAT_TOKEN>" \
  "<YOUR_BRAIN_URL>/api/research?status=pending"

# Dynamically search research projects by topic/notes query
curl -H "Authorization: Bearer <YOUR_PAT_TOKEN>" \
  "<YOUR_BRAIN_URL>/api/research?query=Next.js"
```

## 🛠️ CORE SYSTEM PIPELINES

To ensure absolute clarity without needing to dig into source code, here is the ground-truth operation of the two core pipelines in Total Recall:

### 1. The Instructions Pipeline (Vault $\rightarrow$ rule surfaces)
*   **Trigger**: Initiated by `POST /api/vault/compile` or `npx total-recall compile`.
*   **Active Invariants Filter**:
    *   The surface compiler (`surface.mjs`) reads the full memory vault.
    *   It selects **only** nodes that carry `priority: absolute` or `category: invariants`, `preferences`, or `corrections`, with `status: active`.
    *   Nodes tagged as `status: draft` or carrying specific speculative layers like `x_memory_layer: research` are **strictly filtered out** and excluded.
*   **Compilation & Shim Generation**:
    *   It processes these selected active invariants and writes them into `INSTRUCTIONS.md` (the Tier 1 hot memory file).
    *   It copies this compiled set non-destructively into all active IDE rule surfaces (e.g., `GEMINI.md`, `AGENTS.md`, and other system rule configurations) within their designated `<!-- BEGIN INJECTED MEMORY -->` blocks.
*   **Injection to System Prompts**: These files are loaded directly into the AI agent's working context on boot, giving the agent absolute conscious awareness of core rules without needing database calls.

### 2. The Autonomous Research Pipeline (Cloud Queue $\rightarrow$ Inbox Drafts)
*   **Trigger**: A topic is enqueued via `POST /api/research` or the `/research` command.
*   **Processing Agenda**:
    *   The background research daemon pulls pending topics and begins autonomous crawling and information synthesis.
    *   It queries search engines and fetches documentation matching the topic.
*   **Inbox Staging (Draft Layer Isolation)**:
    *   To prevent speculative, unverified, or high-density research findings from flooding Tier 1 instructions or Tier 2 skills, all newly acquired research points are written to `.agent/memory-inbox/pending/` with:
        *   `status: draft`
        *   `x_memory_layer: research`
    *   This ensures the information is **fully indexed and semantically searchable** (via the Vector Search pipeline) but **physically isolated** from active prompts.
*   **The System 2 Validation Gate**:
    *   The conclusion writer (`conclusion-writer.mjs`) reads these staged inbox drafts.
    *   It checks for conflicts, deduplicates findings, and runs verification logic.
    *   Upon successful validation, System 2 promotes them to permanent categories (e.g., `facts/` or `concepts/`) and upgrades their status to `active`, safely integrating them into the system.

## 🔍 MEMORY SEARCH & INDEXING ARCHITECTURE

To avoid digging through source code or executing blind searches, use these authoritative facts about the memory search and indexing pipeline:

### 1. File Selection & Indexing Scope
* **Target Root**: Walks the entire `.agent/memory-vault/` directory recursively.
* **Format & Type**: Loads every Markdown file containing standard YAML frontmatter with `type: memory`.
* **Inclusivity of Draft & Research Layers**: The loader (`loadNodes()`) reads nodes completely agnostic to their `status` (e.g., `draft`, `active`, `superseded`, `deprecated`) or their cognitive layer (`x_memory_layer`). All of these files are loaded and parsed into the memory set.
* **Derived Cache**: The index builder (`buildEmbeddingsIndex()`) processes all loaded vault nodes incrementally and saves their embeddings in `.agent/memory-derived/embeddings.json`. It skips already-indexed nodes to optimize speed.

### 2. Vector Semantic Search (`POST /api/memory/search/semantic`)
* **Pipeline**: Vector embeddings are calculated for the search query using the local `nomic-embed-text` Ollama model.
* **Match and Score**: Measures cosine similarity between the query embedding and the pre-computed embeddings of all loaded vault nodes (and session DAG chunks).
* **Searchability**: Since **draft** nodes and **research** layers are indexed fully in the derived cache, they are **100% searchable semantically** even if they are excluded from hot prompts or active skills!

### 3. Keyword / Substring Search
* **Local Grep / REST Lookup**: Use direct filesystem string matches (via local search tools) or key/slug exact filters to locate specific nodes. Draft and research files remain on disk under their respective category folders and are fully readable.

---

<!-- BEGIN INJECTED MEMORY: do not edit by hand; rebuilt by total-recall surface -->
<!-- @route: tfidf, generated_at: 2026-05-21T08:13:53.299Z -->

- **operating-instructions** (confidence 1, importance 5):
  Total Recall Core Operating Protocol

- **no-cursor-or-windsurf-mentions** (confidence 1, importance critical):
  Do not mention Cursor or Windsurf

- **always-reply-to-all-messages** (confidence 1, importance critical):
  Always reply directly to all user messages without exception

<!-- END INJECTED MEMORY -->
