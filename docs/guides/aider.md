# Total Recall — Aider Setup Guide

> **Time:** ~3 minutes | **Watcher:** `aider` | **Surface:** Section injection

## Prerequisites
- Node.js 18+
- Aider installed (`pip install aider-chat`)
- Total Recall installed globally (`npm install -g total-recall`)

## Setup

### 1. Install into your project
```bash
cd ~/my-project
npx total-recall init
```

### 2. Connect Aider

```bash
npx total-recall connect aider
```

The command creates `.aider.rules.md` and prints the `.aider.conf.yml` snippet.

Then read it in Aider:
```yaml
# .aider.conf.yml
read:
  - .aider.rules.md
```

### 3. Run the background daemon
```bash
npx total-recall daemon start
```

## How It Works
- The behavioral surface is available via the configured rules file
- Session ingestion can be added through a generic source adapter when Aider log
  ingestion is implemented.
