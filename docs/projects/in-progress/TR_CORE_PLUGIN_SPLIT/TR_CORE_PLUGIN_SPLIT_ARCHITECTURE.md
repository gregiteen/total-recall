# TR_CORE_PLUGIN_SPLIT — Architecture

> **Project Prefix**: `TR_CORE_PLUGIN_SPLIT`
> **Kanban State**: In Progress
> **Date**: 2026-10-07
> **Based on audit**: TR_CORE_PLUGIN_SPLIT_AUDIT.md (Complete, 9b2e21f)

## Target

```mermaid
flowchart TB
  M[Memory CLI and API] --> V[Validated SSSS vault operations]
  V --> I[Derived search indexes and instruction surfaces]
  H[Minimal plugin loading and authorization interfaces] --> M
  P[Separately owned capability plugins] --> H
  P --> S[Plugin-owned schemas, config and events]
  P --> U[Plugin-owned UI and runtime]
```

The diagram is the target. Current source still directly mounts feature routers and embeds agent/research task behavior. Extraction is incomplete.

## Current source and required boundary

| Area | Current owning source | Target owner / required proof |
| --- | --- | --- |
| Memory and instructions | `src/core/kernel-*`, vault/search/recall/surface/context; memory/instructions/rules routes | Core; offline memory workflow and complete required-rule coverage |
| Plugin discovery and artifact loading | `src/core/plugin-loader.mjs`, plugin-store/runner/context, `src/cli/plugin.mjs` | Minimal generic host contract; digest, scope, lifecycle and failure isolation |
| Feature router/tool mounts | `src/server/rest.mjs`, `src/server/tools.mjs` | Manifest-driven scoped contracts consumed by plugin owners |
| Research, agents, scheduling and host administration | `src/core/daemon-loop.mjs`, task-executors, research, runtime/meta-harness, mesh and rotation modules | Capability plugins; generic memory maintenance retained only with a justified interface |
| Skill registry/config/optimizer and IDE tooling | skills-registry, skill-config, skill-optimizer, skill CLI/connect/startup modules | Tooling plugins/adapters; preserve repo-owned layers and instruction access |
| Capability app composition | `src/core/app-deploy/`, `src/cli/app/` | Composer plugin; canonical scaffolding, operation-backed state, independent runtime |
| Plugin product panels | `frontend/src/components/plugins/previews/`, PluginsPage and capability pages | Installed plugin-owned interfaces; host supplies generic slots only |
| Browser capture and integration | `extension/`, capture/import/integration routes | Extension/capture capability owner; explicit permissions and actual installed reload proof |
| Cloud service and rollout | current launch/service configuration and `scripts/auto-pull.sh` | Operations owner; deployment cannot stop the sole serving process |

## State and compatibility

A plugin owns its extension schemas and writes through authorized SSSS operations. Rebuildable projections may cache state but cannot become an independent source. Memory and app records survive uninstall. Secret access uses audited references/grants; public artifacts contain no private values or machine instances.

Reuse existing capability repositories and source rather than reconstructing each feature in the core. Compatibility command adapters delegate to the owner, expose failures and have a recorded removal condition. No permanent duplicate implementation. A missing plugin reports unconfigured/unavailable instead of running a hidden built-in substitute.

## Minimum migration path

Select an existing working capability with low coupling, use its existing repository/artifact, and prove the smallest memory-host interface needed to install and invoke it. Existing CLI/task/loading interfaces are the starting point. Route/tool/event/UI extension families are not a prerequisite bundle; introduce only an interface required by a selected real consumer.

Audit every remaining feature import as reused/extracted, removed as unused, or a necessary generic memory interface. Preserve existing data even when unused code is removed. The app composer and new capability catalogs remain with their external owners and have no new core implementation scope.

## Shared contracts

The host loads installed `ui.elements` custom elements through the existing confined authenticated module route. It supplies a scoped bridge for declared CLI operations, selected-brain API access and credential metadata/storage. Purpose-specific state, controls, provider SDKs and configuration definitions reside in owner repositories. No hardcoded plugin-ID UI registry remains in the host. Owner modules are self-contained browser bundles. Credential values never enter manifests, vault records, module URLs, arguments or success output.

Add route/tool/event/config/UI contracts only when an extracted consumer requires them. Define namespace, permissions, timeout, unload, restart, error propagation and artifact identity together. The current schema's UI/app CLI fields and generators are useful source foundations, but they do not prove generic runtime mounts or independent app execution.

Installation needs artifact identity and a verified selected-plugin path. Memory initialization has no feature-bundle dependency. New public exchange/discovery/reviews are outside this reduced project; their plugin owner can support those behaviors with its own evidence. Remove unsupported core trust surfaces during extraction. Memory-host acceptance does not require every provider or every distribution channel.

## Project architecture

This five-file project owns order and acceptance. `evidence/consolidation/source-items.json` maps all 549 historical checklist claims, and `SOURCE_PROJECT_REGISTER.md` explains each predecessor's disposition. Archived projects retain their original documents and logs with successor links. External owner projects are dependencies, not competing Total Recall plans. HANDOFF points here first.

## Compatible release boundary — 3.39.0

The release retains existing `total-recall`, `npm start`, package root export and dashboard/plugin scaffold. `total-recall-memory`, `start:memory` and the `/memory` export provide the isolated memory runtime. This preserves recent extraction work without silently removing existing consumer interfaces. The final default memory-only artifact remains a breaking migration with its original implementation acceptance. Host update status uses semantic precedence independently of older registered consumers.

## Proposed generated card face boundary

Reuse the plugin-owned custom element and host operation contracts. The generation capability belongs to an explicit plugin owner, while Total Recall hosts loading and authorized operations. Supply a redacted capability/state description, design tokens and the available card dimensions. Validate generated code and its declared controls before mounting, retain the last working face after failures, and update live values through a stable host contract. Code generation and live state refresh are distinct operations so forms retain their state. This is a proposed addition, not implemented or verified behavior.

## Security boundary refresh — 2026-10-08

Plugin UI owner code now loads in an opaque-origin scripts-only iframe with CSP prohibiting direct network requests and embedding. The parent accepts messages only from the exact frame and a fresh channel, bounds command arguments/concurrency, and dispatches only manifest-declared subcommands under existing server authorization. Browser isolation does not sandbox installed native handlers. The model generator must use masked metadata and this UI boundary; it cannot receive raw secrets or install generated native handlers automatically.

## Verified pre-launch security candidate — 2026-10-08 UTC

The current candidate security checks pass for exact source `72abfdd410ebdc9fae6bda227a8fd05745e415b988b24331979cc43c10d56207`: nine gates, 383 test files and 2,405 tests, native source/installed health, clean consumer dependency audit and 43 installed lifecycle operations. Both lockfiles have zero reported advisories. Publishing dry run passes; all 579 package files match between test/publishing hosts, with zero credential-pattern/private-credential-path matches. Initialization preserves existing and concurrent credentials. Test-host configuration was restored byte-exact from the pre-incident snapshot, canonical memory preserved, owned additions quarantined, local indexes rebuilt with zero drift and snapshot unmounted. SSH cannot unlock the restored store, so live decryption remains unverified. Detailed evidence: [security audit](evidence/release-3.39.0/security-audit.md). Model-generated card faces remain unimplemented and unaudited; the project stays In Progress. No publication or live runtime upgrade.
