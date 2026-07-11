---
type: project_document
title: TR_CORE_FOCUS — Architecture
tags: ["project-management", "TR_CORE_FOCUS", "daemon", "dream", "tasks"]
timestamp: 2026-07-10T20:00:00Z
---

# TR_CORE_FOCUS — Architecture

## Target layout (conceptual)

```text
~/.agent/                          # brain root (portable)
  memory-vault/                    # SSSS nodes (SSOT)
  openwiki/                        # personal knowledge wiki (ships with TR)
  secrets/ or config/secrets.enc   # encrypted secrets (NOT vault markdown)
  skills-registry/                 # catalog of user skills + install map
  sessions/                        # ingested conversation logs
  scheduler/queue/                 # durable daemon task envelopes (.md)
  memory-inbox/                    # drafts, conflicts, pending promotions
  memory-derived/                  # indexes, surfaces cache
  daily/ (or vault/daily/)         # dream cycle notes
  config/                          # brain.json, budget, agents.yml, security

<repo>/.agent/
  memory-vault/                    # project overlay
  openwiki/                        # auto-scaffolded repo docs
  skills/                          # deployed skills for THIS repo only
  # compiled inject fragments as configured

<repo>/CLAUDE.md, AGENTS.md, ...   # connect targets (inject blocks only)
```

## Nested skills → operational modules (shipped state)

**Rule:** Only root `total-recall/SKILL.md` is an IDE agent skill.

```text
.agent/skills/total-recall/   (or package modules path)
  SKILL.md                    # sole skill
  modules/
    skill-deploy/scripts/     # find / install / scan skills (runtime)
    agents/agents.yml         # headless CLI agent registry
  openwiki/                   # templates
  references/ssss-reference.md
```

Removed from package as agent skills / bulk docs: `tr-ssss`, `tr-research`, nested ssss dumps, research module docs. Prefer `@ssss/cli` for schema mutations.

## Memory architecture (four paths)

```text
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│  remember   │     │ session      │     │ agent / CLI     │
│  forget     │     │ ingest       │     │ task add        │
└──────┬──────┘     └──────┬───────┘     └────────┬────────┘
       │                   │                      │
       ▼                   ▼                      ▼
       ══════════ vault / sessions / queue ══════════
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
       dream          daemon         compile
       (sleep)        (async)        (on write /
                                      dream tick)
          │              │              │
          └──────────────┼──────────────┘
                         ▼
              recall + INSTRUCTIONS surfaces
```

### 1. Write path

- `npx total-recall remember|forget` → vault nodes + async surface compile
- REST `POST /api/memory` when CLI unavailable
- No secrets in vault nodes

### 2. Sleep path (Dream) — **core**

**Code today:** `src/core/dream.mjs`, CLI `total-recall dream`

| Phase | Name | Job | LLM? |
|-------|------|-----|------|
| 0 | Ingest | `scanAndIngest` sessions | No |
| 1 | Light sleep | Scan modified vault | No |
| 2 | REM | Score, conflict, promote/decay candidates | No (target) |
| 3 | Deep sleep | `compileSurface` | No |
| 4 | Lucid | Optimizer proposals (cleanup / stale) | Optional |
| 5 | Prune | Logs, drafts, queue archive, transient files | No |

**Known gap (must close):** REM currently has empty `candidates` (“simulate”). Real loop: **session/inbox → candidates → conflict gate → writeNode / quarantine**.

Dream is also registered as a **system task** on the daemon (periodic), not only a manual CLI.

### 3. Read path

- `recall` hybrid search (RRF)
- Compiled surfaces / inject blocks for IDEs
- openwiki for long-form human/agent docs (not SSSS invariants)

### 4. Async path (Daemon + open tasks) — **core**

**Code today:** `src/core/daemon-loop.mjs`, `src/cli/daemon.mjs`, `scheduler/queue/`

**Problem today:** `dispatchTask` is a closed category switch (research phases, System2, remote-vault-sync, post-mortem, …). Unknown categories → **silent skip**. That blocks “agents set tasks for anything.”

**Target model:** durable **task envelope** + **executor registry** + **capability policy**.

#### Task envelope (target schema)

```yaml
# scheduler/queue/<slug>.md frontmatter (conceptual)
type: task
slug: "extract-session-abc"
status: pending | in_progress | completed | failed | cancelled
priority: low | normal | high | absolute
origin:
  agent: "claude-code"
  session_id: "..."
  created_at: "ISO-8601"
intent: "Extract durable decisions from session abc into project vault"
kind: memory | research | maintenance | system | custom   # soft label only
payload:
  session_path: "..."
  # free-form structured inputs
capabilities:
  - vault:write
  - net:none
  - shell:none
  - llm:optional
budget:
  max_wall_ms: 120000
  max_tokens: 0
  max_tool_calls: 20
schedule:
  run_at: null          # immediate
  # or cron / after_idle
result:
  land: vault | inbox | daily | log
  promote_via: remember | draft
system: false           # true for dream, recompile, prune
```

#### Executor registry (target)

| Executor id | Role | Default on |
|-------------|------|------------|
| `dream` | Full sleep cycle | yes (system) |
| `session-ingest` | Scan IDE logs | yes (system) |
| `surface-compile` | Recompile surfaces | yes (system) |
| `prune` | Storage hygiene | yes (system) |
| `research` | User/agent-enqueued research pipeline | yes if enqueued; **no proactive fill** |
| `memory-extract` | Session → candidate nodes | yes |
| `custom` / generic | Intent + allowed tools under sandbox | yes with strict default caps |

Power-mode only (off by default): remote-vault-sync, system2-deliberation, self-diagnosis, proactive knowledge acquisition.

#### Policy (non-negotiable)

1. **Default deny** dangerous caps (`shell`, broad FS, external post)
2. **Budget** from `budget.yml` gates LLM/net jobs
3. **Dream not starved** — system tasks have reserved priority band
4. **No silent skip** — unknown executor → `failed` with reason
5. **Memory claims use write path** — custom tasks that “remember” must go through node write + compile, not raw file hacks
6. **Proactive enqueue off by default** — agents/users enqueue; daemon does not invent infinite work

#### Agent / CLI surface (target)

```bash
npx total-recall task add "<intent>" [--cap vault:write] [--priority high] [--payload json]
npx total-recall task list [--status pending]
npx total-recall task show <slug>
npx total-recall task cancel <slug>
npx total-recall dream          # system sleep now
npx total-recall daemon start|stop|status
```

REST: extend beyond research-only:

- `POST /api/tasks` — enqueue envelope  
- `GET /api/tasks` — list/filter  
- Keep `POST /api/research` as convenience that creates a `kind: research` task  

## Skill deploy model

1. Global **registry** (id, version, source, tags, install map)
2. `total-recall skill list|register|deploy|status`
3. Deploy copies/adapts into `<repo>/.agent/skills/<id>/`
4. Optional adapt pass from project openwiki + stack detect

## Secrets model

- Separate from memory vault
- Encrypt at rest; metadata list without values
- `secret set|get|list|rotate|audit` + usage JSONL
- Conformance: never inject into surfaces/openwiki

## Openwiki shipping

- Templates ship with TR; `init` ensures global + project openwiki
- Wiki = durable docs; vault = SSSS memory nodes; optional ingest summaries only

## IDE personalization

Keep `connect` matrix; compile vault → inject. Lean-by-default shims (no spray-all clients). Skills deploy additive to connect.

## Demotion / keep map (revised)

| Surface | Target |
|---------|--------|
| **dream** | **Core** — finish REM candidates; system task |
| **session ingest** | **Core** |
| **open task queue** | **Core** — envelope + registry + policy |
| **research (enqueued)** | Core *when requested*; not autopilot |
| fact-seeker proactive fill | Off by default / power |
| remote-vault-sync, system2, self-diagnosis | Power or remove from default loop |
| nested tr-* skills | Done — modules only |
| research/ssss module docs dump | Done — jettisoned |
| frontend OS control plane | Thin memory/secrets/usage later |

## Key source files (current)

| Path | Role |
|------|------|
| `src/core/dream.mjs` | Sleep cycle |
| `src/cli/dream.mjs` | Manual dream CLI |
| `src/core/daemon-loop.mjs` | Continuous worker (needs envelope refactor) |
| `src/cli/daemon.mjs` | start/stop/status |
| `src/core/daemon-control.mjs` | PID / process control |
| `src/core/scheduler.mjs` | Queue load / next task |
| `src/core/session-watcher.mjs` | IDE log ingest |
| `src/core/research-queue.mjs` | Research-specific queue (fold into tasks) |
| `src/core/surface.mjs` | Compile surfaces / shims |
| `src/core/steering.mjs` | Conflict detect / quarantine |
