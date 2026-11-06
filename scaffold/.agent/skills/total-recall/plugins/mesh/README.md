# Mesh

`total-recall mesh access verify --all-pairs --json` executes actual shell
identity probes in every direction between configured SSH machines. Offline
machines and devices without an account remain explicitly unverified. Existing
network restrictions continue to apply.

`total-recall mesh file put <node> <source> <destination> --mode 600` transfers
bounded files through the recorded SSH connection, with payload on stdin and
SHA-256 readback verification. It never copies vaults or provisions accounts.

> Headscale and Tailscale SSH control-server mesh administration and node discovery

## Sharing

Offer it to your other Total Recall nodes over the mesh:

```bash
npx total-recall plugin share mesh
```

Peers install it with `npx total-recall plugin install peer:<this-node>/mesh`.

## Features

- **Identifier**: `mesh`
- **Version**: 0.1.0
- **SSSS Category**: `mesh-nodes`
- **CLI Command**: `npx total-recall mesh`
- **UI**: `ui/card.js` is the declared card component and uses `ui/DESIGN.md` tokens.
- **API key**: paste it in the plugin UI (`save-token` event) or pipe it to `npx total-recall mesh token set --stdin`; stored as `HEADSCALE_API_KEY` in the secrets store

## Install and vendor

Install the full integration with `total-recall plugin install <git URL of this repository>`. The declared standalone artifact is the control and SSH helper capability under `capability/`. The manifest lists its exports and [the capability entry](capability/index.mjs) exposes them. A consumer integration guide and independent proof remain open. The Total Recall card, host routes and auth/grant integration belong to the installed plugin.

The [Mesh project tracker](docs/projects/in-progress/MESH_CARD/MESH_CARD_PROJECT_TRACKER.md) separates runtime transport and authorization work from card checks.

## Mesh screens and integration declarations

The card defines Machines, Flows, Placement, Boundary and Join. Machines separates control membership, path checks, recorded login and actual execution. Hardware cells retain their measurement dates; failed or untested runtime probes remain unknown. Placement filters confirmed capabilities and includes the integration matrix declared in `plugin.json.mesh`.

`total-recall mesh view <machines|flows|placement|boundary|join> --json` reads fixed owner commands. Each source carries its command, attempt time and either data or an explicit error. `mesh.provides` references declared operations/runtime modules; `mesh.integrations` identifies each owner and the meaning of its evidence; `mesh.endpoints` identifies served peer routes. These are declarations, not primitive grants or proof every provider action works. Read-only views never perform enrollment, policy changes, grant edits, deployments or secret transfers.

The dashboard supplies frozen `host.operations`. Read-only cards show CLI handoffs for login administration and re-enrollment. A writable host may expose those declared actions; re-enrollment then requires target-specific confirmation. Enrollment keys never enter the card.

Auth's `host-secrets-store` runtime supplies the single host-store selector for control credentials and mesh-sync authentication. Project `AGENT_DIR`/`TR_BRAIN` cannot divert these reads. Native SSSS audit contention is serialized by the generic host; errors still fail closed. The corresponding source runtime must be installed; missing modules never select a fallback implementation.

## Using this from an agent

Send anything that reaches another machine here: running a command, copying a file, checking which machines are up, enrollment and access policy. Commands stop after about 30 seconds, so run long jobs in the background and check on them.

```bash
total-recall mesh nodes
total-recall mesh status
total-recall mesh leader --json
total-recall mesh leader-pin <mesh-ip> --port <port> --json
total-recall mesh exec <node> "<command>"
total-recall mesh file put <node> <source> <destination>
```

`leader` reads election state. Use the declared `leader-pin` write operation to change it. Issue enrollment keys with `mesh preauthkey` in an interactive terminal. Enrollment keys are unavailable through JSON or captured output.

Raw commands this plugin owns: `ssh`, `scp`, `tailscale status` and `tailscale ping`.
