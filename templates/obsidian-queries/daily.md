---
type: query
title: "Total Recall — Daily Notes"
tags: [query, daily]
---

# Daily Notes

Dream cycle summaries — one file per day in `daily/`.

```dataview
TABLE title, updated
FROM "Total Recall/daily"
WHERE type = "memory"
SORT updated DESC
LIMIT 30
```
