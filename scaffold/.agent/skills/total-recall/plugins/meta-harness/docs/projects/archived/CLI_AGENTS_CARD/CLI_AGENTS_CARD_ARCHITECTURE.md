# CLI_AGENTS_CARD — Architecture

> **Project Prefix**: `CLI_AGENTS_CARD`
> **Kanban State**: 🏗️ In Progress
> **Author**: Antigravity
> **Date**: 2026-10-25
> **Based on audit**: `CLI_AGENTS_CARD_AUDIT.md` (Complete, `3047ee7caea8546a1becf1e57e1cfe259d1ed302`)

---

## 1. System Overview
The Command Fleet Card (`<command-fleet-card>`) runs inside an isolated iframe sandbox managed by Total Recall. It communicates with the host system via `host.run()`, loading structured agent discovery, authentication status, and documentation state directly from CLI operations.

```
┌─────────────────────────────────────────────────────────────┐
│ Total Recall Host (PluginPanel iframe sandbox)              │
│                                                             │
│  <command-fleet-card> Custom Element                        │
│  ┌─────────────────────────┐  ┌──────────────────────────┐  │
│  │ Multi-Agent Matrix      │  │ Agent Detail Inspector   │  │
│  │ (Claude, DSH, AGY, etc.)│  │ (Auth, Version, Models)  │  │
│  └────────────┬────────────┘  └─────────────┬────────────┘  │
│               │                             │               │
│  ┌────────────┴────────────┐  ┌─────────────┴────────────┐  │
│  │ Mesh Node Switcher      │  │ Documentation Monitor    │  │
│  │ (Local, Cloud, MacBook) │  │ (Freshness, Page Count)  │  │
│  └────────────┬────────────┘  └─────────────┬────────────┘  │
└───────────────┼─────────────────────────────┼───────────────┘
                │ host.run('catalog', ['--json'])
                ▼
┌─────────────────────────────────────────────────────────────┐
│ Total Recall CLI Agents Runtime                             │
│  - src/runtime.mjs (Process Worker, Adapters, Dispatch)     │
│  - src/docs.mjs (Official Agent Documentation Engine)       │
└─────────────────────────────────────────────────────────────┘
```

## 2. Component Structure
The Web Component uses open Shadow DOM:
1. **Brand Header:** Bespoke typographic badge (`[FLEET//COMMAND]`), active mesh node chip, and total installed agent count.
2. **Node Selector Bar:** Interactive buttons to toggle target mesh nodes (`This Node`, `Cloud Node`, `MacBook Node`).
3. **Agent Discovery Matrix:** Grid of supported agents (Claude Code, DeepSeek Harness, Hermes Agent, Antigravity, OpenAI Codex, Cursor, Grok, Pi, Muse) displaying installation status, authentication badge, and current version.
4. **Agent Detail Inspector:** Interactive card displaying selected agent's permissions, primary model assignment, and official doc freshness.

## 3. Data Flow & Contract Parsing
The card queries agents via:
```javascript
const catalog = await this.host.run('catalog', ['--json']);
```
The incoming JSON structure follows:
```typescript
interface AgentCatalog {
  agents: Array<{
    id: string;
    name: string;
    installed: boolean;
    authenticated: boolean | 'unknown';
    version?: string;
    versionVerified?: boolean;
    primaryModel?: string;
    docsFresh?: boolean;
  }>;
}
```
If operations fail, the interface renders fail-closed dashes (`—`) without fabricating mock agents.

## 4. Design System Tokens
All styling binds directly to standard theme properties:
- Background: `var(--bg-secondary, #0c1427)`
- Text Primary: `var(--text-primary, #f1f5f9)`
- Text Secondary: `var(--text-secondary, #94a3b8)`
- Border Line: `var(--border, #1e293b)`
- Accent Brand: `var(--card-accent, #3b82f6)`
- Success Tone: `var(--tone-ok, #10b981)`
- Warning Tone: `var(--tone-warn, #f59e0b)`
- Danger Tone: `var(--tone-danger, #ef4444)`
All interactive elements maintain 44px minimum touch targets and respond to `prefers-reduced-motion` media queries.
