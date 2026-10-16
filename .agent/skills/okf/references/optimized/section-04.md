## How SSSS Relates to OKF

There is **no formal relationship** between SSSS and OKF — no adoption announcement, no cross-reference from Google's side, no conformance program to certify against. SSSS targets OKF v0.1 compatibility as a first-class interoperability requirement: every SSSS document primitive must carry `type`, `title`, `description`, and `timestamp`, and OKF export surfaces must be plain Markdown directory trees using OKF reserved `index.md` / `log.md` semantics.

SSSS adds, on top of that shared Markdown+YAML substrate, its own primitives OKF does not define: the **Operation Contract** (idempotent mutation envelopes), the **Type Registry** (`registry/core.json`), portability classification, and **leases**.

**When developing for SSSS, keep it interoperable with OKF's concept model:**
- Never introduce binary blobs into the SSSS vault.
- Never use alternative metadata storage (like a separate database table) for document properties that belong in the YAML frontmatter.
- Always include `type`, `title`, `description`, and `timestamp`; prefer `resource`, `tags`, and `aliases` when they fit naturally.

