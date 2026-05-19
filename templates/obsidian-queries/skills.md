---
type: query
title: "Total Recall — Skills"
tags: [query, skills]
---

# Skills

```dataview
TABLE title, file.path AS path, tags
FROM "Total Recall/skills"
WHERE type = "skill" OR contains(tags, "skill")
SORT title ASC
```
