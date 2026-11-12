---
type: ui-chunk:chunk
plugin: ssss
id: scaffold
title: New SSSS project
description: Creates a complete canonical SSSS project in a new or empty directory inside the workspace, optionally with an extension and Total Recall wiring.
timestamp: '2026-11-08T08:12:00Z'
intents: ["scaffold an ssss project", "create a new ssss app", "start a project with total recall wiring", "new project with extension registry"]
surfaces: [page]
operations: [scaffold]
data: ["scaffold:/ok", "scaffold:/directory", "scaffold:/files", "scaffold:/version", "scaffold:/error", "scaffold:/checkedAt"]
panel: home
---
<section class="ssss-new" data-design-component="ledger-sheet" aria-labelledby="ssss-scaffold-title">
  <style>
    .ssss-new { display:grid; gap:var(--spacing-md, 12px); }
    .ssss-new h2 { margin:0; font:var(--typography-heading-font-weight, 650) var(--typography-heading-font-size, 18px)/var(--typography-heading-line-height, 1.3) var(--typography-heading-font-family, sans-serif); }
    .ssss-new p { margin:0; color:var(--color-quiet, #c2b59f); }
    .ssss-new ol { margin:0; padding-left:1.4em; display:grid; gap:var(--spacing-xs, 4px); }
    .ssss-new .warn { color:var(--color-gold, #f4c97a); }
  </style>
  <h2 id="ssss-scaffold-title">New SSSS project</h2>
  <p class="warn">Creates files. It runs only when you choose Create project in the SSSS Home panel.</p>
  <ol>
    <li>The canonical generator builds the whole project in a private staging folder.</li>
    <li>The result must include its conformance test, or nothing is published.</li>
    <li>The project moves into your directory only if that directory is new or empty.</li>
  </ol>
  <div data-design-component="ledger-slot">
    <p>The result reports where the project went, every file created and the engine release that generated it.</p>
    <code data-design-component="field-pointer">directory · files · version · error</code>
  </div>
</section>
