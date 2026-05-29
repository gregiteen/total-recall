# Product Requirements Document (PRD): Living Memory Capsule & Branded LLM Pricing

This document outlines the product requirements and technical design for the folder-based **Living Memory Capsule** system to support workspace-scoped contexts in UltraChat, along with the state-of-the-art 2026 open-source LLM hosting packages for the marketplace.

---

## 1. Product Goals & Overview

### A. The Living Memory Capsule
To deliver highly personalized, up-to-the-minute contexts for UltraChat workspaces while completely avoiding SSSS global VFS compilation latency on every memory write, we introduce the **Living Memory Capsule**:
- **Folder-Scoped**: A directory of small, standalone markdown files containing observations, preferences, and facts.
- **Cache-Stable**: Dynamically loads and concatenates files in a strictly deterministic order (alphabetical by filename) to produce an identical string prefix, maximizing the efficiency of LLM **Prompt Caching** (e.g. Gemini 1.5/Gemma 4 prefix caching).
- **Auto-Pruned**: A background garbage collector handles redundancies and contradictions asynchronously.

### B. Branded LLM Marketplace Packages (2026 Fleet)
We provision and host dedicated, secure open-source models on our DigitalOcean GPU/CPU infrastructure. Customers are billed a price in credits from their balance equal to actual compute cost plus a 5% markup, converted at a rate of **100 credits = $0.01** ($1.00 = 10,000 credits).

---

## 2. Core Functional Requirements

### Requirement 1: Workspace-Scoped Folder Capsules
- Every active workspace in UltraChat maps to a directory: `memory-vault/living-capsules/<workspace-id>/`.
- Standard observations are saved instantly as tiny independent files: `<category>-<slug>.md` (e.g. `preferences-coffee.md`).
- File write operations must execute in **under 2 milliseconds** without triggering global SSSS surface compiles.

### Requirement 2: Deterministic Caching Prefix
- The API endpoint `GET /api/comms/capsule` must batch-read all active files in the workspace directory.
- The filenames MUST be sorted alphabetically before concatenation to guarantee character-for-character prompt caching stability across turn-by-turn chat requests.

### Requirement 3: Automated Garbage Collection
- A background worker scans the folders to remove obsolete or superseded files based on frontmatter metadata, preventing duplicate or contradicting facts from polluting the prompt prefix.

### Requirement 4: Branded Marketplace Bundles (2026 Fleet)
The hosting fleet must offer the latest state-of-the-art 2026 open-source models:
- **Developer CPU Pack**: Running highly optimized quantized **Gemma 4 (26B-A4B)** or **Llama 4 Scout (8B)** on CPU.
- **Pro GPU Pack**: Running unquantized **Gemma 4 (31B Dense)**, **DeepSeek R1 (Distilled 32B)**, or **Qwen 3.6** on dedicated NVIDIA RTX 4000 Ada / L40S GPUs.
- **Enterprise GPU Pack**: Running flagship **DeepSeek V4**, **Llama 4 Scout (70B, 10M context)**, or **GLM-5.1 (MoE)** on dedicated multi-GPU NVIDIA H100 / AMD Instinct MI300X rigs.

---

## 3. Product Specifications & Marketplace Billing Tiers

| Package | Hardware Specifications | Featured 2026 Models | Monthly Branded Price (Cost + 5%) | Daily Credit Rate |
| :--- | :--- | :--- | :--- | :--- |
| **Developer CPU Pack** | 8 vCPUs, 32GB RAM, 100GB NVMe SSD | Gemma 4 (26B-A4B), Llama 4 Scout (8B) | **$168.00** <br>(1,680,000 credits/mo) | **56,000 credits / day** |
| **Pro GPU Pack** | 1x NVIDIA RTX 4000 Ada (20GB) / L40S, 30GB RAM | Gemma 4 (31B Dense), DeepSeek R1 (32B), Qwen 3.6 | **$630.00** <br>(6,300,000 credits/mo) | **210,000 credits / day** |
| **Enterprise GPU Pack**| Multi-GPU NVIDIA H100 / AMD MI300X, 120GB RAM | DeepSeek V4, Llama 4 Scout (70B), GLM-5.1 | **$2,100.00** <br>(21,000,000 credits/mo) | **700,000 credits / day** |
