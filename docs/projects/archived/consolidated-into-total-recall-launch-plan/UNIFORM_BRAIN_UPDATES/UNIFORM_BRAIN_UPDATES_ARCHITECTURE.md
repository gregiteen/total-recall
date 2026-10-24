---
type: project_document
title: UNIFORM_BRAIN_UPDATES — Architecture
description: Uniform SSSS and Total Recall package updates for registered brains and installed plugin consumers.
tags: [project-management, UNIFORM_BRAIN_UPDATES]
timestamp: 2026-10-13T17:15:00Z
---

# UNIFORM_BRAIN_UPDATES — Architecture

Project Prefix: `UNIFORM_BRAIN_UPDATES` · Kanban State: In Progress · Author: Codex · Date: 2026-10-13

Add a generic package-maintenance module behind explicit all-brains mode; reuse root discovery and installed-plugin metadata. Discover nested package manifests without traversing dependency/state/hidden trees. Group installs by workspace owner; resolve published targets once. Build a dry plan before any write. On apply, rewrite only selected dependency values, detach a shared node_modules link with rollback, install once per owner, and verify each consumer using Node package resolution. Preserve the existing legacy API/daemon path. Refuse unsupported managers and newer preview downgrades. CLI JSON failures set nonzero exit status.
