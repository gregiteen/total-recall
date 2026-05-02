# Total Recall — Claude Code Setup Guide

> **Time:** ~3 minutes | **Watcher:** `claude-code` | **Surface:** `CLAUDE.md`

## Prerequisites
- Node.js 18+
- Claude Code CLI installed
- Total Recall installed globally (`npm install -g total-recall`)

## Setup

### 1. Install into your project
```bash
cd ~/my-project
total-recall install
```

### 2. Configure the watcher
Claude Code stores conversation data in `~/.claude/projects/<project-hash>/`. Add to your `totalrecall.config.mjs`:

```javascript
export default {
  watchers: ['claude-code'],
};
```

### 3. Configure the system prompt
Claude Code reads `CLAUDE.md` in the repo root. Two options:

**Option A: Symlink (recommended for shared rules)**
```bash
ln -sf INSTRUCTIONS.md CLAUDE.md
```
This shares all rules between Antigravity and Claude Code.

**Option B: Separate file with section injection**
Create a standalone `CLAUDE.md` with a `## DISTILLED MEMORY (SUBJECT STATES)` section. Total Recall will inject the surface there.

### 4. Sync prompts
```bash
total-recall sync-prompts
```
If `CLAUDE.md` is a symlink, it's automatically detected — no separate injection needed.

### 5. Start the co-processor
```bash
tr-coprocessor start
```

## Agent Pipeline
For Claude Code, the default pipeline uses:
- **Archivist**: Gemini Flash (fast, cheap extraction)
- **Synthesizer**: Claude (same engine as the main IDE)
- **Fact-Checker**: Codex (code verification specialist)

Override via config to use Claude for everything:
```javascript
export default {
  agents: {
    default: 'claude', // Use Claude for all pipeline roles
  },
};
```
