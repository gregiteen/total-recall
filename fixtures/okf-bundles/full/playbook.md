---
type: Playbook
title: Database Restore Playbook
description: Step-by-step instructions for DB recovery
resource: gs://backup-bucket/playbooks/restore.pdf
tags: [db, recovery, ops]
timestamp: 2026-06-17T13:00:00Z
---
Follow these steps to restore the database from cold backup:
1. Fetch recent backup from bucket.
2. Spin up test DB instance.
3. Validate checksums.
