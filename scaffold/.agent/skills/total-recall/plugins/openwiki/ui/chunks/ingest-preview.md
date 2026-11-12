---
type: ui-chunk:chunk
plugin: openwiki
id: ingest-preview
title: Preview wiki ingestion
description: Count pages selected for import into the requested Total Recall brain.
timestamp: "2026-11-08T09:14:38Z"
intents: [preview wiki ingest, import markdown into project brain, inspect wiki import receipt]
surfaces: [page]
operations: [ingest]
data: ["ingest:/planned", "ingest:/imported", "ingest:/errors"]
---

<section>
  <h2>Preview wiki ingestion</h2>
  <p>Run <code>total-recall openwiki ingest &lt;directory&gt; --project --dry-run --json</code> to count pages planned for the project brain. Select <code>--global</code> only when the shared brain is the intended target.</p>
  <p>After approving the target, run the import and review the completed and failed counts. Confirm indexed passages through Total Recall recall.</p>
</section>
