---
name: code-mode
description: "Single Source of Truth for the Total Recall Code Mode Infrastructure. Universal tool-surface (search_api, execute_api) that replaces legacy MCP tool runtimes. Use this skill to understand the sandbox, discovery engine, and instruction-led architecture."
command: /code-mode
metadata:
  version: "1.0.0"
allowed-tools: Read Edit Bash
---
#  Code Mode  The Universal Assistant Runtime

Code Mode is the **unified, instruction-led execution architecture** for Total Recall. It replaces the legacy JIT-loaded MCP tool system with two universal primitives: `search_api` and `execute_api`.

##  The Architecture Shift

| Aspect | Legacy MCP System | Code Mode (New) |
|--------|-------------------|-----------------|
| **Runtime** | Per-skill JIT Node/Python/Docker | **One Shared Context** (Node vm sandbox) |
| **Tool Surface** | Hundreds of pre-defined tools | **Two Tools**: `search_api` & `execute_api` |
| **Discovery** | Model-led JIT tool loading | **Search-led** discovery (Internal KB + Web) |
| **Implementation** | Heavyweight MCP servers | **Lightweight Instructions** (SKILL.md) |
| **Execution** | Tool-name mapping | **TypeScript code** using `fetch` or `api` |

---

##  The Core Tools

Every assistant turn bootstraps exactly two tools through `AssistantRuntimeToolService`:

### 1. `search_api(query, limit?, hydrateSkillId?)`
The discovery engine for all capabilities.
- **Internal**: Searches Total Recall API docs, **Capability Packs**, and **Skill Packages**.
- **External**: Triggers web search (Brave/Serper) for external documentation.
- **Hydration**: Returns full `SKILL.md` instructions, scripts, and assets for a matched Skill.

### 2. `execute_api(code, timeout?)`
The universal execution engine.
- **Sandbox**: Runs TypeScript in a secure `vm` context (`CodeExecutor.ts`).
- **Globals**: `fetch`, `api` (internal client), `credentials` (flat map), and `skillFs`.
- **Limits**: 5s timeout, 20 API calls per turn, memory/serialization safeguards.

---

##  Key Backend Components

| Component | Responsibility |
|-----------|----------------|
| `AssistantRuntimeToolService` | The registry and tool-call router. |
| `CodeExecutor` | The Node.js VM sandbox that runs the code. |
| `AssistantInvocationService` | The shared contract for all entrypoints. |
| `AssistantToolChatService` | The recursive loop that handles server-side tool calls. |
| `CrystallizationService` | Detects successful execution and persists patterns. |
| `CodeModeDocsService` | Syncs internal route documentation to the Knowledge Base. |
| `CodeModeCapabilityPackService` | Generates docs for native platform features. |

---

##  Skills 2.0: The Instruction Layer

In Code Mode, **Skills are not runtimes**. They are **DB-native instruction packages** (`SKILL.md`) that teach the assistant *how* to use the two core tools.

1. **Guidance**: Instructions on which internal endpoints to call for a domain.
2. **Assets**: Reusable scripts or reference material included in the package.
3. **Roles**: `shared/system`, `workspace_selective`, `assistant_personal`.
4. **Handoff**: Scoped memory inheritance across system/workspace/assistant layers.

---

##  Credentials & Security

Code Mode uses a **Global Keychain** model:
- `CredentialManager` resolves all user secrets into a flat map.
- `execute_api` injects this map into the sandbox as the `credentials` global.
- **Privacy**: Key names are visible for planning; secret values never leave the sandbox.
- **Isolation**: All internal `api` calls use `x-workspace-id` and `req.effectiveUserId`.

---

##  End-to-End Workflow

1. **Discover**: Assistant calls `search_api` to find endpoints or skill instructions.
2. **Plan**: Assistant reads documentation and hydrates necessary skill packages.
3. **Execute**: Assistant writes and calls `execute_api` with TypeScript code.
4. **Verify**: Assistant checks status codes (2xx) and result data.
5. **Crystallize**: Successful runs are logged to improve future turns.
6. **Heal**: If a 404/drift occurs, `healApiDrift` provides a live correction hint.

---

##  Implementation & Maintenance Protocol

When adding OR **modifying** a system capability:

1.  **Define the Route**: Add or edit the API endpoint in `server/routes/`.
2.  **Document with Types**: All routes MUST have explicit TypeScript request/response interfaces for the documentation generator.
3.  **Sync to KB (MANDATORY)**: Immediately run `npx tsx scripts/sync-api-kb.ts`. 
    - This updates the internal Knowledge Base that `search_api` uses to find capabilities.
    - Failing to do this causes **API Drift**, leading to 404s and 500s when the assistant follows stale docs.
4.  **Update Documentation Fidelity**: If the change affects a core capability described in a repository Skill (like `repo-expert` or `skill`), YOU MUST update that `SKILL.md` to reflect the new architecture. 
    - Repository skills MUST maintain high fidelity (3000+ lines where appropriate).
    - NEVER leave a skill in a "truncated" or "minimalist" state after an infrastructure change.
5.  **Heal the Discovery Engine**: Verify that `search_api` can "find" the new or changed route by running a test query.

---

##  Universal Standards

1. **Raw fetch over SDKs**: Prefer raw `fetch` or the `api` client inside the sandbox.
2. **Async Everything**: Code in `execute_api` must be an `async` function body.
3. **No Side Effects in Planning**: Search is for discovery; execution is for action.
4. **Attribution**: Always log which docs/skills were used via `retrievalAttribution`.

---

##  Changelog

### [1.1.0] - 2026-04-06
- **Protocol Elevation**: Mandated the use of `sync-api-kb.ts` for EVERY API change to prevent discovery drift.
- **Fidelity Standard**: Codified the 3000-line "Extreme Fidelity" requirement for repository skills to ensure the agent's mental model is always hydrated with ground-truth architecture.

### [1.0.0] - 2026-04-06
- Initial release of Code Mode SSOT.
- Documented transition from MCP to universal primitives.
- Defined Core Tools, Sandbox Globals, and Evolution Pipeline.
