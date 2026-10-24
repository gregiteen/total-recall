# PLUGIN_UI_OVERHAUL — Product Requirements Document (PRD)

> **Project Prefix**: `PLUGIN_UI_OVERHAUL`
> **Status**: In Progress
> **Date**: 2026-10-22
> **Author**: Antigravity

---

## 1. Problem Statement

The current Total Recall Web UI displays all 34 discovered plugins simultaneously in a single unorganized grid. Unowned, inactive, or optional plugins appear alongside actively used ones, overwhelming the interface. Many cards lack visible titles because the shell hides the primary header when plugins declare custom UI components. Furthermore, multiple cards feature non-functional hardware skins (such as pseudo-Winamp skins) rather than real operational domain controls, and users lack an easy method to scaffold custom plugins or choose between private usage and store publishing.

## 2. Product Goals & Core Requirements

1. **Separation of Workspace and Store**:
   - **My Cards (User-Owned Workspace)**: The default dashboard view displays only plugins owned and activated by the user.
   - **Plugin Store (Marketplace & Catalog)**: Unowned and available plugins are organized into a dedicated Store view with search, category filtering, live previews, and one-click installation into the workspace.
2. **Guaranteed Identity & Uniform Shell**:
   - Every user-owned card in the workspace must display a uniform, high-contrast header containing:
     - Custom Vector Brand Mark
     - Clear, prominent Plugin Name
     - Semantic Status Pill (`● Active` / `○ Inactive`)
     - Version Tag (`v1.0.1`)
     - Quick Settings / Secrets Drawer Trigger
3. **High Utility & Purpose-Built Domain Tooling**:
   - Elimination of all fake oscilloscopes, spectrum analyzers, and Winamp skins (`[anti-patterns-ec0c0d95]`).
   - Every card must feature real domain telemetry, direct action execution buttons (>=44px touch targets), and a live monospace readout.
4. **Simple Plugin Creation Workflow**:
   - Users can create custom plugins directly within the UI or via the CLI.
   - Includes a visual wizard to set name, ID, description, template, subcommands, and secrets.
   - Offers an immediate choice between:
     - **Private Use**: Stored locally in the user's workspace or brain; never shared or deployed.
     - **Publish to Store**: Hash-pinned, version-locked, and published to the Plugin Store.
