---
name: plugins
description: Standards, authoring guide, and CLI workflows for Total Recall plugins.
repo_scoped: false
---

# Total Recall Plugin Standard & Authoring Guide

Total Recall capabilities beyond portable memory belong in standalone plugins. This specification details the executable plugin contract, step-by-step authoring procedures, and CLI workflows ensuring any user-authored plugin remains completely compatible across the Total Recall ecosystem.

## Core Architectural Invariants

1. **Portable Memory Separation**: Core Total Recall maintains only portable memory, the SSSS vault, and instruction compilers. Auxiliary tools, domain features, telephony, specialized analyzers, and user interfaces must exist as independent plugins.
2. **Standard Manifest (`plugin.json`)**: Every plugin defines an authoritative `plugin.json` adhering to `metadata.plugin.schema.json`.
3. **Canonical State via SSSS**: Plugins must never perform unmanaged raw filesystem writes. Persistent records, configuration overlays, and event telemetry must use SSSS VFS operations.
4. **Token-Driven UI Elements**: Plugin interface components must avoid hardcoded color values. Visual styling must reference standard design tokens from `DESIGN.md`.
5. **No AI Slop & Clean Copy**: Plugin documentation and user-facing text must avoid trite terms such as "sovereign", "synergy", or "leverage", and must never conclude any sentence with a preposition.

---

## The Plugin Manifest Contract (`plugin.json`)

A valid plugin contains `plugin.json` at its root:

```json
{
  "$schema": "https://github.com/gregiteen/total-recall/blob/main/metadata.plugin.schema.json",
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "description": "Concrete explanation of the exact job this plugin performs.",
  "author": "Author Name",
  "license": "MIT",
  "use_cases": ["developer-tools"],
  "cli": {
    "command": "my-tool",
    "handler": "./cli.mjs",
    "subcommands": [
      { "name": "status", "description": "Display runtime status" },
      { "name": "run", "description": "Execute main capability" }
    ]
  },
  "runtime": {
    "jobs": [
      {
        "id": "periodic-check",
        "schedule": "0 * * * *",
        "command": "status",
        "description": "Hourly status verification"
      }
    ],
    "daemons": [],
    "startup": []
  },
  "deploy": {
    "targets": ["ssss-app", "nextjs", "react", "flask"],
    "required_ssss_version": ">=0.9.3",
    "access_grants": ["ssss:vault:read", "ssss:vault:write"]
  }
}
```

### Manifest Specifications

- **`id`** *(required)*: Lowercase kebab-case string (`^[a-z][a-z0-9-]{1,63}$`). Must match the repository or folder identifier.
- **`name`** *(required)*: Human-readable display label.
- **`version`** *(required)*: Semantic version string (`x.y.z`).
- **`description`** *(required)*: Clear, functional explanation (minimum 5 characters).
- **`use_cases`** *(optional)*: Array of kebab-case tags used for catalog indexing and search filters.
- **`cli`** *(optional)*: Declares the CLI command name, the relative ES module handler (`cli.mjs`), and an array of subcommands.
- **`runtime`** *(optional)*:
  - **`jobs`**: Scheduled background cron routines (`schedule`, `command`, `timeout_seconds`, `secrets`).
  - **`daemons`**: Continuously running background services (`handler`, `restart`, `stop_signal`).
  - **`startup`**: Lifecycle initialization hooks executed when the host begins execution.
- **`deploy`** *(optional)*: Target application hosts and required SSSS permission scopes.
- **`ui`** *(optional)*: Declares reusable custom web component elements (`elements[]`), property interfaces, and required design tokens.

---

## Step-by-Step Plugin Creation Workflow

### Step 1: Scaffold the Plugin
Initialize a new plugin structure through the CLI:
```bash
total-recall plugin create my-plugin --name "My Plugin" --description "Handles custom workflows" --use-case automation --with-cli
```
This scaffolds a standard directory containing `plugin.json`, `cli.mjs`, and documentation.

### Step 2: Implement the Command Handler (`cli.mjs`)
The handler module must export a callable function:
```javascript
/**
 * CLI Handler for my-plugin
 * @param {string[]} argv - Command-line arguments passed after the command name
 */
export async function run(argv) {
  const [subcommand, ...args] = argv.slice(2);
  
  if (subcommand === "status") {
    console.log("My Plugin is fully operational.");
    return;
  }
  
  if (subcommand === "run") {
    console.log("Executing capability with arguments:", args);
    return;
  }

  console.log("Usage: total-recall my-tool <status|run>");
}

export default run;
```

### Step 3: Add SSSS Memory Categories (Optional)
If your plugin defines new structured memory types, declare them inside `plugin.json`:
```json
"ssss_schemas": {
  "categories": [
    {
      "name": "custom-audit",
      "description": "Structured records for compliance tracking",
      "node_type": "memory",
      "template": "./templates/audit.md"
    }
  ]
}
```

### Step 4: Validate the Plugin
Run validation before publishing or deploying:
```bash
total-recall plugin info my-plugin
```
Ensure the validator returns zero schema errors.

---

## Operating Plugins Through the Total Recall CLI

The Total Recall CLI provides complete lifecycle management for plugins:

### 1. Discover and Search
- **List installed plugins**:
  ```bash
  total-recall plugin list
  ```
- **List available bundled plugins**:
  ```bash
  total-recall plugin available
  ```
- **Search plugins by keyword or use case**:
  ```bash
  total-recall plugin search telemetry --use-case monitoring
  ```

### 2. Install and Link
- **Install from a local directory (symlink during active development)**:
  ```bash
  total-recall plugin install /path/to/my-plugin --link
  ```
- **Install globally for all workspaces across the machine**:
  ```bash
  total-recall plugin install /path/to/my-plugin --global
  ```
- **Install from a remote git repository**:
  ```bash
  total-recall plugin install https://github.com/org/plugin-repo.git
  ```
- **Install from a mesh peer node**:
  ```bash
  total-recall plugin install peer:mac-mini/code-quality
  ```

### 3. Inspect and Execute
- **Inspect detailed plugin metadata, hashes, and scheduled task logs**:
  ```bash
  total-recall plugin info my-plugin
  ```
- **Execute installed plugin commands directly**:
  ```bash
  total-recall my-tool status
  ```

### 4. Share and Distribute
- **Share a plugin via a verified hash-pinned link**:
  ```bash
  total-recall plugin share my-plugin
  ```
- **Revoke sharing access**:
  ```bash
  total-recall plugin unshare my-plugin
  ```
- **Remove or uninstall a plugin**:
  ```bash
  total-recall plugin remove my-plugin
  ```

---

## Authoring Standards Checklist

Before distributing any plugin, confirm each requirement:
- [ ] `plugin.json` passes validation against `metadata.plugin.schema.json`.
- [ ] CLI commands exit with code `0` on success and non-zero on failure.
- [ ] No private secrets, personal user paths, or session tokens exist in the repository.
- [ ] SSSS data modifications use validated operations rather than raw disk writes.
- [ ] User interface components utilize design tokens without hardcoded colors.
- [ ] All written documentation avoids forbidden words and concludes every sentence without a preposition.
