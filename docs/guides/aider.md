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
total-recall install
```

### 2. Configure the watcher
Aider stores conversation history in `.aider.chat.history.md`. Add to your `totalrecall.config.mjs`:

```javascript
export default {
  watchers: ['aider'],
};
```

### 3. Configure system prompt injection
Aider supports custom rules via the `--read` flag or `.aider.conf.yml`:

**Option A: Read file on every session**
```bash
aider --read .agent/MEMORY.md
```

**Option B: Config file (recommended)**
Create `.aider.conf.yml`:
```yaml
read:
  - .agent/MEMORY.md
```

### 4. Surface injection
Since Aider doesn't have a fixed system prompt file like `INSTRUCTIONS.md`, you can configure a custom target:

```javascript
export default {
  systemPromptFile: '.aider.rules.md',
};
```

Then read it in Aider:
```yaml
# .aider.conf.yml
read:
  - .aider.rules.md
```

### 5. Start the co-processor
```bash
tr-coprocessor start
```

## How It Works
- The aider watcher monitors `.aider.chat.history.md` for new conversation entries
- The co-processor analyzes messages and writes relevant memories to active context
- The behavioral surface is available via the configured rules file
