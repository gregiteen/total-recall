---
type: ui-chunk:chunk
plugin: ssss
id: repair
title: Repair managed files
description: Restores missing, stale or previously repinned managed SSSS skill and scaffold files in the selected brain, then verifies them again.
timestamp: '2026-11-08T08:12:00Z'
intents: ["repair ssss installation", "restore missing ssss skill", "fix stale ssss scaffold", "replace dangling ssss skill link"]
surfaces: [page]
operations: [repair]
data: ["repair:/ok", "repair:/version", "repair:/specVersion", "repair:/skill/ok", "repair:/skill/files", "repair:/scaffold/ok", "repair:/scaffold/files", "repair:/recoveredFrom", "repair:/replacedLink/path", "repair:/replacedLink/target", "repair:/error", "repair:/checkedAt"]
panel: home
---
<section class="ssss-repair" data-design-component="ledger-sheet" aria-labelledby="ssss-repair-title">
  <style>
    .ssss-repair { display:grid; gap:var(--spacing-md, 12px); }
    .ssss-repair h2 { margin:0; font:var(--typography-heading-font-weight, 650) var(--typography-heading-font-size, 18px)/var(--typography-heading-line-height, 1.3) var(--typography-heading-font-family, sans-serif); }
    .ssss-repair p, .ssss-repair dd { margin:0; }
    .ssss-repair dl { display:grid; gap:var(--spacing-sm, 8px); margin:0; }
    .ssss-repair dt { color:var(--color-paper, #f7ebd6); font-weight:650; }
    .ssss-repair dd { color:var(--color-quiet, #c2b59f); }
    .ssss-repair .warn { color:var(--color-gold, #f4c97a); }
  </style>
  <h2 id="ssss-repair-title">Repair managed files</h2>
  <p class="warn">Writes to the selected brain. It runs only when you choose Repair in the SSSS Home panel.</p>
  <dl>
    <div data-design-component="ledger-slot">
      <dt>What it replaces</dt>
      <dd>Managed skill and scaffold files that are missing or differ from the canonical release. A dangling or stale skill link becomes a managed folder. The link's target is left untouched.</dd>
    </div>
    <div data-design-component="ledger-slot">
      <dt>What it keeps</dt>
      <dd>Your skill wrapper and any unrelated files. A previously repinned scaffold is set aside, not deleted.</dd>
      <dd><code data-design-component="field-pointer">recoveredFrom · replacedLink.path · replacedLink.target</code></dd>
    </div>
    <div data-design-component="ledger-slot">
      <dt>How it reports</dt>
      <dd>The same ledger as the installation check, read again after the repair. If verification still fails, the error names the part.</dd>
      <dd><code data-design-component="field-pointer">ok · skill.files · scaffold.files · error</code></dd>
    </div>
  </dl>
</section>
