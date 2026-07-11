# Total Recall — Developer Handoff

## Active project

**`docs/projects/in-progress/TR_CORE_FOCUS/`**

| Doc | Role |
|-----|------|
| `TR_CORE_FOCUS_PRD.md` | Product thesis |
| `TR_CORE_FOCUS_ARCHITECTURE.md` | Memory loop, tasks, layout |
| `TR_CORE_FOCUS_DEVELOPMENT_PLAN.md` | Phased plan |
| `TR_CORE_FOCUS_PROJECT_TRACKER.md` | Checkbox SSOT |

## Product

**Portable personal memory for any IDE** — write → dream → read → open tasks; plus openwiki, skill deploy, secrets. Not a Sovereign AI OS product first. Host apps are equal implementations (no special-cased repos in core).

## Done (2026-07-10)

- Phases **1–6**: modules/openwiki, skills registry + any-repo sync, secrets, dream + daemon tasks, README/CLI slim
- Open-source purity: no third-party product repo hardcoding in `src/` / `frontend/src/`
- Remote vault feature renamed to env-driven `TR_REMOTE_VAULT_*`

## Core CLI story

```bash
npx total-recall init --project
npx total-recall connect claude-code
npx total-recall remember fact "..."
npx total-recall recall "..."
npx total-recall dream
npx total-recall skill track .
npx total-recall secret list
```

Inventory: `docs/reference/CLI_INVENTORY.md` · README root.

## Phase 7 verify (2026-07-10)

- **76/76** vitest (envelope, dream, scheduler, skills, secrets, remote-vault, project-brain, skill CLI)
- Clean-machine smoke: ensure brain → remember → compile → dream → secret → task → skill track
- Custom task dispatch → `memory-inbox/pending` draft

### Next

1. **Commit / push** large uncommitted branch when ready  
2. Optional hygiene: remove root `fix-*.mjs` / `patch-*.mjs`  
3. Optional: fix non-interactive `init --yes` hang; improve bare-install `recall` without embeddings

## Do not

- Hardcode or special-case any host product repository in TR core
- Put secrets in vault markdown / openwiki / inject surfaces
- Treat dream or open tasks as optional bloat
- Plan under `.gemini/antigravity/brain/` — use `docs/projects/` only
