# PLUGIN_UI_OVERHAUL — Architecture Specification

> **Project Prefix**: `PLUGIN_UI_OVERHAUL`
> **Status**: In Progress
> **Date**: 2026-10-22
> **Author**: Antigravity

---

## 1. Core Operating Principles

1. **Only User-Owned Cards in the Active UI**:
   The primary workspace grid renders ONLY cards that the user owns (installed, active, and configured for the current project or machine). Unowned or available plugins never clutter the active dashboard.
2. **The Plugin Store Is the Home for Unowned Plugins**:
   Unowned, bundled, community, and mesh-shared plugins belong in the **Plugin Store**. In the store, plugins appear as catalog listings with metadata, descriptions, permissions, live previews, and one-click installation into the workspace.
3. **Users' Agents Create Plugins From a Recipe**:
   The system does not generate plugins autonomously. Contextual coding agents create plugins on behalf of the user following a declarative, standardized **Recipe**.
4. **Bespoke, High-Utility Domain Cards**:
   No fake oscilloscopes, spectrum analyzers, or pseudo-Winamp skins (`[anti-patterns-ec0c0d95]`). Every plugin card delivers authentic domain telemetry, touch-first operational buttons (>=44px), and live execution streams.
5. **Private Use vs. Store Publishing**:
   When an agent creates a plugin, the user can choose to keep it strictly private in their local workspace/brain or publish it to the Plugin Store with a signed, hash-pinned package.

---

## 2. The Agent Plugin Recipe Specification

A **Plugin Recipe** is the declarative contract an agent follows to construct a complete, functional plugin brick:

```yaml
# Total Recall Plugin Recipe Contract
recipe_version: "1.0.0"
plugin:
  id: "kebab-case-id"
  name: "Human Readable Name"
  version: "0.1.0"
  description: "One clear sentence defining the plugin's real operational job."
  use_cases: ["category1", "category2"]
  distribution:
    tier: "official" # core | official | personal | community
    license: "open"   # open (vendored source) | closed (metered service)
  branding:
    name: "Brand Name"
    color: "#hexcolor"
    accent: "#hexaccent"
    font: "ibm-plex" # system | inter | ibm-plex | space-grotesk | jetbrains-mono | chivo-mono
    badge: "Domain Badge"
  template: "workbench" # console | ledger | monitor | inbox | dashboard | workbench | vault
  cli:
    command: "cli-verb"
    subcommands:
      - name: "status"
        description: "Live state query"
        effect: "read"
        output: "json"
      - name: "primary-action"
        description: "Primary operational command"
        effect: "write"
        output: "json"
        args:
          - name: "target"
            flag: "--target"
            type: "string"
            required: true
  secrets:
    - key: "PROVIDER_API_KEY"
      description: "Resolved via Total Recall auth store"
      required: false
  ui:
    component: "custom-element-tag"
    module: "ui/card.js"
    features:
      - "Real domain status indicator"
      - "Touch-friendly primary action buttons (>=44px)"
      - "Monospace live execution log"
```

---

## 3. Web UI Architecture

### A. Workspace ("My Cards")
- Fetches installed plugins.
- Filters strictly to plugins that are user-owned and enabled (`activation.enabled !== false`).
- Wraps each in [`CardEngine.tsx`](file:///Users/gregoryiteen/github/total-recall/frontend/src/components/plugins/card/CardEngine.tsx) with a guaranteed, uniform top bar:
  - Custom Brand Mark & Name
  - Semantic Status Pill (`● Active` / `○ Inactive`)
  - Version Tag & Category Badge
  - Quick Drawer Trigger for Settings & Secrets

### B. Plugin Store ("Store")
- Displays unowned plugins available from bundled packages, mesh peers, and the store registry.
- Features:
  - Search & Use-Case Filter
  - Card Preview Modal (renders sandboxed preview of the plugin card)
  - One-click **"Install to Workspace"** or **"Vendor as Brick"**
  - **"Create Plugin with Agent"** Action: Generates a pre-filled agent recipe prompt so the user's coding agent can immediately scaffold and implement a custom plugin.
