# VFS Meta-Skill Consolidation — Project Tracker

> **Status**: In-Progress  
> **Last Updated**: May 25, 2026  
> **Priority**: P0-critical (Data Safety & VFS Integrity)  

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
- [ ] Add `brainDir` export to `src/core/config.mjs` pointing to `agentDir + '/skills/total-recall'`
- [ ] Update all path references in `src/core/` to use `brainDir` for user data dirs
- [ ] Update all path references in `src/server/rest.mjs` to use `brainDir`
- [ ] Update all path references in `src/cli/` to use `brainDir`

### Phase 2: Init & Scaffold
- [ ] Update `src/cli/init.mjs` to create data directories inside the meta-skill
- [ ] Update `.gitignore` entries to reflect new paths
- [ ] Ensure `backup.mjs` correctly targets the meta-skill (already does)
- [ ] Update `uninstall.mjs` to reference new paths

### Phase 3: Frontend & API
- [ ] Verify frontend API calls don't hardcode paths (they use REST, should be fine)
- [ ] Update any server-side path resolution for dashboard file serving

### Phase 4: Tests & Verification
- [ ] Update all test fixtures and mocks referencing old paths
- [ ] Run full test suite (296 tests must pass)
- [ ] Run TypeScript checker (0 errors)
- [ ] Run lint checker
- [ ] Verify uninstall → init round-trip with backup

### Phase 5: Documentation
- [ ] Update repo-expert SKILL.md directory layout diagram
- [ ] Update project-management skill references
- [ ] Update total-recall SKILL.md
- [ ] Update SSSS PRD and Development Plan
