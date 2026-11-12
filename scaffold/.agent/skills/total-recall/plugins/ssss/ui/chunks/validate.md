---
type: ui-chunk:chunk
plugin: ssss
id: validate
title: Document contract
description: Validates one SSSS Markdown document's frontmatter against the effective registry, optionally with an extension registry, and lists each error and warning.
timestamp: '2026-11-08T08:12:00Z'
intents: ["validate ssss document", "check frontmatter against registry", "why is this ssss document invalid", "validate with extension registry"]
surfaces: [page]
operations: [validate]
data: ["validate:/ok", "validate:/valid", "validate:/type", "validate:/errors", "validate:/warnings", "validate:/error", "validate:/checkedAt"]
panel: home
---
<section class="ssss-contract" data-design-component="ledger-sheet" aria-labelledby="ssss-validate-title">
  <style>
    .ssss-contract { display:grid; gap:var(--spacing-md, 12px); }
    .ssss-contract h2 { margin:0; font:var(--typography-heading-font-weight, 650) var(--typography-heading-font-size, 18px)/var(--typography-heading-line-height, 1.3) var(--typography-heading-font-family, sans-serif); }
    .ssss-contract p { margin:0; color:var(--color-quiet, #c2b59f); }
    .ssss-contract table { width:100%; border-collapse:collapse; }
    .ssss-contract th, .ssss-contract td { text-align:left; vertical-align:top; padding:var(--spacing-sm, 8px); border-top:1px solid var(--color-line, #564636); }
    .ssss-contract th { font-weight:400; white-space:nowrap; }
  </style>
  <h2 id="ssss-validate-title">Document contract</h2>
  <p>Give a document path inside the current workspace. Only the verdict comes back. The document's contents are never returned.</p>
  <table>
    <tbody>
      <tr><th scope="row"><code data-design-component="field-pointer">valid</code></th><td>Whether the frontmatter satisfies the type it declares.</td></tr>
      <tr><th scope="row"><code data-design-component="field-pointer">type</code></th><td>The SSSS primitive type the document claims.</td></tr>
      <tr><th scope="row"><code data-design-component="field-pointer">errors</code></th><td>Each violation that makes the document invalid.</td></tr>
      <tr><th scope="row"><code data-design-component="field-pointer">warnings</code></th><td>Findings that do not block validity.</td></tr>
      <tr><th scope="row"><code data-design-component="field-pointer">error</code></th><td>Why the check could not run, such as a path outside the workspace.</td></tr>
    </tbody>
  </table>
</section>
