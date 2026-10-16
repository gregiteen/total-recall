## Egress: what leaves this host

This is TR's most under-audited surface. The vault is plaintext and the
embedding path ships it off-box.

- **Embedding content is vault content.** Whatever endpoint serves embeddings
  receives the operator's memory in cleartext. Endpoint selection is therefore
  a confidentiality decision, not a performance one.
- **Discovery trusts any mesh peer that answers.** `resolveOllamaEndpoint()`
  probes online peers on the Ollama port and uses the first responder. A hostile
  device admitted to the tailnet could impersonate that service and harvest
  vault text. Mitigations: explicit config wins over discovery (already ordered
  that way), and **headscale membership is the real trust boundary** — audit
  `/api/v1/node` for nodes you do not recognise.
- **Prefer local/mesh embeddings over hosted.** It is both cheaper and
  strictly better for confidentiality: nothing leaves the operator's network.
- **URL construction from env** (`TR_OLLAMA_URL`, `OLLAMA_HOST`) is
  operator-controlled and therefore trusted — but it must never become
  request-controlled. If a route ever accepts a URL, add a private-network
  blocklist first (localhost, 10/8, 172.16/12, 192.168/16, 169.254/16 metadata,
  `file://`).
- Outbound fetch is governed by the throttled-fetch network policy. Local mesh
  calls deliberately bypass throttling — that exemption must stay scoped to
  local infrastructure, never widened to arbitrary hosts.

---

