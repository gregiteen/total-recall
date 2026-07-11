---
type: project_document
title: TR_CORE_FOCUS — Product Requirements
tags: ["project-management", "TR_CORE_FOCUS", "total-recall", "memory", "dream", "daemon"]
timestamp: 2026-07-10T20:00:00Z
---

# TR_CORE_FOCUS — Product Requirements

> **One-liner:** Total Recall is a portable personal memory system that personalizes any IDE/agent with *your* knowledge, skills, and secrets — including write, sleep (dream), read, and agent-enqueued background work — not a general-purpose AI OS.

## Problem

TR accumulated sovereign-OS scope: nested skill packages, portfolio sync, multi-agent cosplay, always-full research queues, dashboard control-plane bloat. That diluted what users need:

> Open any IDE on any machine and get **my rules, my preferences, my repo knowledge, my skills, my secrets** — and a memory that **consolidates and can run deferred work** without living inside one chat.

## Product thesis

**Total Recall = personal AI identity + memory substrate**

| Pillar | What it is |
|--------|------------|
| **Memory (write)** | SSSS vault via CLI (`remember` / `forget`); session ingest |
| **Memory (sleep)** | **Dream** — consolidation, conflict, surface recompile, prune |
| **Memory (read)** | `recall` + compiled instruction surfaces |
| **Memory (async)** | **Daemon task queue** — agents set durable tasks for *anything* (policy-gated) |
| **Instructions** | Compiled IDE surfaces (`INSTRUCTIONS.md`, connect targets) |
| **Portability** | Global brain + per-project overlay; filesystem SSOT |
| **Repo knowledge** | Project brain + **openwiki** (ships with TR) |
| **Skills catalog** | Registry + deploy user skills across repos (not nested mega-skills) |
| **Secrets & keys** | Encrypted store, rotate, usage/cost — never in vault markdown or shims |

### Memory loop (canonical)

```text
write path:   remember / session ingest
sleep path:   dream  (consolidate → conflict → compile → prune)
read path:    recall + compiled surfaces
async path:   daemon tasks (agent- or user-enqueued; open envelope + policy)
```

Dream is **core memory hygiene**, not OS garnish. Without sleep, TR is a file dump plus explicit remembers. Without an open async path, agents either block the chat or invent side channels.

## Non-goals (explicitly cut or demote)

| Cut / demote | Why |
|--------------|-----|
| Full “Sovereign AI OS” as primary positioning | Dilutes portable memory product |
| Nested agent skills *inside* total-recall (`tr-ssss`, `tr-research`, …) | One skill only; helpers are modules/scripts |
| Always-on “keep queue never empty / keep local LLM busy” | Noise, cost, trust risk |
| Proactive self-filling research as default | Research is opt-in / agent-enqueued |
| Portfolio sync, System2, self-diagnosis as default daemon categories | Cosplay; power-mode only if ever |
| Host-app features (telephony, CRM, etc.) | Belong in host app / Festech |
| Replacing `@ssss/cli` | TR is a host consumer |

### Explicit *keep* (revised 2026-07-10)

| Keep as core | Why |
|--------------|-----|
| **Dream** | Consolidation = real memory; deterministic phases first |
| **Session ingest** | Conversations → substrate without manual paste |
| **Surface recompile** | What agents actually see |
| **Open daemon tasks** | Agents enqueue *anything* under capability policy |
| **User-enqueued research** | Long-horizon acquisition when intentional |
| **Skill deploy scripts + agents.yml** | Operational modules only |

## Primary user journeys

1. **Personalize this IDE** — `init` + `connect <ide>` injects compiled instructions without clobbering local rules.
2. **Remember / recall** — CLI-first memory ops; vault is SSOT.
3. **Dream** — manual `dream` or scheduled daemon system-task consolidates sessions → vault integrity → surfaces.
4. **Defer work** — agent or user runs `task add` (or API) so the daemon executes later under policy; results land in vault/inbox/daily as specified.
5. **Open a repo** — project brain + openwiki scaffold; skills adapt to repo context.
6. **Deploy a skill to a repo** — registry deploys; optional rewrite of triggers from openwiki + stack.
7. **Secrets** — store/rotate/audit; never in openwiki or instruction shims.
8. **Cross-repo skill inventory** — where is skill X installed?

## Success metrics

- Fresh machine: brain + IDE connect in < 5 minutes
- New repo: `init` → openwiki + project brain + instruction inject
- Zero nested agent-skills under `total-recall/skills/` for non-TR operations
- Secrets never appear in compiled instruction shims
- Skills catalog answers “where is skill X installed?”
- Dream cycle completes without LLM (ingest + compile + prune + conflict path)
- Agent can enqueue a custom task that survives process restart and is not silently skipped
- Default daemon does **not** autopilot research or keep LLM busy forever

## Relationship to other systems

| System | Role |
|--------|------|
| **ssss** (`@ssss/cli`) | Mutation/validation kernel; TR is a host |
| **Total Recall** | Memory loop, instructions, secrets, skill deploy, openwiki, IDE glue, task queue |
| **openwiki** | Human/agent docs per brain and per project; ships with TR |
| **Host apps** (host app, Festech) | Product codebases that *use* TR; not owned by TR |

## Decisions log (product)

| Date | Decision |
|------|----------|
| 2026-07-10 | Product = portable memory + instructions + openwiki + skills + secrets — not AI OS |
| 2026-07-10 | Nested `tr-*` skills → operational modules only; jettison non-runtime bloat |
| 2026-07-10 | **Dream is core memory**, not optional cut |
| 2026-07-10 | **Agents may enqueue daemon tasks for anything** via open envelope + capability policy |
| 2026-07-10 | Closed `dispatchTask` category zoo is technical debt; replace with executor registry |
