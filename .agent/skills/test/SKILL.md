---
name: test
description: >-
  Use this skill when running the Total Recall test suite — unit tests,
  CLI tests, API tests, and frontend component tests.
  MANDATORY: You MUST read the full SKILL.md file before executing.
repo_scoped: true
---

## Total Recall — Test Architecture

### Test Framework

- **Backend**: Vitest (unit + integration tests)
- **Frontend**: Vitest + @testing-library/react
- **Test files**: Co-located as `*.spec.mjs` (backend) or `*.spec.tsx` (frontend)

### Running Tests

> **IMPORTANT**: NEVER run heavy test suites locally on the laptop. These must run on the Mac Mini or production server to prevent system slowdowns and OOM crashes.

```bash
# Run specific test file
npx vitest run src/core/surface.spec.mjs

# Run tests matching a pattern
npx vitest run --grep "deduplication"

# Run all backend tests
npx vitest run src/

# Run all frontend tests
npx vitest run frontend/
```

### Test Organization

```
src/
├── cli/
│   ├── remember.mjs          # CLI command
│   └── remember.spec.mjs     # Unit tests for remember
├── core/
│   ├── surface.mjs           # Surface compiler
│   └── surface.spec.mjs      # Unit tests for surface
└── server/
    └── routes/
        ├── memory.mjs        # Route handler
        └── memory.spec.mjs   # Route tests

frontend/src/
├── pages/
│   ├── ChatPage.tsx          # Page component
│   └── ChatPage.spec.tsx     # Component tests
└── components/
    ├── BrainSelector.tsx
    └── BrainSelector.spec.tsx
```

### Cross-cutting suites

Four specs test properties rather than a single module. They are the ones most
likely to be broken by an unrelated change, and the ones worth reading before
touching search, embeddings, or the optimizer.

| Spec | Guards |
|---|---|
| `src/core/embedding-contract.spec.mjs` | Exactly one place decides the embedding model; callers read it from config; `surface.mjs`/`search.mjs` name no model. **Pin the invariant, never the model name** — this file exists because a requirement written against `text-embedding-004` went stale when the default became `gemini-embedding-2`, and `runtime.mjs` was left holding a second, competing default. |
| `src/core/search-performance.spec.mjs` | Local cache-hit latency (p95 over 50 iterations, warm-up excluded) stays under 50ms. Only the local path is asserted — a wall-clock bound on a network embedding call would fail on a slow connection and pass on a fast one. |
| `src/core/context-dispatch.integration.spec.mjs` | Concurrent `compileContext` dispatch: the invariants slot survives every path, distinct queries yield distinct capsules, an embedding outage degrades ranking without dropping invariants. The fixture is deliberately larger than the token budget — with a small vault every capsule contains everything and routing is untestable. |
| `src/core/proposal-applier.spec.mjs` | The full proposal lifecycle, plus the safety rules that stop an unattended merge from destroying data: full-triple matching, the auto-merge size cap, content similarity, protected nodes, and the revert→`draft` rule that prevents an undo/redo loop. |

### Test Rules

1. Every `*.mjs` file in `src/cli/` and `src/core/` must have a corresponding `*.spec.mjs`
2. Every `*.tsx` page and component must have a corresponding `*.spec.tsx`
3. No `alert()` calls in page components — use state-based error display
4. Always clean up side-effects, mock entries, and test artifacts after test runs
5. Tests must provide all required SSSS v2 properties when validating memory node schemas
