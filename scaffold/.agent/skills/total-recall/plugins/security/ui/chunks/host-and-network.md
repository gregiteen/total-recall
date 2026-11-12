---
type: ui-chunk:chunk
plugin: security
id: host-and-network
title: Host and network posture
description: Observed check states and coverage for the local runtime.
timestamp: "2026-11-08T09:30:00Z"
intents: [machine security posture, local network listeners, firewall and disk checks]
surfaces: [page, right]
operations: [machine, network]
data: ["machine:/status", "machine:/coverage/observed", "machine:/coverage/total", "machine:/remediation/changed", "network:/status", "network:/coverage/observed", "network:/coverage/total"]
---
<section data-design-component="evidence-note" aria-label="Host and network scope">
  <p data-design-component="section-marker">Local runtime</p>
  <h2>Host and network posture</h2>
  <dl>
    <dt>Machine</dt><dd>Inspect firewall, disk protection and effective SSH settings.</dd>
    <dt>Network</dt><dd>Inspect the listeners visible to the current runtime. External reachability requires a separate measurement.</dd>
  </dl>
  <p>Read the observed count against the available checks before judging the result.</p>
</section>
