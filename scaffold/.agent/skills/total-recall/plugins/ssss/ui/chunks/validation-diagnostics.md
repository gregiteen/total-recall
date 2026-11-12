---
type: ui-chunk:chunk
plugin: ssss
id: validation-diagnostics
title: Diagnose SSSS frontmatter validation findings
description: Distinguish a file that the validator could not open from a document whose declared SSSS type failed its required fields.
timestamp: '2026-11-08T23:21:00Z'
intents: ["fix a missing SSSS frontmatter field", "diagnose SSSS validation findings", "distinguish invalid document from unavailable file"]
surfaces: [page]
operations: [validate]
data: ["validate:/ok", "validate:/valid", "validate:/type", "validate:/errors", "validate:/warnings", "validate:/error"]
panel: home
---
<section data-design-component="ledger-sheet">
  <h2>Separate document errors from file errors</h2>
  <ol><li>Enter the file path inside the selected workspace and run Validate document.</li><li>Confirm the expected primitive type, then read the individual findings.</li><li>Review warnings separately from errors that block the document.</li></ol>
</section>
