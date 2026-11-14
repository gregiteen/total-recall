---
name: mesh
description: "Control-server mesh administration, Tailscale SSH, and peer node discovery."
version: 0.3.0
repo_scoped: false
---

# Headscale

Control-server mesh administration, Tailscale SSH, and peer node discovery.

## When to Use

Use the `mesh` Total Recall plugin (`total-recall mesh`) instead of ad-hoc scripts or raw commands whenever working on headscale tasks.

## Commands

```bash
total-recall mesh --help
total-recall mesh file  # Transfer a file through authenticated mesh access and verify its destination hash
total-recall mesh status  # Inspect live mesh state
total-recall mesh view  # Read independent owner observations for mesh screens
total-recall mesh nodes  # Mesh nodes operation
total-recall mesh doctor  # Mesh doctor operation
total-recall mesh ssh  # Mesh ssh operation
total-recall mesh exec  # Mesh exec operation
total-recall mesh access  # Mesh access operation
total-recall mesh ping  # Mesh ping operation
total-recall mesh leader  # Read the elected leader and its server port
total-recall mesh leader-pin  # Change the pinned leader address and optional server port
total-recall mesh enroll  # Mesh enroll operation
```

## Owned Raw Commands

This plugin owns: `ssh\s`, `scp\s`, `tailscale\s+(status|ping)\b`.
