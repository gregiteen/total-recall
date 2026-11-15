# Capability ingestion audit

Audit Status: Complete

The managed checkout links docs/projects outside the checkout, so this local suite records the bounded core work without editing another workspace. Baseline: 15 tests pass in plugin-catalog.spec.mjs and cli-semantic-index.spec.mjs. Live discovery: 38 plugins, 535 catalog CLI entries, 7 composed commands. plugin-catalog reads declarations passively but covers only CLI. Semantic harvesting independently ignores activation and drops source/schema fields. compileSurface refreshes the catalog before its freshness decision. Plugin lifecycle reaches compileSurface and returns explicit compilation failure. The installed SSSS registry provides asset (UTF-8 payload) and validated operation/dry_run envelopes; a catalog JSON asset needs no new command schema. API/MCP execution bridges are not established by declarations or module presence.
