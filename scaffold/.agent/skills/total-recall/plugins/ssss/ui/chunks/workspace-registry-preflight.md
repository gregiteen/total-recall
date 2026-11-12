---
type: ui-chunk:chunk
plugin: ssss
id: workspace-registry-preflight
title: Check the workspace registry before validating documents
description: Verify the current lock and extension combination before diagnosing a workspace document against that registry.
timestamp: '2026-11-08T23:21:00Z'
intents: ["check SSSS registry before validating documents", "diagnose workspace schema version drift", "verify lock and extension registry together"]
surfaces: [page]
operations: [registry, validate]
data: ["registry:/valid", "registry:/expected_integrity", "registry:/actual_integrity", "registry:/specVersion", "validate:/type", "validate:/valid"]
panel: home
---
<section data-design-component="ledger-sheet">
  <h2>Check the registry before inspecting a document</h2>
  <p>Verify the lock using the workspace's extension registry. When it matches, validate the document with the same extension. If the lock differs, compare the recorded and computed integrity before changing the schema.</p>
</section>
