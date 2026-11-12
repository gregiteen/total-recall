---
type: ui-chunk:chunk
plugin: meta-harness
id: included-usage-verification
title: Verify included harness access before dispatch
description: Read the registered adapters and included-usage status to check whether a proposed harness may run under existing access.
timestamp: "2026-11-08T23:12:00Z"
intents: [verify included access before dispatch, find harnesses covered by current access, distinguish subscription use from provider spend]
surfaces: [page]
operations: [catalog, included-status, quota]
---
<section>
  <h2>Check which harness can run under existing access</h2>
  <ol><li>Identify the intended adapter in the harness catalog.</li><li>Read included usage and quota for that adapter.</li><li>Queue or reroute when the permitted adapter is unavailable.</li></ol>
</section>
