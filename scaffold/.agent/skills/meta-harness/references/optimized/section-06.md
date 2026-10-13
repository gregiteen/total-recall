### 2. Headless Task Dispatch
Dispatch a specific coding or research task to any external harness (locally or remotely over the mesh):
```bash
# Local dispatches
npx total-recall harness dispatch claude "Inspect src/core/surface.mjs and run lint checks"
npx total-recall harness dispatch agy "Analyze latest preprints on room temperature diamond NV registers"
npx total-recall harness dispatch codex "Generate unit tests for src/core/context-cache.mjs"
npx total-recall harness dispatch ollama "Summarize the core invariants of SSSS"

# Cross-mesh remote dispatches
npx total-recall harness dispatch ollama --node build-box "What is test-time compute scaling?"
npx total-recall harness dispatch claude --node build-box "Run git status and lint tests"
```

