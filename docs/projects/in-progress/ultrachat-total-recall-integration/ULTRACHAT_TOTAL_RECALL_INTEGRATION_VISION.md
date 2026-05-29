# SSSS-Native Project Vision: UltraChat & Total Recall 3.0 Integration

## The Core Philosophy
The ultimate objective is to build a completely **sovereign, local-first, database-free operating system** for multi-agent orchestration, communication history, and custom cloud model deployments. 

By unifying **Total Recall's** structured memory kernel and hardened JIT sandbox with **UltraChat's** omnichannel messaging and voice capabilities, we completely replace heavy relational databases with a single, elegant Virtual File System (VFS) written entirely in git-versioned SSSS v2 Markdown.

---

## 🎯 1. The Four Integration Pillars

### Pillar A: Database-Free SSSS VFS Storage
Every high-level UltraChat asset (Assistants, Workflows, Crons, Contacts, Phone Call Logs, LLM Profiles, and Media parameters) exists natively as an SSSS v2 Markdown file. 
* **Git Sovereignty**: Eliminates SQLite, Supabase, or PostgreSQL dependencies, enabling lightweight, file-based GPG-encrypted tarball replication and direct git pushes.
* **Semantic Discovery**: A single vector indexer (`embeddings.jsonl`) indexes all assets collectively, enabling multi-category natural language queries.

### Pillar B: Rest-Isolated JIT Sandbox Execution
All UltraChat cron schedulers and visual workflows are orchestrated through Total Recall's `/code-mode` POSIX sandbox.
* **Isolation Gates**: Workflow scripts execute inside isolated, offline Node threads (`experimental-vm-modules`) restricted by POSIX namespace controls.
* **Portable secrets.enc**: Master cloud credentials and endpoint tokens are AES-256-GCM encrypted via cost-12 scrypt and stored in `secrets.enc`. Plaintext keys are decrypted dynamically in-memory and injected via `{{secrets.*}}` syntax on execution, never touching the disk or environment.

### Pillar C: Low-Latency Contact & Comms Memory Recall
Voice calls, messaging, and chat logs are connected directly to the SSSS vector search index.
* **Relationship Continuity**: Inbound/outbound calls trigger a warm GET `/api/comms/context` route that retrieves the contact's profile, relationship invariants, and key takeaways from the last 3 call transcripts.
* **Fluid Context Injections**: The compiled relationship history is injected directly into the voice assistant's prompt context on load, allowing for seamless personal context recall during live speech.

### Pillar D: UltraChat Custom Models
A fully automated deployment channel for hosting private open-source model endpoints on UltraChat's dedicated backend cloud registry.
* **Branded Cloud Infrastructure**: Custom models are deployed directly on UltraChat's backend (no user-provided credentials or BYO accounts required).
* **Credit-Based Billing (Cost + 5%)**: The deployment dynamically deducts the actual model hosting cost plus a 5% markup directly from the user's UltraChat credit balance, converted at a standard rate of 100 credits = $0.01 ($1.00 = 10,000 credits).
* **Automated SSL & vLLM Tunnels**: SSSS deployment tasks automatically boot CPU/GPU model nodes, configure Docker/vLLM for model execution, secure subdomains via Caddy TLS tunnels, and automatically write SSSS preference nodes back to the local VFS for instant generative routing.

---

## 🗺️ 2. Project lifecycle Stages

We will follow the SWE Project Lifecycle strictly:
1. **Discovery & Requirements (VISION & PRD)**: Align on the core requirements, schemas, and API signatures for the unified database-free platform.
2. **Architecture & Design (ARCHITECTURE)**: Define the REST endpoints, Zod schema structures, and POSIX sandbox invocation wrappers.
3. **Planning & Tracking (DEV_PLAN & PROJECT_TRACKER)**: Break the project down into a clear, step-by-step checklist tracker.
4. **Execution & Verification**: Implement the integrations, verify them with a comprehensive Vitest unit test suite, and archive the project.
