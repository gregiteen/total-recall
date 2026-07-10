---
type: project_document
title: TR_CORE_FOCUS — Development Plan
tags: ["project-management", "TR_CORE_FOCUS"]
timestamp: 2026-07-10T00:00:00Z
---

# TR_CORE_FOCUS — Development Plan

## Phase 0 — Freeze scope (this doc)

- [x] Write PRD + architecture + tracker
- [ ] Inventory every CLI command / core module as **core | optional | remove**
- [ ] Stop new features outside core pillars

## Phase 1 — Unpack nested skills

- [ ] Move `tr-ssss`, `tr-research`, `tr-skill`, `tr-cli-agents` out of “skills” semantics into `modules/`
- [ ] Ensure only root `total-recall/SKILL.md` is advertised as an agent skill
- [ ] Update scaffold template the same way
- [ ] Grep/remove references that tell agents to load nested TR skills

## Phase 2 — Openwiki ships with TR

- [ ] Add default `openwiki/` templates to scaffold + global brain layout
- [ ] `init` creates openwiki if missing (global + project)
- [ ] Document openwiki vs memory-vault (wiki = durable docs; vault = SSSS memory nodes)

## Phase 3 — Skills registry + deploy

- [ ] Global skills registry schema (markdown or yaml index)
- [ ] `total-recall skill list|register|deploy|status`
- [ ] Repo-adaptive deploy (description/trigger rewrite from openwiki + stack detect)
- [ ] Cross-repo install map

## Phase 4 — Secrets & usage

- [ ] Harden secrets store (encrypt, list metadata without revealing values)
- [ ] `secret rotate` + audit log
- [ ] Usage/cost recording hooks for known providers
- [ ] Never inject secrets into instruction surfaces (conformance test)

## Phase 5 — Slim runtime

- [ ] Default install path does not require dream/fact-seeker/research daemon
- [ ] Mark non-core modules optional or delete dead paths
- [ ] README rewrite around “personalize any IDE” not “Sovereign OS”
- [ ] Prune root `fix-*.mjs` one-off scripts and collab/extension if out of scope

## Phase 6 — Verify

- [ ] Clean `npx total-recall init` + connect on empty machine story
- [ ] Tests for inject non-destructive, secrets isolation, skill deploy, openwiki present
