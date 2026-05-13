---
type: task
priority: 95
category: memory-maintenance
target: sync-fabric
estimated_calls: 10
deadline: null
created_by: system
reason: "Push memory-vault updates to all registered sync targets"
status: pending
progress: 0
---

## Objective
Synchronize the local SSSS memory vault to all remote cloud targets (DigitalOcean and GitHub) using native terminal tools. No JavaScript scripts — use shell commands directly.

## Steps
1. Run: `cd /root/total-recall && git add .agent/memory-vault/ .agent/INSTRUCTIONS.md && git commit -m 'chore: autonomous vault sync' && git push origin main`
2. Run: `rsync -avz /root/.agent/memory-vault/ root@localhost:/root/.agent/memory-vault/` (only if local and cloud differ)
3. Update this file's `status` field to `done`.
4. Write a new `sync-fabric.md` into `.agent/scheduler/queue/` to schedule the next sync.

## Success Criteria
- [ ] Git push succeeded or no changes to push.
- [ ] Remote vault matches local vault.
