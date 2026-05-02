# Total Recall — Windsurf Setup Guide

> **Time:** ~3 minutes | **Watcher:** `windsurf` | **Surface:** `.windsurf/rules/total-recall.md`

## Prerequisites
- Node.js 18+
- Windsurf IDE installed
- Total Recall installed globally (`npm install -g total-recall`)

## Setup

### 1. Install into your project
```bash
cd ~/my-project
total-recall install
```

### 2. Sync prompts
```bash
total-recall sync-prompts
```

This creates `.windsurf/rules/total-recall.md` — a rule file that Windsurf loads automatically.

### 3. Configure the watcher
Add to your `totalrecall.config.mjs`:

```javascript
export default {
  watchers: ['windsurf'],
};
```

### 4. Verify
Check that Windsurf recognizes the rule:
1. Open Windsurf
2. The behavioral surface should appear in the AI's context

## Re-syncing
Run `total-recall sync-prompts` after each `/switch` session or manual `total-recall steer` command.
