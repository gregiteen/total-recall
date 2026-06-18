# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.9.0] - 2026-06-18

### Added
- **`connect` now projects repo skills as native slash commands** across IDEs via
  the open Agent Skills standard. Every `.agent/skills/<name>/SKILL.md` becomes a
  `/<name>` command in the connected client:
  - **Claude Code** → `<project>/.claude/skills/` (project-scoped)
  - **Antigravity CLI** → `<project>/.agents/skills/` (project-scoped; the current
    Antigravity location, replacing the deprecated Gemini CLI `~/.gemini/commands`)
  - **Codex** → `~/.codex/skills/` (global — Codex has no project-local skills dir)
- Skill projection is **self-healing**: a broken or stale skill symlink (e.g. after
  the source repo moves) is refreshed automatically on `connect`, without `--force`.

### Fixed
- `connect` symlink projections to nested targets (e.g. Antigravity's
  `.agents/rules/AGENTS.md`) no longer dangle: the parent directory is now created
  and the symlink uses a path relative to the link's own directory instead of a
  hardcoded `INSTRUCTIONS.md`.
