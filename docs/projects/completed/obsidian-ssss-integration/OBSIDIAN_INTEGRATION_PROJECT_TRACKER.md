# Obsidian SSSS Integration Project Tracker

## ✅ Phase 1: Backlinking & Topology Engine
- [x] Implement outbound wikilink parsing and inbound backlink calculations in `src/core/surface.mjs`
- [x] Include topological `links` and `backlinks` arrays inside `graph-index.jsonl`
- [x] Update `src/cli/map.mjs` to show bidirectional graph connections (`◄──` and `──►`)
- [x] Implement unlinked "Orphans" and highly-connected "Hubs" stats in `src/cli/map.mjs`
- [x] Support automatic safe backlink section injections in memory Markdown files

## ✅ Phase 2: High-Fidelity Obsidian Canvas
- [x] Convert `graph.canvas` generation to use native `type: "file"` cards pointing to `Total Recall/category/slug.md`
- [x] Support color-coding preset colors on Canvas cards based on category
- [x] Scale card layout margins and sizes dynamically to prevent overlapping

## ✅ Phase 3: Omnichannel `/ssss` Slash Command
- [x] Implement the `/ssss` command in Gemini slash commands (`ssss.toml`) in `src/cli/connect.mjs`
- [x] Implement the `/ssss` command in Claude Code slash commands (`ssss.md`) in `src/cli/connect.mjs`
- [x] Verify connection commands run perfectly and write slash commands safely

## ✅ Phase 4: Testing & Verification
- [x] Add unit tests in `connect.spec.mjs` or a new test suite verifying wikilink parsing and backlink calculations
- [x] Verify Obsidian Canvas schema conformity against standard format
- [x] Run typescript checks and linting checks using safe project runners
