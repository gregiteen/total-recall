# PRD: Research Project Summary Node Pruning & Optimization

## 1. Goal
Optimize the memory-vault size and semantic index cleanliness by ensuring that research project summary nodes (`research-project-<id>.md`) are strictly generated and synchronized inside the memory vault ONLY when the research project reaches the `done` status. 

## 2. Problem Statement
Currently, `syncResearchProjectNode(item)` and the `loadQueue` self-healing loader automatically generate a markdown summary node in `memory-vault/facts/` for every single research item, even if they are in `pending`, `in_progress`, or `failed` states. 
This results in dozens of "blank placeholder nodes" containing zero real conclusions or facts, polluting the developer's memory vault, vector embeddings, and visual 3D graph constellation.

## 3. Scope & Requirements

### Requirement 1: Conditional Summary Node Sync
- **Target File**: `src/core/research-queue.mjs`
- **Specification**:
  - Update `syncResearchProjectNode(item)` to only write a `.md` summary file to the vault if `item.status === 'done'`.
  - If `item.status !== 'done'`, the function must proactively delete the corresponding `research-project-<item.id>.md` node if it exists.

### Requirement 2: Self-Healing Loader Alignment
- **Target File**: `src/core/research-queue.mjs`
- **Specification**:
  - Refactor the self-healing loops in `loadQueue()` to only assert/create the `summaryPath` file if `item.status === 'done'`.
  - If a file exists for any non-`done` item, automatically call `deleteNode()` to purge it.

### Requirement 3: Validation & Quality Control
- Run all typescript checks, linter checks, and unit tests to ensure zero regressions across other scheduler, research, or daemon tasks.
