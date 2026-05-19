# Total Recall — Generic IDE Setup Guide

> **Time:** ~5 minutes | **Watcher:** `generic` | **Surface:** Any file

This guide covers setting up Total Recall with any IDE or CLI agent not specifically supported with a built-in watcher.

## Prerequisites
- Node.js 18+
- Total Recall installed globally (`npm install -g total-recall`)
- Your IDE's conversation log path known

## Setup

### 1. Install into your project
```bash
cd ~/my-project
npx total-recall init
```

### 2. Connect the client surface
For generic clients, emit the OpenAI-compatible and MCP connection details:

```bash
npx total-recall connect generic --brain https://your-brain.example.com
```

### 3. Ingest supported local session logs
```bash
npx total-recall ingest --watch
```

### 4. Pull from a remote brain
```bash
npx total-recall sync --brain https://your-brain.example.com --token <PAT>
```

## Manual Surface Injection

If your IDE doesn't support automatic rule files, you can manually include the surface:

```bash
npx total-recall compile
```

Then point the IDE at `INSTRUCTIONS.md` or a client-specific file created by
`npx total-recall connect <client>`.

## Supported Log Formats

| Format | Description | Example IDEs |
|--------|-------------|--------------|
| `text` | Plain text conversation logs | Most CLI agents |
| `json` | JSON conversation objects | API-based agents |
| `jsonl` | JSON Lines (one JSON object per line) | Claude Code, some API agents |
