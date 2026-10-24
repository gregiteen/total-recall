---
type: project_document
title: UNIFORM_BRAIN_UPDATES — Audit
description: Uniform SSSS and Total Recall package updates for registered brains and installed plugin consumers.
tags: [project-management, UNIFORM_BRAIN_UPDATES]
timestamp: 2026-10-13T17:15:00Z
---

# UNIFORM_BRAIN_UPDATES — Audit

Project Prefix: `UNIFORM_BRAIN_UPDATES` · Kanban State: In Progress · Author: Codex · Date: 2026-10-13

Status: Complete.

The current updater (`src/core/package-auto-update.mjs`, `src/cli/update.mjs`) discovers registry/env/explicit roots, updates only Total Recall, reads only root manifests, invokes npm regardless of package manager, and assumes install success proves the requested version. It does not normalize aliases, include nested SSSS consumers, or handle shared node_modules links. The authenticated update API and daemon use this legacy function; preserve their contract while adding an explicit all-brains mode.

Baseline on sanctioned Mac mini at ~/tr-checks/total-recall: updater 6/6 and update-route 9/9 tests passed (15 total, exit 0); source snapshot predates this work. Current package inventory identifies canonical and alias SSSS names, nested consumers and pnpm workspace roots. Installed plugin metadata has `dir` paths suitable for discovering additional plugin owner roots. npm docs confirm aliases and package-lock-only semantics; pnpm docs confirm workspace-wide installs. Lockfile-only is insufficient proof of an installed update.

Greg explicitly selected independent local dependency installations, with no shared node_modules symlinks. Migration must unlink only the link and never mutate its former target; failed installs restore the link and manifest. Dry runs write nothing. Newer previews must not be downgraded silently. Missing versions, invalid manifests, unsupported managers, install failures and verification mismatches must be explicit failures.

Published SSSS 0.11.0 conformance on the mini found stale reference-bundle provenance (0.10.3); other runtime checks passed. This is separate from updater behavior and must be reported/fixed in the SSSS source. Initial mesh CLI test hit a 30s runner deadline; direct SSH through recorded access produced actual baseline results.
