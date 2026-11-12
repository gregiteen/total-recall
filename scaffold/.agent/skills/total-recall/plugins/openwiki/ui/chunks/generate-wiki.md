---
type: ui-chunk:chunk
plugin: openwiki
id: generate-wiki
title: Preview wiki generation
description: Inspect the selected repository and output location before generating documentation.
timestamp: "2026-11-08T09:14:38Z"
intents: [preview wiki generation, generate repo documentation, inspect generation destination]
surfaces: [page]
operations: [generate]
data: ["generate:/ok", "generate:/dryRun"]
---

<section>
  <h2>Preview wiki generation</h2>
  <ol>
    <li>Run <code>total-recall openwiki generate --dry-run --json</code> for the current workspace, or select a registered repository with <code>--repo</code>.</li>
    <li>Review the selected repository and wiki output directory.</li>
    <li>Start generation after approving the target and configured provider.</li>
  </ol>
</section>
