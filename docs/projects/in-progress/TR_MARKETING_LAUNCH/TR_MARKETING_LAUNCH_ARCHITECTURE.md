# TR_MARKETING_LAUNCH — Architecture

> **Project Prefix**: `TR_MARKETING_LAUNCH`
> **Kanban State**: 🏗️ In Progress
> **Author**: Greg & Antigravity
> **Date**: 2026-10-21
> **Based on audit**: `TR_MARKETING_LAUNCH_AUDIT.md` (Complete, 65427222385b0a55c72fe93782a0ede791845311)

---

## 1. System Topology: The VibeBrain Engine

The marketing and adoption architecture organizes Total Recall around a three-tier cognitive stack designed to attract, onboard, and retain autonomous developers:

```
┌────────────────────────────────────────────────────────┐
│               TIER 1: THE SURFACE LAYER                │
│    VibeBrain Brand Hook • Public Docs • Landing Copy   │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│            TIER 2: THE KNOWLEDGE RUNTIME               │
│  Deterministic Context Capsules  •  OpenWiki Hubs      │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│             TIER 3: THE SOVEREIGN VAULT                │
│   Local SSSS Markdown Nodes  •  Local Vector Indexes   │
└────────────────────────────────────────────────────────┘
```

### Component Breakdown
1. **The Public Surface (Tier 1):** The developer touchpoint comprising repository entry points, viral documentation narratives, and social proof artifacts. It articulates the brand promise: *Vibe coding without amnesia.*
2. **The Knowledge Runtime (Tier 2):** Connects memory recall directly with OpenWiki hubs. It converts static repositories into dynamic, self-documenting codebases that agents navigate effortlessly.
3. **The Sovereign Vault (Tier 3):** The local filesystem repository storing rules, preferences, and facts in open SSSS formats.

## 2. Growth & Conversion Architecture

The conversion funnel operates across five distinct phases engineered for maximum developer engagement:

```
[Awareness]   "Stop Vibe Coding with Amnesia" (Social / GitHub / NPM)
     │
     ▼
[Interest]    VibeBrain Interactive Demo & Comparison Matrix
     │
     ▼
[Activation]  One-line Terminal Onboarding (`npx total-recall init --project`)
     │
     ▼
[Retention]   Rule Capsules & OpenWiki Documentation Hubs
     │
     ▼
[Expansion]   Peer-to-Peer Plugin Ecosystem & Mesh Synchronization
```

### Funnel Mechanics
- **Hook & Contrast:** Highlight the stark difference between stateless token generation and persistent cognitive architecture. Developers immediately recognize their own frustrations with forgetful agents.
- **Immediate Utility:** Developers install and test memory within thirty seconds via local CLI commands requiring zero cloud accounts or credit cards.
- **Fail-Closed Reliability:** As agents respect rules consistently, developers transition Total Recall from an experimental tool into essential infrastructure.

## 3. OpenWiki Integration Architecture

To resolve finding F-004, the architecture incorporates OpenWiki as the human-readable companion to machine-enforceable memory:

```
┌────────────────────────────────────────────────────────┐
│                 Total Recall Core Workspace            │
│                                                        │
│   ┌─────────────────────┐      ┌───────────────────┐   │
│   │    Memory Vault     │◄────►│   OpenWiki Hub    │   │
│   │   (Rules & Facts)   │      │  (Documentation)  │   │
│   └──────────┬──────────┘      └─────────┬─────────┘   │
│              │                           │             │
│              ▼                           ▼             │
│   Deterministic Capsule         Developer Reference    │
│    (Agent Instruction)         (Architecture Guides)   │
└────────────────────────────────────────────────────────┘
```

- **Dual-Layer Documentation:** SSSS memory holds machine-validated rules (`context`), while OpenWiki hosts rich explanatory guides, system diagrams, and architectural principles.
- **Bidirectional Ingestion:** The `total-recall openwiki ingest` pipeline indexes markdown documentation hubs directly into the knowledge graph, giving agents unified access across the entire repository.

## 4. Syntax & Privacy Guardrail Architecture

In direct alignment with findings F-001 and F-002, the marketing pipeline incorporates automated verification filters:
- **Lexical Compliance Guard:** Automated lint rules scan all marketing copy and documentation to prevent any usage of restricted competitor IDE names.
- **Grammatical Integrity Filter:** Enforces the strict stylistic standard forbidding trailing prepositions in generated documentation and customer communications.
