---
type: query
title: "Total Recall — Conflicts"
tags: [query, conflicts]
---

# Pending Conflicts

Nodes that contradicted existing knowledge and were quarantined for review.

```dataview
TABLE conflict_id, new_slug, existing_slug, reason, detected_at
FROM "Total Recall"
WHERE type = "conflict" AND status = "pending"
SORT detected_at DESC
```

## Resolved

```dataview
TABLE conflict_id, resolution, resolved_at
FROM "Total Recall"
WHERE type = "conflict" AND status = "resolved"
SORT resolved_at DESC
LIMIT 10
```
