---
type: ui-chunk:chunk
plugin: ssss
id: conformance
title: Engine conformance
description: Runs the canonical SSSS reference engine conformance suite and reports its exit code and full output as evidence.
timestamp: '2026-11-08T08:12:00Z'
intents: ["run ssss conformance", "does the ssss engine pass its suite", "engine conformance evidence"]
surfaces: [page]
operations: [conformance]
data: ["conformance:/ok", "conformance:/exitCode", "conformance:/signal", "conformance:/output", "conformance:/error", "conformance:/checkedAt"]
panel: home
---
<section class="ssss-suite" data-design-component="ledger-sheet" aria-labelledby="ssss-conformance-title">
  <style>
    .ssss-suite { display:grid; gap:var(--spacing-md, 12px); }
    .ssss-suite h2 { margin:0; font:var(--typography-heading-font-weight, 650) var(--typography-heading-font-size, 18px)/var(--typography-heading-line-height, 1.3) var(--typography-heading-font-family, sans-serif); }
    .ssss-suite p { margin:0; color:var(--color-quiet, #c2b59f); }
  </style>
  <h2 id="ssss-conformance-title">Engine conformance</h2>
  <p>Runs the reference engine suite that ships with the canonical package, with a two-minute limit. This checks the engine, not your installation or your documents.</p>
  <div data-design-component="evidence-readout">
    <p>Passes only on exit code 0. The suite's own output is kept whole as evidence. A timeout or signal is reported as a failure with its cause.</p>
    <code data-design-component="field-pointer">exitCode · signal · output · error</code>
  </div>
</section>
