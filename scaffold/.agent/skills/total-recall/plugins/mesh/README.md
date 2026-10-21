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
- **UI**: `ui/panel.js` custom element with DESIGN.md tokens
- **API key**: paste it in the plugin UI (`save-token` event) or pipe it to `npx total-recall mesh token set --stdin`; stored as `HEADSCALE_API_KEY` in the secrets store

## Use it two ways

This plugin is a reusable brick, so a new project does not start from zero.

**Add it to a project (for apps you build and ship).** From the project directory:

```sh
total-recall plugin vendor https://github.com/gregiteen/tr-plugin-mesh.git 
```

This copies the plugin's source, skills, tests and docs into `bricks/mesh` and records it in `tr-bricks.json`. Your project then owns that code: edit it, test it in your own gates, and ship it with no runtime dependency on this plugin or on Total Recall. Combine as many bricks as the project needs. List them with `total-recall plugin bricks`.

**Use it directly with Total Recall (for your own machines and workflow).** Install it with `total-recall plugin install https://github.com/gregiteen/tr-plugin-mesh.git` and run `total-recall mesh`. Manage its credentials with `total-recall auth secret` and its skills with `total-recall skill`.

Native-only state: new installations use validated SSSS records and the shared auth owner. Legacy imports and compatibility fallback formats are not supported.
