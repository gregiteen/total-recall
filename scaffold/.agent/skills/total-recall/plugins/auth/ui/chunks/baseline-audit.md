---
type: ui-chunk:chunk
title: Security baseline
description: Review Auth checks for passkey file permissions, session signing, and Google credentials.
timestamp: "2026-11-08T08:53:21Z"
plugin: auth
id: baseline-audit
intents: [run auth audit, check sign-in security baseline, investigate authentication warnings]
surfaces: [page, right]
operations: [audit]
data: ["audit:/passed", "audit:/findings_count"]
---

<section style="border-block-start:1px solid var(--color-outline,#3f6350)">
  <h2>Security baseline</h2>
  <dl>
    <dt><strong>Passkey storage</strong></dt><dd>Checks that Auth can read its active passkey state and that the document has private permissions.</dd>
    <dt><strong>Session signing</strong></dt><dd>Checks that the dashboard signing credential is present and long enough.</dd>
    <dt><strong>Google credentials</strong></dt><dd>Flags a configured client ID with a missing client secret.</dd>
  </dl>
  <p>Run the baseline in Auth Home or use <code>total-recall auth audit</code> to inspect individual findings.</p>
</section>
