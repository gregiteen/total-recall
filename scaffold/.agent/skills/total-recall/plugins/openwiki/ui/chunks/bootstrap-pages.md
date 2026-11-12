---
type: ui-chunk:chunk
plugin: openwiki
id: bootstrap-pages
title: Seed missing wiki pages
description: Preview which owner-provided pages would be created in an explicit brain or project.
timestamp: "2026-11-08T09:14:38Z"
intents: [bootstrap wiki pages, seed repository documentation, review missing starter pages]
surfaces: [page]
operations: [bootstrap]
data: ["bootstrap:/files_planned", "bootstrap:/files_preserved"]
---

<section>
  <h2>Seed missing wiki pages</h2>
  <p>Choose an absolute brain path and, optionally, a project root. Run <code>total-recall openwiki bootstrap --brain &lt;path&gt; --dry-run --json</code> to see the planned pages.</p>
  <p>Review the target paths before applying. The bootstrap receipt separates new pages from existing files that it preserved.</p>
</section>
