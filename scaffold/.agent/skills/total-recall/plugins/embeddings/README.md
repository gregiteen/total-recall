# Embeddings

Inspect a configured embedding endpoint, manage a local model installation, and report index coverage.

## Sharing

Offer it to your other Total Recall nodes over the mesh:

```bash
npx total-recall plugin share embeddings
```

Peers install it with `npx total-recall plugin install peer:<this-node>/embeddings`.

## Features

- **Identifier**: `embeddings`
- **Version**: see `plugin.json`
- **Use cases**: operations, ai
- **CLI Command**: `npx total-recall embeddings`

Coverage classifies the existing index by current content and vector width. Total Recall owns index rebuilds. Status reports remote inference when the configured endpoint is remote or a loopback service advertises an upstream model. The benchmark sends fixed sample text only to a local model. Pull targets the first configured loopback endpoint and reports an unreachable target without trying another. [Current audit](docs/projects/in-progress/EMBEDDINGS_CARD/EMBEDDINGS_CARD_AUDIT.md#backend-and-cli-reassessment-2026-11-05)

## Using this from an agent

Send work here to check embedding models and how much of a vault is indexed, or to pull and benchmark a local model.

```bash
total-recall embeddings status
total-recall embeddings models
total-recall embeddings coverage
total-recall embeddings pull <configured-model>
total-recall embeddings benchmark
```

This plugin owns no raw commands.
