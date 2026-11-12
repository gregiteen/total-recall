---
type: ui-chunk:chunk
plugin: ssss
id: status
title: Installation ledger
description: Shows whether the engine, the portable SSSS skill and the managed project scaffold in the selected brain match the canonical release.
timestamp: '2026-11-08T08:12:00Z'
intents: ["check ssss installation", "is the ssss skill current", "inspect ssss scaffold", "ssss engine version"]
surfaces: [page]
operations: [status]
data: ["status:/ok", "status:/version", "status:/specVersion", "status:/skill/ok", "status:/skill/files", "status:/skill/path", "status:/skill/error", "status:/scaffold/ok", "status:/scaffold/files", "status:/scaffold/path", "status:/scaffold/error", "status:/checkedAt"]
panel: home
---
<section class="ssss-ledger" data-design-component="ledger-sheet" aria-labelledby="ssss-status-title">
  <style>
    .ssss-ledger { display:grid; gap:var(--spacing-md, 12px); }
    .ssss-ledger h2 { margin:0; font:var(--typography-heading-font-weight, 650) var(--typography-heading-font-size, 18px)/var(--typography-heading-line-height, 1.3) var(--typography-heading-font-family, sans-serif); }
    .ssss-ledger p { margin:0; color:var(--color-quiet, #c2b59f); }
    .ssss-ledger ol { display:grid; grid-template-columns:repeat(auto-fit, minmax(min(100%, 190px), 1fr)); gap:1px; margin:0; padding:0; list-style:none; background:var(--color-line, #564636); }
    .ssss-ledger li { display:grid; gap:var(--spacing-xs, 4px); }
    .ssss-ledger strong { color:var(--color-paper, #f7ebd6); }
  </style>
  <h2 id="ssss-status-title">Installation ledger</h2>
  <p>Three entries on one spine. The release is complete only when all three agree.</p>
  <ol>
    <li data-design-component="ledger-slot">
      <strong>Engine and spec</strong>
      <span>The canonical engine release and the specification version it implements.</span>
      <code data-design-component="field-pointer">version · specVersion</code>
    </li>
    <li data-design-component="ledger-slot">
      <strong>Portable skill</strong>
      <span>Every managed skill file matches its pinned hash. A local wrapper is preserved.</span>
      <code data-design-component="field-pointer">skill.ok · skill.files · skill.path · skill.error</code>
    </li>
    <li data-design-component="ledger-slot">
      <strong>Project scaffold</strong>
      <span>The complete starter project, held under the brain with its integrity receipt.</span>
      <code data-design-component="field-pointer">scaffold.ok · scaffold.files · scaffold.path · scaffold.error</code>
    </li>
  </ol>
  <p>Read-only. Choose the brain and run the check from the SSSS Home panel.</p>
</section>
