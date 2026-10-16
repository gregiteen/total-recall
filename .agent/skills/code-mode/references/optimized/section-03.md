## 2. Omnichannel Dashboard Surface

While the system is autonomous, human operators interact with the sandbox and memory structure via the React Dashboard SPA.

- **Routing**: Reverse proxied by Caddy, running on standard TLS ports.
- **Visual SSSS Manager**: A UI for manipulating the YAML frontmatter and priority logic of memory nodes in `.agent/memory-vault/`.
- **Code Playground**: A live execution surface to test `scripts/` before committing them to a `SKILL.md`.
- **File Explorer**: Direct VFS explorer for `~/.agent/`.
- **IDE Integration**: The dashboard is fully renderable inside standard IDE editors and browsers, allowing for seamless human-in-the-loop oversight.

