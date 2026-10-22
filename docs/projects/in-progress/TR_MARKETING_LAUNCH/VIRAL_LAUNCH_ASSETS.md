# VibeBrain Viral Launch Assets

> **Total Recall Marketing Suite**  
> **Campaign Asset Bundle:** Announcement Posts, Comparison Matrix, Quickstart Walkthrough  

---

## 1. Viral Announcement Post (X / Hacker News / Reddit)

**Title:** Stop Vibe Coding with Amnesia: We Built an Open-Source Memory Brain for Autonomous Coding Agents

**Body:**

If you have used autonomous coding agents over the past year, you know the frustration:

You spend hours building an elegant application. The agent writes clean components, sets up an authentication flow, and hooks up the database schema. Everything works.

Then you close your laptop.

Tomorrow morning, you open a new chat window and ask the agent to add a new billing endpoint. Within seconds, the agent deletes your previous authentication helpers, installs conflicting npm packages, and hallucinates a new database structure.

This is **The Goldfish Problem**.

Modern coding agents possess immense reasoning power, but zero persistent memory. Once conversation tokens compress or context windows clear, the agent forgets every architectural decision you established.

We built **Total Recall (The VibeBrain)** to solve this problem forever.

### What It Does
Total Recall gives any coding agent persistent, lifelong memory directly on your local machine:
- **Instant Local Vault:** Stores rules, preferences, and system facts in plain SSSS Markdown and local SQLite databases.
- **Fail-Closed Context Capsules:** Before any agent writes a single line of code, `total-recall context` injects your required rules and architectural invariants.
- **Integrated OpenWiki Hubs:** Connects your code directly to structured documentation graphs so agents navigate dependencies effortlessly.
- **Zero Cloud Lock-In:** Your intellectual property never leaves your computer.

### The 30-Second Quickstart
```bash
# 1. Install Total Recall globally
npm install -g total-recall-brain

# 2. Initialize a persistent brain for your project
total-recall init --project

# 3. Teach your agent your core rule
total-recall remember invariant "Never commit credentials or edit production schemas directly."

# 4. Verify your rule capsule
total-recall context "Add billing checkout"
```

From this moment onward, your agent respects your project standards automatically.

Stop prompt-and-pray engineering. Give your agent a brain.

👉 GitHub: https://github.com/gregiteen/total-recall  
👉 NPM: https://www.npmjs.com/package/total-recall-brain  

---

## 2. Competitive Comparison Matrix

| Capability | Stateless Agents | Hosted Vector Wrappers | Total Recall (The VibeBrain) |
|---|---|---|---|
| **Memory Persistence** | Ephemeral (Lost on session end) | Cloud-hosted database | Sovereign local filesystem |
| **Deterministic Rule Enforcement** | Inconsistent prompt suggestions | Best-effort vector search | Fail-closed context capsules (`ready: true`) |
| **Knowledge Representation** | Unstructured prompt history | Raw vector chunk embeddings | Tri-tier SSSS vault + OpenWiki graphs |
| **Offline Privacy** | Requires third-party cloud | Requires external API keys | 100% offline local retrieval |
| **Multi-Device Mesh** | None | Proprietary dashboard | Encrypted peer-to-peer mesh sync |
| **Extensibility** | Closed platform features | Generic API endpoints | Modular plugins (auth, payments, telephony) |

---

## 3. The 60-Second Onboarding Guide for Creators

### Step 1: The Project Bootstrap
Navigate to your repository and initialize your personal brain:
```bash
total-recall init --project
```
This command creates your sovereign `.agent/skills/total-recall/` vault and OpenWiki documentation hub.

### Step 2: Ingest Existing Documentation
If you have markdown documentation in your repository, index it into your knowledge graph immediately:
```bash
total-recall openwiki ingest docs
```

### Step 3: Record Your Invariants
Teach the system your non-negotiable standards:
```bash
total-recall remember invariant "Use PostgreSQL with Prisma and strict TypeScript types."
total-recall remember preference "Prefer concise functions with comprehensive inline error handling."
```

### Step 4: Work with Autonomous Confidence
Before executing complex tasks, generate your context capsule:
```bash
total-recall context "Build user onboarding flow"
```
The runtime automatically compiles all relevant invariants, preferences, and documentation links into an actionable instruction set for your agent.
