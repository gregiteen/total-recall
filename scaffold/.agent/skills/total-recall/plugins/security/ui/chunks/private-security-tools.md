---
type: ui-chunk:chunk
plugin: security
id: private-security-tools
title: Private security operations
description: Terminal workflows for encrypted envelopes, Auth-managed keys, proof challenges and token-bearing risk checks.
timestamp: "2026-11-08T09:30:00Z"
intents: [encrypt or decrypt securely, manage security key with Auth, verify proof challenge or bot risk]
surfaces: [page, right]
operations: [encrypt, decrypt, token, challenge, bot-mitigate]
---
<section data-design-component="evidence-note" aria-label="Private security operations">
  <p data-design-component="section-marker">Terminal scope</p>
  <h2>Use the owner CLI for private material</h2>
  <p>Pass plaintext for envelope encryption through standard input and read decryption results in an interactive terminal. Use bundled Auth for key management. Run proof challenges and provider-token risk checks in the terminal.</p>
</section>
