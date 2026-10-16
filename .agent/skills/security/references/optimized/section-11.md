## Mesh / headscale

- Self-hosted headscale is the control plane. Node registration = trust grant.
- Audit registered nodes periodically; a stale or unrecognised node has mesh
  reach to every service bound on the tailnet.
- Services bound to a mesh IP are **not** private by default — they are exposed
  to every node on the tailnet.
- Never hardcode a hostname, mesh IP, or personal machine name in product code.
  Bind to live discovery plus vault entity fields. Hardcoding leaks one
  operator's topology into every install.

