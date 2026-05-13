---
type: task
priority: 80
category: memory-maintenance
target: backup-vault
estimated_calls: 5
deadline: null
created_by: system
reason: "Periodic backup of the memory vault"
status: pending
progress: 0
---

## Objective
Create an encrypted tarball backup of the entire `.agent/` directory to protect against data corruption or accidental deletion.

## Steps
1. Create a timestamped `.tar.gz` archive of `.agent/memory-vault/`.
2. Move the archive into `.agent/.backups/`.

## Success Criteria
- [ ] A new timestamped backup exists in `.agent/.backups/`.
