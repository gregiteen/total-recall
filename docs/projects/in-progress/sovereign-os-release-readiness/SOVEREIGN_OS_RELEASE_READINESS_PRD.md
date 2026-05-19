# Sovereign OS Release Readiness PRD

- **Plane**: Product
- **Status**: In progress
- **Created**: 2026-05-18
- **Owner**: Total Recall

## Summary

This project consolidates the two previously separate active epics —
`ssss-sovereign-ai-os` and `multi-ide-system-integration` — plus a fresh
deployment/integration verification audit into a single release-readiness
epic. The strategic override of 2026-05-15 mandates a single active Total
Recall epic; running two trackers in parallel violated that rule. This epic
restores the single-tracker discipline.

The goal is a system that meets one bar: **easy setup, perfect integration.**
A new user can deploy Total Recall on Linux *or* macOS, connect every
supported IDE, and register with UltraChat — and every advertised command
actually works.

## Problem

A 2026-05-18 verification audit found the system is close but not release
ready:

1. **A documented CLI command is broken.** `bin/total-recall.mjs` routes
   `finetune` to `src/cli/finetune.mjs`, which was deleted in commit
   `75908fe`. `npx total-recall finetune` errors. `README.md` still
   advertises it.
2. **Documentation contradicts the CLI.** `README.md` claims `compile`,
   `backup`, `sync`, and `reindex` "have been removed" — only `reindex`
   actually is. The `bin` JSDoc lists `export`/`import`/`reindex` that are
   not registered.
3. **macOS deployment is not one-click.** `deploy.mjs` installs services
   via systemd only; on macOS no launchd agent is installed, so the daemon
   never auto-starts.
4. **IDE coverage is uneven.** `connect.mjs` supports `codex` and `gemini`
   clients, but `docs/guides/` has no guide for either.
5. **UltraChat integration is partial.** `connect ultrachat` only prints a
   generic API snippet; the session Sync Fabric (ssss Phase 8) is unbuilt
   and there is no UltraChat setup guide.
6. **Verification phases are unrun.** ssss Phase 7 (Testing & Verification)
   is entirely unchecked; multi-ide Phase 6 is missing three smoke tests.
   One test (`auth.spec.mjs` localhost health bypass) failed on audit.

## Goals

- Every command advertised in `README.md` and `bin` help executes correctly.
- `npx total-recall deploy` produces an auto-starting daemon on both Linux
  (systemd) and macOS (launchd).
- Every IDE that `connect.mjs` supports has a matching setup guide.
- UltraChat integration is a documented, tested contract — not tribal
  knowledge.
- The combined tracker's Testing phase is fully executed before the epic is
  moved to `completed/`.

## Non-Goals

- Replacing SSSS with a database.
- Rewriting the local runtime or changing the memory schema.
- Building LLM Proxy Mode (`total-recall proxy start`) — kept optional /
  deferred.
- Windows support.
- **Adopting a database/vector store.** Evaluated against OB1 (Open Brain),
  which is built on PostgreSQL + pgvector. Rejected — "the filesystem is the
  brain" is the core thesis. Any OB1-derived capability (e.g. semantic
  search) must be implemented file-natively.
- **Multi-user / Row-Level Security in Total Recall core.** OB1 supports
  multi-tenant Postgres RLS. That concern belongs to UltraChat (the hosted
  layer), not the sovereign single-user brain.

## OB1-Inspired Enhancements (post-readiness)

A 2026-05-18 review compared Total Recall to OB1 (Open Brain,
`github.com/NateBJones-Projects/OB1`). OB1's storage model is the opposite
of Total Recall's and is explicitly out of scope (see Non-Goals). Six
surrounding ideas are storage-agnostic, on-thesis, and adopted as Phases
7–10 — to be built only **after** the release-readiness phases (1–6) ship:

- **Content-hash node dedup** — SHA-256 fingerprint node content so the same
  fact ingested from multiple IDE sources is stored once.
- **Local semantic search** — embeddings from a local Ollama model stored in
  a derived index file; semantic recall without a vector DB. This is the one
  capability OB1 genuinely does better today (Total Recall uses tf-idf).
- **Slack/Discord quick-capture channels** — inbound capture bots parallel to
  the existing Telegram integration.
- **Dashboard graph/traces/duplicates views** — visualize the SSSS node graph
  and surface existing conflict/merge proposals for resolution.
- **Community submission pipeline** — issue templates, a metadata schema, and
  a CI gate for community skill/recipe submissions.
- **Claude-in-CI workflows** — issue triage and PR review GitHub Actions for
  the total-recall repo itself.

## Source Projects (consolidated)

- `docs/projects/in-progress/ssss-sovereign-ai-os/` — Phases 0–6 done;
  Phase 7 (Testing) and Phase 8 remainder (UltraChat sync, proxy) carried
  forward.
- `docs/projects/in-progress/multi-ide-system-integration/` — Phases 0–4
  done; Phase 5 remainder (`clients.json`, `status` extension) and Phase 6
  (smoke tests) carried forward. See that project's `PRD.md` for the full
  integration contract, still authoritative.

## Success Metrics

- `npx total-recall <command>` succeeds for every command in help output.
- A clean-host deploy on macOS leaves a running, auto-restarting daemon.
- Cursor, Claude Code, Codex, Antigravity, Gemini, Windsurf, Aider, and
  UltraChat each have a guide and a passing projection/connection check.
- The full `vitest` suite passes with no failures.
- The Clean-Account VFS Initialization walkthrough completes without a core
  blocker.
