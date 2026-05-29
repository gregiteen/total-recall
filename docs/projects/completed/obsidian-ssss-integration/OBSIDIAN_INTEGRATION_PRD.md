# Obsidian SSSS Integration PRD

## 1. Goal & Context
The goal of this project is to create a first-class integration between Total Recall SSSS v2 and Obsidian. It leverages the "file-over-app" philosophy by allowing the user to seamlessly visualize, query, and manipulate their sovereign memory vault directly inside Obsidian using native backlinks, visual canvas graphs, and a dedicated `/ssss` slash command.

## 2. Requirements & Features

### Feature 1: Rich Backlinking & Structural Graph Indexing
- **Wikilink Extraction**: Robust extraction of bidirectional references (`[[slug]]` syntax) inside the Markdown body of SSSS memory nodes.
- **Graph Indexing**: Enrich `graph-index.jsonl` with topological graph properties:
  - `links`: Outgoing wikilinks / related references.
  - `backlinks`: Dynamically computed incoming wikilinks / related references.
- **Topological Metadata**: Expose this link/backlink connectivity to the runtime environment, allowing APIs and the `/ssss` command to map the local cognitive network.

### Feature 2: High-Fidelity Obsidian Canvas
- **File-Based Canvas Nodes**: Upgrade the current text-based `graph.canvas` cards to native `type: "file"` nodes, referencing the actual SSSS Markdown files (e.g., `Total Recall/invariants/never-run-tsc.md`). This enables live-editing and previewing notes directly inside the canvas graph.
- **Category Semantic Color-Coding**: Assign Obsidian preset colors (1-6) to cards based on their SSSS category:
  - `invariants` -> Orange (color: "1")
  - `patterns` -> Green (color: "4")
  - `anti-patterns` -> Red (color: "0")
  - `preferences` -> Purple (color: "5")
  - `concepts`/`facts`/`lore` -> Cyan (color: "3")
  - `decisions` -> Yellow (color: "2")
- **Layout Optimization**: Auto-calculate dynamic layout margins and dimensions so that large file-based canvas nodes are perfectly spaced.

### Feature 3: Authoritative `/ssss` Slash Command
- **Multi-Client Registration**: Add `/ssss` as a registered slash command for both Gemini (`ssss.toml`) and Claude Code (`ssss.md`).
- **Commands & Subcommands**:
  - `ssss help`: Show canonical SSSS spec details, categories, and frontmatter.
  - `ssss stats`: Show deep network metrics (Total Nodes by category, Total Links, top 5 highly connected "Hub" nodes, and "Orphan" unlinked nodes).
  - `ssss map [slug]`: Display the local graph for a specific node slug including all outgoing links and incoming backlinks.
  - `ssss compile`: Re-scan, rebuild derived indices, and regenerate the high-fidelity Obsidian Canvas.

### Feature 4: Robust Obsidian Sync
- **Obsidian Sync Support**: Ensure the symlinked `Total Recall` folder integrates perfectly with Obsidian Sync and iCloud by resolving absolute symlink boundaries on connection.

## 3. Scope & Exclusions
- We will not implement an external graph rendering UI in React. The visualization is entirely delegated to Obsidian's industry-leading native Graph View and Canvas.
- No direct database writes. Source of truth remains git-versioned Markdown.
