---
type: ui-chunk:chunk
title: Probe Auth endpoints
description: Check whether the configured host serves Auth discovery, status, and health.
timestamp: "2026-11-08T08:53:21Z"
plugin: auth
id: endpoint-probe
intents: [probe auth endpoints, diagnose dashboard connection, check auth route health]
surfaces: [page, right]
operations: [probe]
data: ["probe:/success"]
---

<section>
  <h2>Probe Auth endpoints</h2>
  <p>Run <code>total-recall auth probe</code> to check the configured host.</p>
  <dl style="border-inline-start:2px solid var(--color-outline,#3f6350);padding-inline-start:1rem">
    <dt><code>/auth/status</code></dt><dd>Dashboard Auth discovery</dd>
    <dt><code>/auth/providers</code></dt><dd>Sign-in method discovery</dd>
    <dt><code>/health</code></dt><dd>Host reachability</dd>
  </dl>
  <p>The probe reports HTTP status and latency. Verify the account sign-in separately in the browser.</p>
</section>
