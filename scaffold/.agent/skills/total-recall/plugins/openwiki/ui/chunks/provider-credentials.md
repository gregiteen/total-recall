---
type: ui-chunk:chunk
plugin: openwiki
id: provider-credentials
title: Generation credential setup
description: Check provider credential presence through Auth and use the write-only settings flow.
timestamp: "2026-11-08T09:14:38Z"
intents: [check OpenWiki credentials, set provider key, inspect generation credentials]
surfaces: [page, right]
operations: [token]
data: ["token:/tokens/openrouter/configured", "token:/tokens/google/configured"]
---

<section>
  <h2>Generation credential setup</h2>
  <p><code>total-recall openwiki token status --json</code> reports which provider credentials are saved in Auth. Use the OpenWiki settings to enter a credential.</p>
  <p>To save from the terminal, use <code>total-recall openwiki token set &lt;provider&gt; --stdin</code>. Credential presence describes setup. An authorized generation run verifies provider access.</p>
</section>
