# Total Recall Repository Architecture Reference

This document describes the source repository structure at `/Users/greg/Github/total-recall/`.

> **Important distinction:** This is a **dev skill** — it describes the repo that BUILDS Total Recall, not the deployed product on the target machine.

## Source Layout

```text
total-recall/
├── src/
│   ├── core/           # Product source — deployed to target machine
│   │   ├── vault.mjs         # SSSS vault read/write operations
│   │   ├── surface.mjs       # BM25+TF-IDF skill routing & compilation
│   │   ├── steering.mjs      # Conflict detection (SPO + fuzzy)
│   │   ├── dream.mjs         # Dream Cycle daemon
│   │   ├── sandbox.mjs       # Isolated code execution
│   │   ├── frontier.mjs      # BYOK frontier API routing
│   │   ├── task_runner.mjs   # P0-P5 task scheduler
│   │   ├── schema.mjs        # Zod validators
│   │   ├── pattern_detector.mjs
│   │   ├── blackboard.mjs    # Workflow state tracking
│   │   └── evolution.mjs     # Schema self-evolution
│   └── server/         # Product source — HTTP layer
│       ├── api.mjs           # OpenAI-compatible /v1/chat/completions proxy
│       └── mcp.mjs           # MCP Gateway (Streamable HTTP)
├── docs/
│   └── projects/
│       └── in-progress/
│           └── master/
│               ├── PRD.md
│               ├── DEV_PLAN.md
│               └── PROJECT_TRACKER.md
├── .agent/
│   └── skills/         # DEV SKILLS (for building Total Recall)
│       ├── skill/            # Canonical skill format guide
│       ├── mcp-expert/       # MCP protocol expertise
│       ├── cli-agents/       # Multi-agent orchestration
│       ├── repo-expert/      # THIS SKILL — repo architecture
│       ├── ssss/             # SSSS schema reference
│       ├── code-quality/     # TypeScript/lint tooling
│       ├── test/             # Test suite runner
│       └── ...
├── frontend/           # React SPA dashboard (Phase 4)
└── package.json
```

## Dev Skills vs Product Skills

| Type | Location | Purpose |
|:---|:---|:---|
| **Dev Skills** | `total-recall/.agent/skills/` | Help agents build and maintain this repo |
| **Product Skills** | `~/.agent/skills/` (on target machine) | Ship with the deployed product, used by the kernel |

The `src/` directory contains the source code that gets deployed. The `.agent/skills/` directory contains the intelligence that helps agents write that code correctly.
