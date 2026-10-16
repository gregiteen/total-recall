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

