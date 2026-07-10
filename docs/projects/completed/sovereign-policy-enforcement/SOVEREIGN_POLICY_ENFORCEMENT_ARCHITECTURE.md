# Sovereign Policy Enforcement & Verification — Architecture

## 1. System Components & Data Flow

```mermaid
flowchart TB
    subgraph VAULT["Active Memory Vault"]
        MD["Markdown Nodes\n(invariants, preferences, etc.)"]
        EVENTS[".events/audit.jsonl"]
    end

    subgraph COMPILER["Surface Compiler (surface.mjs)"]
        COMP["compileSurface()"]
        COMPACT["compactNode() / heuristicCompact()"]
    end

    subgraph OUTPUTS["Generated Workspace Layout"]
        SHIMS["INSTRUCTIONS.md / GEMINI.md\n(Exempt from Truncation)"]
        INDEX["index.md\n(OKF Spec §6 Compliant)"]
        LOG["log.md\n(OKF Spec §7 Compliant)"]
    end

    subgraph GATE["Quality Gate (code-quality-gate.mjs)"]
        VITEST["Root Test Suite (Vitest)"]
        EVALS["skills-evals.spec.mjs\n(Programmatic evals.json checks)"]
        LINTER["total-recall lint --okf\n(Compliance scanner)"]
        OPTIMIZER["enforce-skill-optimization.mjs\n(Skill layout check)"]
    end

    %% Compiling Connections
    MD --> COMP
    EVENTS --> COMP
    COMP -->|Exempts critical categories| COMPACT
    COMPACT --> SHIMS
    COMP -->|Generates live index| INDEX
    COMP -->|Generates live log| LOG

    %% Quality Gate Connections
    GATE -->|Executes| VITEST
    VITEST -->|Runs| EVALS
    GATE -->|Executes| OPTIMIZER
    GATE -->|Executes| LINTER
```

## 2. Component Layout & Refinements

### 2.1 Compiler Bypasses (`src/core/surface.mjs`)
- Exempt `invariants`, `preferences`, and `anti-patterns` categories from standard 180-char truncation and single-line extraction.
- Format multi-line bodies with indentation to keep Markdown lists valid.

### 2.2 Live index.md and log.md (`src/core/okf-adapter.mjs`)
- **`generateLiveIndex(vaultDir)`**: Maps memory nodes, groups them by `type` under `# <Type>` headings, sorts alphabetically, and formats items using `*` bullet points.
- **`generateLiveLog(vaultDir)`**: Groups audit records by date under `## YYYY-MM-DD` headings, newest first, and formats entries as `*` bullets.

### 2.3 Quality Gate (`scripts/code-quality-gate.mjs`)
- Executes the skill checker to verify layout optimization and metadata.
- Executes the OKF linter to output visual compliance warnings.
