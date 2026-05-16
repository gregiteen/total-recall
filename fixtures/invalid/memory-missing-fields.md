---
type: memory
slug: fixture-invalid-missing-fields
category: patterns
title: "Missing required fields"
---

This memory node is deliberately missing required fields:
confidence, importance, created, updated, last_accessed, source,
supersedes, superseded_by, contradicts, tags, related, routes_to_skills,
sentiment_polarity, sentiment_target, modality, subject, predicate,
object, decay, schema_version.

It MUST fail validation.
