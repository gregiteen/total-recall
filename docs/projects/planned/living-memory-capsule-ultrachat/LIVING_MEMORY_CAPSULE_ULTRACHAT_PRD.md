# Product Requirements Document (PRD): Living Memory Capsule & Branded LLM Pricing

This document outlines the product requirements and technical design for the folder-based **Living Memory Capsule** system to support workspace-scoped contexts in UltraChat, along with the state-of-the-art 2026 open-source LLM hosting packages for the marketplace.

---

## 1. Product Goals & Overview

### A. The Living Memory Capsule
To deliver highly personalized, up-to-the-minute contexts for UltraChat workspaces while completely avoiding SSSS global VFS compilation latency on every memory write, we introduce the **Living Memory Capsule**:
- **Folder-Scoped**: A directory of small, standalone markdown files containing observations, preferences, and facts, stored at `<BRAIN_DIR>/living-capsules/<workspace-id>/` — isolated from the SSSS `memory-vault/` to prevent vault index contamination.
- **Cache-Stable**: Dynamically loads and concatenates files in a strictly deterministic order (alphabetical by filename) to produce an identical string prefix, maximizing the efficiency of LLM **Prompt Caching** (vLLM Automatic Prefix Caching, SGLang RadixAttention, Gemini prefix caching).
- **Auto-Pruned**: A background garbage collector (registered as a `memory-maintenance` daemon task) handles redundancies and contradictions asynchronously — fully deterministic, no LLM required.
- **Size-Bounded**: Enforces per-file (4KB), per-directory (200 files / 500KB), and per-workspace limits to protect token budgets.

### B. Branded LLM Marketplace Packages (2026 Fleet)
We provision and host dedicated, secure open-source models on our DigitalOcean GPU/CPU infrastructure. Customers are billed a price in credits from their balance equal to actual compute cost plus a 5% markup, converted at a rate of **100 credits = $0.01** ($1.00 = 10,000 credits).

---

## 2. Core Functional Requirements

### Requirement 1: Workspace-Scoped Folder Capsules
- Every active workspace in UltraChat maps to a directory: `<BRAIN_DIR>/living-capsules/<workspace-id>/`.
- This directory is **outside** `memory-vault/` to prevent interference with SSSS surface compilation, embeddings indexing, and graph generation.
- Standard observations are saved instantly as tiny independent files: `<category>-<slug>.md` (e.g. `preferences-coffee.md`).
- File write operations must execute in **under 2 milliseconds** without triggering global SSSS surface compiles.

### Requirement 2: Deterministic Caching Prefix
- The API endpoint `GET /api/comms/capsule` must batch-read all active files in the workspace directory.
- The filenames MUST be sorted alphabetically before concatenation to guarantee character-for-character prompt caching stability across turn-by-turn chat requests.
- vLLM's Automatic Prefix Caching (APC) will automatically hash and cache shared prefixes — no special application-side configuration needed beyond `--enable-prefix-caching` on the inference server.

### Requirement 3: Automated Garbage Collection
- A background worker runs as a `memory-maintenance` daemon task (deterministic, no LLM required).
- Scans `living-capsules/**/*.md`.
- Parses YAML frontmatter attributes (e.g. `superseded_by`, `created_at`, `decay.half_life_days`).
- Auto-deletes contradicting records and trims context size to protect token budgets.
- Enforces per-directory file count (200) and byte size (500KB) limits.

### Requirement 4: Security & Multi-Tenancy
- All capsule endpoints must use `requireAuth` middleware (Bearer token validation via `keys.jsonl`).
- Capsule access is scoped to the authenticated workspace — no cross-tenant reads.
- Write endpoint is rate-limited (100 writes/minute per API key).

### Requirement 5: Branded Marketplace Bundles (2026 Fleet)
The hosting fleet offers the latest state-of-the-art 2026 open-source models across four tiers:

- **Pay-As-You-Go API Tier**: Per-token billing via managed inference providers (Groq, Together.ai) for light-usage customers.
- **Developer CPU Pack**: Running highly optimized quantized **Gemma 4 E4B (4B Dense)** or **Gemma 4 26B-A4B (MoE, ~4B active)** on CPU.
- **Pro GPU Pack (RTX 4000 Ada)**: Running INT4-quantized **Gemma 4 31B Dense**, **DeepSeek R1 Distilled 32B**, or **Qwen 3.6-35B-A3B** on dedicated NVIDIA RTX 4000 Ada (20GB VRAM).
- **Pro GPU Pack (L40S)**: Running full-precision **Gemma 4 31B Dense**, **DeepSeek R1 Distilled 32B**, or larger quantized models on NVIDIA L40S (48GB VRAM).
- **Enterprise GPU Pack**: Running flagship **DeepSeek V4-Flash (284B total / 13B active)**, **Llama 4 Scout (109B total / 17B active, MoE)**, or **GLM-5.1 (MoE)** on dedicated NVIDIA H100 (80GB VRAM) or AMD Instinct MI300X (192GB VRAM).

---

## 3. Product Specifications & Marketplace Billing Tiers

### Verified Model Specifications (May 2026)

| Model | Architecture | Total Params | Active Params | Context | Quantized VRAM (INT4) | Full VRAM (FP16) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Gemma 4 E4B** | Dense | 4B | 4B | 128K | ~6 GB | ~8 GB |
| **Gemma 4 26B-A4B** | MoE (128 experts) | 26B | ~4B | 256K | ~16 GB | ~52 GB |
| **Gemma 4 31B Dense** | Dense | 31B | 31B | 256K | ~17 GB | ~62 GB |
| **DeepSeek R1 (Distilled 32B)** | Dense (Qwen2.5-based) | 32B | 32B | — | ~16 GB | ~64 GB |
| **Qwen 3.6-35B-A3B** | MoE | 35B | 3B | 262K–1M | ~18 GB | ~70 GB |
| **DeepSeek V4-Flash** | MoE | 284B | ~13B | 1M | ~80 GB | ~158 GB |
| **Llama 4 Scout** | MoE (16 experts) | 109B | 17B | 10M (theoretical) / 192K–512K (practical) | ~55 GB | ~218 GB |
| **GLM-5.1** | MoE (256 experts) | 745B | ~44B | 200K | Multi-GPU | Multi-GPU |

### Marketplace Billing Tiers

All prices reflect verified DigitalOcean on-demand rates (May 2026) plus 5% markup.

| Package | Hardware | DO Actual Cost | Monthly Price (Cost + 5%) | Credits/mo | Daily Credit Rate |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Pay-As-You-Go API** | Managed (Groq/Together.ai) | Per-token | **Per-token + 10% markup** | Usage-based | Usage-based |
| **Developer CPU Pack** | 8 vCPUs, 32GB RAM, 100GB NVMe | ~$160 | **$168.00** | 1,680,000 | 56,000 |
| **Pro GPU (RTX 4000 Ada)** | 1× RTX 4000 Ada (20GB), 32GB RAM, 8 vCPUs | $554.80 | **$583.00** | 5,830,000 | 194,333 |
| **Pro GPU (L40S)** | 1× L40S (48GB), 64GB RAM, 8 vCPUs | $1,146.10 | **$1,204.00** | 12,040,000 | 401,333 |
| **Enterprise (H100)** | 1× H100 (80GB), 240GB RAM, 20 vCPUs | $2,474.70 | **$2,599.00** | 25,990,000 | 866,333 |
| **Enterprise (MI300X)** | 1× MI300X (192GB), 240GB RAM, 20 vCPUs | $1,452.70 | **$1,526.00** | 15,260,000 | 508,667 |
| **Enterprise Multi-GPU** | 8× H100 (640GB total) | $17,467.60 | **$18,341.00** | 183,410,000 | 6,113,667 |

### Model ↔ Tier Compatibility Matrix

| Model | CPU Pack | Pro (RTX 4000 Ada) | Pro (L40S) | Enterprise (H100) | Enterprise (MI300X) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Gemma 4 E4B | ✅ (INT4) | ✅ | ✅ | ✅ | ✅ |
| Gemma 4 26B-A4B | ⚠️ Slow (~2-5 tok/s) | ✅ (INT4) | ✅ | ✅ | ✅ |
| Gemma 4 31B Dense | ❌ | ✅ (INT4 only) | ✅ | ✅ | ✅ |
| DeepSeek R1 32B | ❌ | ✅ (INT4 only) | ✅ | ✅ | ✅ |
| Qwen 3.6-35B-A3B | ❌ | ✅ (INT4 only) | ✅ | ✅ | ✅ |
| DeepSeek V4-Flash | ❌ | ❌ | ❌ | ✅ (INT4) | ✅ |
| Llama 4 Scout | ❌ | ❌ | ❌ | ✅ (INT4, short ctx) | ✅ |
| GLM-5.1 | ❌ | ❌ | ❌ | Multi-GPU only | Multi-GPU only |

### Inference Engine Requirements

All GPU tiers deploy models via **vLLM** (production) or **Ollama** (developer/local):
- vLLM flags: `--enable-prefix-caching --gpu-memory-utilization 0.9 --max-model-len <context>`
- FP8 KV Cache Quantization enabled for all GPU tiers to maximize concurrent sessions
- Prometheus metrics exposed at `/metrics` for cache hit rate monitoring
