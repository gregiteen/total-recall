---
type: project_document
title: CLI_AGENT_SKILL_UPDATE — Architecture
description: Verified generic terminal agent skill and targeted repository propagation.
timestamp: 2026-09-30T19:14:11Z
tags: [project-management, skills, cli-agents]
---

# CLI_AGENT_SKILL_UPDATE — Architecture

Canonical global package -> explicit TR registry registration -> reviewed cli-agents-only push/deploy -> repository physical package -> relative IDE aliases. Registry install provenance and whole-package hash are verified; local database/runtime files never become reusable artifacts. A credential-clean subprocess helper delegates to actual installed vendor CLI, with argv/stdin, selected cwd, scoped invocation, bounded timeout/output and failure parsing. Discovery reports executable identity/version and safe auth metadata; it never reads raw credentials. Catalog/reference instructions cover additional CLIs without auto-enabling unknown accounts. Current core runtime/harness has different unsafe credential/permission behavior: helper does not assert those internals were fixed. Local verification records stay in project evidence, rather than hardcoded user data in global skill. Propagation writes only the requested package. Verify unrelated files and report concurrent edits without claiming they were unchanged.
