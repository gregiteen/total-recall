---
type: ui-chunk:chunk
plugin: ssss
id: registry
title: Registry lock
description: Compares a registry lock file's integrity with the effective SSSS registry composed from the canonical core and any extension registries.
timestamp: '2026-11-08T08:12:00Z'
intents: ["verify ssss registry lock", "has the registry drifted", "compare registry integrity", "check extension registry lock"]
surfaces: [page]
operations: [registry]
data: ["registry:/ok", "registry:/valid", "registry:/expected_integrity", "registry:/actual_integrity", "registry:/specVersion", "registry:/error", "registry:/checkedAt"]
panel: home
---
<section class="ssss-lock" data-design-component="ledger-sheet" aria-labelledby="ssss-registry-title">
  <style>
    .ssss-lock { display:grid; gap:var(--spacing-md, 12px); }
    .ssss-lock h2 { margin:0; font:var(--typography-heading-font-weight, 650) var(--typography-heading-font-size, 18px)/var(--typography-heading-line-height, 1.3) var(--typography-heading-font-family, sans-serif); }
    .ssss-lock p { margin:0; color:var(--color-quiet, #c2b59f); }
    .ssss-lock .pair { display:grid; grid-template-columns:repeat(auto-fit, minmax(min(100%, 220px), 1fr)); gap:var(--spacing-sm, 8px); }
    .ssss-lock .pair > div { display:grid; gap:var(--spacing-xs, 4px); }
  </style>
  <h2 id="ssss-registry-title">Registry lock</h2>
  <p>A lock matches only when its integrity equals the integrity of the registry this engine composes now.</p>
  <div class="pair">
    <div data-design-component="ledger-slot">
      <strong>Expected</strong>
      <span>Computed from the canonical core and the extensions you name.</span>
      <code data-design-component="field-pointer">expected_integrity</code>
    </div>
    <div data-design-component="ledger-slot">
      <strong>In the lock</strong>
      <span>Read from the lock file. Empty when the lock has none.</span>
      <code data-design-component="field-pointer">actual_integrity</code>
    </div>
  </div>
  <p>The verdict is <code data-design-component="field-pointer">valid</code>. It is checked against spec <code data-design-component="field-pointer">specVersion</code>.</p>
</section>
