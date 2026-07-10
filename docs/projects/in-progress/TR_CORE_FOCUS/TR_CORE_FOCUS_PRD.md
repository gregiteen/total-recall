---
type: project_document
title: TR_CORE_FOCUS — Product Requirements
tags: ["project-management", "TR_CORE_FOCUS", "total-recall"]
timestamp: 2026-07-10T00:00:00Z
---

# TR_CORE_FOCUS — Product Requirements

> **One-liner:** Total Recall is a portable personal memory + instruction + secrets layer that personalizes any IDE/agent with *your* knowledge, skills, and credentials — not a general-purpose AI OS.

## Problem

TR has accumulated sovereign-OS scope: dream cycles, fact-seeker, research queues, nested skill packages, multi-agent orchestration, portfolio sync, large dashboard surface. That dilutes the product users actually need:

> Open any IDE on any machine and get **my rules, my preferences, my repo knowledge, my skills, my secrets** — safely and portably.

## Product thesis

**Total Recall = personal AI identity pack**

| Pillar | What it is |
|--------|------------|
| **Memory** | SSSS vault (invariants, preferences, facts, decisions, patterns) |
| **Instructions** | Compiled IDE surfaces (`INSTRUCTIONS.md`, connect targets) |
| **Portability** | Global brain + per-project overlay; sync without a cloud DB |
| **Repo knowledge** | Project brain + **openwiki** pages auto-shipped and maintained |
| **Skills catalog** | Track and deploy user skills across repos (registry, not nested mega-skills) |
| **Secrets & keys** | Store, rotate, scope API keys; monitor usage and cost |

## Non-goals (explicitly cut or demote)

- Full “Sovereign AI OS” positioning as primary product
- Nested skills *inside* the total-recall skill (`tr-ssss`, `tr-research`, `tr-skill`, `tr-cli-agents` as agent skills)
- Research/fact-seeker as core runtime (optional plugin later)
- Heavy autonomous “dream” as required path for basic memory
- Host-app features (UltraChat telephony, festech CRM, etc.)
- Replacing SSSS package — TR **consumes** `@ssss/cli`, does not re-own the standard

## Primary user journeys

1. **Personalize this IDE** — `init` + `connect <ide>` injects compiled instructions without clobbering local rules.
2. **Remember / recall** — CLI-first memory ops; vault is SSOT.
3. **Open a repo** — project brain + openwiki scaffold appear; skills adapt to repo context.
4. **Deploy a skill to a repo** — TR registry deploys skill files, can rewrite triggers/descriptions from project openwiki + stack signals.
5. **Secrets** — store provider keys encrypted; rotate; report usage/cost; never write secrets into openwiki or IDE instruction surfaces.
6. **Cross-repo skill inventory** — list skills installed where; versions; drift.

## Success metrics

- Fresh machine: brain + IDE connect in < 5 minutes
- New repo: `init` produces openwiki + project brain + instruction inject
- Zero nested agent-skills under `total-recall/skills/` for non-TR operations
- Secrets never appear in compiled instruction shims
- Skills catalog answers “where is skill X installed?” across repos

## Relationship to other systems

| System | Role |
|--------|------|
| **ssss** (`@ssss/cli`) | Mutation/validation kernel; TR is a host |
| **Total Recall** | Memory, instructions, secrets, skill deploy, openwiki, IDE glue |
| **openwiki** | Human/agent docs per brain and per project; ships with TR |
| **Host apps** (UltraChat, Festech) | Product codebases that *use* TR; not owned by TR |
