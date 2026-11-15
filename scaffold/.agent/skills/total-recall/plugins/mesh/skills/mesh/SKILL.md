---
name: mesh
description: "Control-server mesh administration, Tailscale SSH, and peer node discovery."
version: 0.3.2
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
total-recall mesh ssh <node> [cmd]  # Terminal session on a node, no time limit when run from a terminal
total-recall mesh exec <node> <cmd>  # Scripted command (bounded by the runner timeout)
total-recall mesh access  # Mesh access operation
total-recall mesh ping  # Mesh ping operation
total-recall mesh leader  # Read the elected leader and its server port
total-recall mesh leader-pin  # Change the pinned leader address and optional server port
total-recall mesh enroll  # Mesh enroll operation
```

## Terminal sessions

`ssh` is declared `interactive`. Run from a terminal (stdin and stdout on a TTY), Total Recall attaches it to that terminal with no runner timeout: window resizes and Ctrl-C reach ssh. A command given from a terminal gets a remote terminal (`ssh -t`), so `total-recall mesh ssh <node> 'claude setup-token'` can prompt. Piped or scripted, `ssh` runs under the runner timeout like any other command; use `exec` for scripted work.

## Owned Raw Commands

This plugin owns: `ssh\s`, `scp\s`, `tailscale\s+(status|ping)\b`.
