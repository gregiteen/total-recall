# Obsidian SSSS Integration Development Plan

## Phase 1: Backlinking & Topology Engine
- [ ] Implement outbound wikilink parsing and inbound backlink calculations in `src/core/surface.mjs`.
- [ ] Save the topological `links` and `backlinks` arrays inside `graph-index.jsonl` during derived index compilation.
- [ ] Overhaul `src/cli/map.mjs` to support rendering inbound backlinks (`◄──`) and show a detailed topological breakdown of unlinked "Orphans" and highly linked "Hubs".

## Phase 2: High-Fidelity Obsidian Canvas
- [ ] Modify `generateCanvas` in `src/core/surface.mjs` to use `type: "file"` canvas cards instead of plain text.
- [ ] Map SSSS categories to Obsidian preset color tags (`color: "1"`, `color: "4"`, etc.).
- [ ] Adjust card sizes (`width: 320`, `height: 240`) and dynamic grid spacing (`GAP_X: 120`, `GAP_Y: 80`) to ensure absolute readability.

## Phase 3: Omnichannel `/ssss` Slash Command
- [ ] Add the `/ssss` command template definition to `writeGeminiSlashCommands` in `src/cli/connect.mjs`.
- [ ] Add the `/ssss` command template definition to `writeClaudeCodeSlashCommands` in `src/cli/connect.mjs`.
- [ ] Run connections to verify file and command write correctness.

## Phase 4: Verification & Tests
- [ ] Write integration test cases in Vitest to verify wikilink extraction, backlink construction, and Obsidian Canvas schema conformity.
- [ ] Run the test suite and verify 100% pass rate.
