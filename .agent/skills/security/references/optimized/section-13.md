### Tailscale SSH platform limits (verified 2026-08-14)

Enabling the policy is necessary but **not sufficient** — the destination node
must also run an SSH-capable Tailscale build:

- **Linux**: supported.
- **macOS**: only the open-source `tailscale`/`tailscaled` CLI build (Homebrew
  formula) can act as an SSH *server*. The GUI App Store and standalone builds
  cannot — they are sandboxed. Any Mac with `/Applications/Tailscale.app` and
  no `tailscaled` binary will never accept Tailscale SSH, whatever the policy
  says, and must use ordinary key auth.
- Client-side connections work from any platform.

So on a Mac-to-Mac pair running the GUI build, `authorized_keys` remains the
only path. Do not chase policy configuration to fix that.

---

