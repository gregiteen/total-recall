---
type: ui-chunk:chunk
plugin: mesh
id: reachability-evidence-ladder
title: Trace where a mesh operation failed
description: Compare control verification, peer latency and recorded login evidence to distinguish control, network and access failures.
timestamp: "2026-11-08T23:12:00Z"
intents: [diagnose why mesh execution failed, separate mesh control and login failure, compare peer reachability with SSH access]
surfaces: [page, right]
panel: network
operations: [probe, ping, access, doctor]
data: ["probe:/control/verified", "ping:/reachable", "ping:/latency_ms", "access:/complete", "doctor:/0/reachable"]
---
<section>
  <h2>Follow the mesh evidence ladder</h2>
  <ol><li>Verify the controller independently.</li><li>Probe the named peer from this machine.</li><li>Review the recorded login and the execution probe before dispatching work.</li></ol>
</section>
