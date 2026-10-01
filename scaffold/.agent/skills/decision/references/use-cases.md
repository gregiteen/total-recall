# Decision use cases

Primary docs checked 2026-10-01. Recipes demonstrate designs; they are not verification of this repository's runtime.

## Skill selection

The official recipe uses two passes: rank the catalog and determine whether a skill is needed, then verify a shortlist with richer descriptions and brief instruction excerpts. It can return no skill. Treat the selected name as advice. Keep full manuals out of the main context until selected, and preserve required instructions independently. Ownership/scope filtering happens in code before selection.

Evaluate against real and synthetic requests from the target catalog. Compare deterministic routing with assisted routing; measure wrong loads, needless loads and missed loads as well as latency/cost. The cookbook's published experiment used Jev 1.12 and was rendered 2026-07-31; its thresholds and results are not current-model guarantees. Do not copy its gates without calibration.

[Skill suggestion recipe](https://docs.typesafe.ai/cookbooks/skill_suggestion)

## Other applicable patterns

- Intent routing and triage: choose a handler and ask independent urgency/status questions on shared state. [Intent routing](https://docs.typesafe.ai/patterns/intent-routing)
- Large catalogs: hierarchical classification narrows categories before leaf selection. [Hierarchical classification](https://docs.typesafe.ai/cookbooks/hierarchical_classification)
- Retrieval: score candidate passages, then filter in code; preserve source provenance. [RAG passage classification](https://docs.typesafe.ai/cookbooks/classifying_rag_passages)
- Batch decisions: fan out independent questions about one state and compose the result in code. [Fan-out](https://docs.typesafe.ai/patterns/fan-out)

Candidate matching, deduplication, citation checks and tool dispatch require their own validated decision definitions and tests. Use deterministic code for arithmetic, identifiers and access control. Periodic skill optimization can use advice to identify candidates, but it must preserve source, respect ownership, check drift and require review for semantic rewrites.
