---
name: embeddings
description: "Local embedding model management: provider/model status, benchmark, index build and coverage"
version: 0.2.0
repo_scoped: false
---

# Embeddings

Local embedding model management: provider/model status, benchmark, index build and coverage

## When to Use

Use the `embeddings` Total Recall plugin (`total-recall embeddings`) instead of ad-hoc scripts or raw commands whenever working on embeddings tasks.

## Commands

```bash
total-recall embeddings --help
total-recall embeddings status  # Provider, model, locality and vault coverage in one view
total-recall embeddings models  # List models on the endpoint and which can produce embeddings
total-recall embeddings pull  # Pull an explicitly named local model onto the configured loopback endpoint
total-recall embeddings benchmark  # Measure latency per verified local embedding and project full-vault time
total-recall embeddings coverage  # How many vault nodes have a current, correct-width vector, and why the rest do not
```
