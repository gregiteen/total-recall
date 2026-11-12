---
type: ui-chunk:chunk
plugin: openwiki
id: propagation-plan
title: Preview repository propagation
description: Count eligible registered repositories and review the scope of generator propagation.
timestamp: "2026-11-08T09:14:38Z"
intents: [preview wiki propagation, inspect eligible repositories, plan generator rollout]
surfaces: [page]
operations: [propagate]
data: ["propagate:/eligibleCount", "propagate:/updatedCount"]
---

<section>
  <h2>Preview repository propagation</h2>
  <p>Run <code>total-recall openwiki propagate --dry-run --json</code> to list eligible registered repositories. Use <code>--repo</code> to review one repository.</p>
  <p>Review the update receipts and any partial or failed results after an approved apply.</p>
</section>
