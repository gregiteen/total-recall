# VFS Meta-Skill Consolidation — Project Tracker

> **Status**: ✅ Complete  
> **Last Updated**: May 25, 2026  
> **Priority**: P0-critical (Data Safety & VFS Integrity)  
> **Completed**: May 25, 2026

---

## Goal

Move ALL user data directories from `.agent/` siblings into `.agent/skills/total-recall/` (the meta-skill). The meta-skill IS the brain. Backup backs up one directory and gets everything.

### Current (WRONG):
```
.agent/
├── memory-vault/          ← sibling
├── memory-derived/        ← sibling
├── memory-inbox/          ← sibling
├── config/                ← sibling
├── sessions/              ← sibling
├── scheduler/             ← sibling
├── logs/                  ← sibling
├── skills/
│   └── total-recall/      ← meta-skill (backup only gets this)
│       └── SKILL.md
```

### Target (CORRECT):
```
.agent/
├── skills/
│   ├── code-quality/      ← dev skill (not user data)
│   ├── repo-expert/       ← dev skill (not user data)
│   └── total-recall/      ← meta-skill = THE BRAIN
│       ├── SKILL.md
│       ├── memory-vault/
│       ├── memory-derived/
│       ├── memory-inbox/
│       ├── config/
│       ├── sessions/
│       ├── scheduler/
│       ├── interrupts/
│       ├── skills/        ← user sub-skills (e.g. ssss)
│       ├── logs/
│       └── .backups/
```

---

## 📋 Task Checklist

### Phase 1: Path Foundation
- [x] Add `brainDir` export to `src/core/config.mjs` pointing to `agentDir + '/skills/total-recall'`
- [x] Update all path references in `src/core/` to use `brainDir` for user data dirs
- [x] Update all path references in `src/server/rest.mjs` to use `brainDir`
- [x] Update all path references in `src/cli/` to use `brainDir`

### Phase 2: Init & Scaffold
- [x] Update `src/cli/init.mjs` to create data directories inside the meta-skill
- [x] Update `.gitignore` entries to reflect new paths
- [x] Ensure `backup.mjs` correctly targets the meta-skill (already does)
- [x] Update `uninstall.mjs` to reference new paths

### Phase 3: Frontend & API
- [x] Verify frontend API calls don't hardcode paths (they use REST, should be fine)
- [x] Update any server-side path resolution for dashboard file serving

### Phase 4: Tests & Verification
- [x] Update all test fixtures and mocks referencing old paths
- [x] Run full test suite (322 tests must pass)
- [x] Run TypeScript checker (0 errors)
- [x] Run lint checker
- [x] Verify uninstall → init round-trip with backup

### Phase 5: Documentation
- [x] Update repo-expert SKILL.md directory layout diagram
- [x] Update project-management skill references
- [x] Update total-recall SKILL.md
- [x] Update SSSS PRD and Development Plan
