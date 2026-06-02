# Product Requirements Document: GPU Intelligence Network

**Project Codename:** Hive  
**Status:** Planning  
**Depends On:** Living Memory Capsule (workspace context layer)

---

## 1. Vision

Transform Total Recall from a local-first memory OS into a **distributed GPU intelligence network** where every connected client contributes background research cycles, aggregates live pricing data from cloud GPU providers, and enables workspace-aware model recommendations — all persisted as SSSS-native `model`, `memory`, and `workflow` primitives in the VFS.

The system operates at three levels:

1. **Live GPU Market Intelligence** — Continuous, daemon-driven research across GPU providers (DigitalOcean, Vast.ai, RunPod, Modal, Lambda Labs, Hetzner, Groq, Together.ai) producing live-updated SSSS `model` primitives with verified pricing, availability, reliability ratings, and performance benchmarks.

2. **Workspace Generator Interview** — An interactive onboarding workflow (SSSS `workflow` primitive) that interviews users about their workload characteristics and generates a custom model/GPU configuration, selecting the optimal provider × model × quantization × hardware combination.

3. **Virtual GPU Fabric** — A JIT capacity broker that abstracts multi-provider GPU procurement behind a single API, buys distributed capacity on demand, and pools inference across heterogeneous hardware using distributed inference frameworks.

---

## 2. Architecture: SSSS-Native Everything

Every artifact in this system is an SSSS primitive — no external databases, no proprietary state. The VFS is the brain.

### 2.1 New SSSS Primitive Extensions

These extend the existing SSSS Type Registry (§5) with host-specific `x_` namespaced fields:

#### Extended `model` Primitive (GPU Market Intelligence)

```yaml
---
type: model
model_id: deepseek-v4-flash
provider: total-recall
display_name: "DeepSeek V4-Flash"
# ── Standard SSSS model fields ──
is_available: true
supports_tools: true
supports_vision: false
supports_code: true
# ── x_ GPU Intelligence Extensions ──
x_architecture: MoE
x_total_params: 284B
x_active_params: 13B
x_context_window: 1000000
x_license: MIT
x_quantization_options:
  - format: INT4
    vram_gb: 80
    tokens_per_second: 45
    provider_benchmarks:
      vast_ai: { gpu: "H100_SXM", hourly: 1.50, monthly: 1095, availability: 0.92, reliability: 0.88 }
      runpod: { gpu: "H100_80GB", hourly: 1.99, monthly: 1453, availability: 0.95, reliability: 0.94 }
      digitalocean: { gpu: "HGX_H100", hourly: 3.39, monthly: 2475, availability: 0.98, reliability: 0.97 }
  - format: FP16
    vram_gb: 158
    tokens_per_second: 32
    provider_benchmarks:
      vast_ai: { gpu: "2xH100_SXM", hourly: 3.00, monthly: 2190, availability: 0.85, reliability: 0.82 }
x_benchmark_scores:
  mmlu: 0.89
  humaneval: 0.82
  swe_bench: 0.71
x_cost_efficiency:
  tokens_per_dollar_hour: 118000  # INT4 on cheapest provider
  best_value_provider: vast_ai
  best_reliability_provider: digitalocean
x_last_price_check: "2026-05-30T05:00:00Z"
x_price_trend: declining  # stable | rising | declining
x_data_sources:
  - contributor_count: 47
  - last_community_report: "2026-05-30T04:30:00Z"
---

# DeepSeek V4-Flash

284B total parameters, 13B active per token. MoE architecture with 1M context window.
Best value on Vast.ai H100 instances at ~$1,095/mo for 24/7 inference.
```

#### New `x_gpu_offer` Memory Node (Live Market Data)

```yaml
---
type: memory
slug: gpu-offer-vast-h100-sxm-2026-05-30
category: facts
title: "Vast.ai H100 SXM Current Pricing"
status: active
confidence: 0.95
importance: 3
schema_version: 2
modality: descriptive
subject: vast_ai
predicate: offers_gpu
object: h100_sxm
x_memory_layer: market-intelligence
x_gpu_provider: vast_ai
x_gpu_model: H100_SXM
x_vram_gb: 80
x_hourly_rate: 1.50
x_monthly_rate: 1095
x_availability_score: 0.92
x_reliability_score: 0.88
x_latency_cold_start_ms: 45000
x_data_source: api_scrape
x_verified_at: "2026-05-30T05:00:00Z"
x_verified_by: daemon-research
decay:
  half_life_days: 3  # GPU pricing changes rapidly
  access_count: 1
tags:
  - gpu-market
  - pricing
  - auto-researched
  - vast-ai
---

Vast.ai H100 SXM 80GB: Median hourly rate $1.50, range $1.33–$2.50.
Verified hosts show 92% uptime over 30-day rolling window.
Best for: batch inference, training, sustained workloads.
```

### 2.2 VFS Directory Layout

```
<BRAIN_DIR>/
├── memory-vault/
│   └── facts/
│       ├── gpu-offer-vast-h100-*.md          ← Live market data (auto-researched)
│       ├── gpu-offer-runpod-a100-*.md
│       ├── gpu-offer-do-rtx4000ada-*.md
│       └── gpu-benchmark-deepseek-v4-*.md    ← Performance benchmarks
├── living-capsules/
│   └── <workspace-id>/                       ← Workspace context (from Living Memory Capsule)
models/catalog/total-recall/
├── gemma4/MODEL.md                           ← Static model definitions
├── deepseek-v4-flash/MODEL.md
├── gpu-intelligence/
│   ├── SKILL.md                              ← GPU Intelligence skill manifest
│   ├── providers/
│   │   ├── vast-ai.md                        ← Provider profile + API config
│   │   ├── runpod.md
│   │   ├── digitalocean.md
│   │   ├── modal.md
│   │   ├── lambda-labs.md
│   │   ├── hetzner.md
│   │   ├── together-ai.md
│   │   └── groq.md
│   └── benchmarks/
│       ├── tokens-per-dollar.md              ← Cost-efficiency leaderboard
│       └── reliability-scores.md             ← Provider reliability rankings
```

---

## 3. Feature 1: Live GPU Market Intelligence

### 3.1 Continuous Research Daemon

The existing daemon-loop (`src/core/daemon-loop.mjs`) gains a new task category: `gpu-market-intelligence`.

```javascript
// New category in LAYER_WEIGHTS
'gpu-market-intelligence': 0.35,  // Lower than research, higher than exploration
```

**Research cycle (runs every 4 hours via scheduler):**
1. **Price scraping**: Query provider APIs for current GPU availability and pricing
   - Vast.ai: `GET /api/v0/bundles/` with GPU model filters
   - RunPod: Scrape pricing page or use serverless API
   - DigitalOcean: Scrape GPU Droplet pricing (no public API for pricing)
   - Modal, Lambda, Hetzner: Periodic web scrape + manual verification
2. **Benchmark aggregation**: Pull community benchmark data from:
   - vLLM benchmark repos
   - Open LLM Leaderboard API
   - LMSys Chatbot Arena
3. **Reliability scoring**: Track provider uptime from community reports
4. **Write SSSS nodes**: Create/update `memory` nodes with `x_gpu_provider` metadata
5. **Update MODEL.md files**: Merge latest pricing into model catalog entries

### 3.2 Distributed Research Network

> **The key insight:** Every Total Recall client running the daemon contributes research cycles. Results are aggregated via the cloud-brain research queue.

```
┌─────────────────────────────────────────────────┐
│              Total Recall Cloud Brain            │
│  ┌───────────────────────────────────────────┐   │
│  │         Research Queue (JSONL)            │   │
│  │  • gpu-pricing-vast-h100                  │   │
│  │  • gpu-pricing-runpod-a100                │   │
│  │  • gpu-benchmark-gemma4-31b-l40s          │   │
│  │  • model-update-deepseek-v4               │   │
│  └───────────────────────────────────────────┘   │
│                      ↕ REST API                  │
└──────────┬───────────┬───────────┬───────────────┘
           │           │           │
    ┌──────▼──┐  ┌─────▼───┐  ┌───▼─────┐
    │Client A │  │Client B │  │Client C │
    │(Daemon) │  │(Daemon) │  │(Daemon) │
    │scrapes  │  │scrapes  │  │scrapes  │
    │Vast.ai  │  │RunPod   │  │DO+Modal │
    └─────────┘  └─────────┘  └─────────┘
```

**Protocol:**
1. Daemon claims a `pending` research task from the queue
2. Executes the price scrape / benchmark run
3. POSTs results back as an SSSS `memory` node
4. Cloud brain merges, deduplicates, and compiles

**Benefits to all users:**
- Fresh pricing data aggregated from multiple vantage points
- Redundant verification (multiple clients checking same provider)
- Geographic diversity (clients in different regions see different availability)
- Zero central infrastructure cost for scraping

### 3.3 SKILL.md: Live GPU Intelligence

The GPU Intelligence skill (`models/catalog/total-recall/gpu-intelligence/SKILL.md`) is auto-compiled from market data:

```yaml
---
type: skill
name: gpu-intelligence
description: >-
  Live GPU market intelligence. Use when recommending hardware,
  comparing providers, or sizing infrastructure for model deployment.
  Data updated every 4 hours from distributed research network.
---

# GPU Intelligence — Live Market Data

## Last Updated: 2026-05-30T05:00:00Z
## Contributors: 47 Total Recall clients

### Best Value (Tokens per Dollar per Hour)
1. **Groq LPU** — Llama 4 Scout: 1,200,000 tok/$/hr (API, $0.05/1M in)
2. **Vast.ai RTX 4090** — Gemma 4 26B: 340,000 tok/$/hr ($0.30/hr)
3. **RunPod Community A100** — DeepSeek R1 32B: 180,000 tok/$/hr ($1.39/hr)

### Most Reliable (30-day uptime)
1. DigitalOcean — 99.7% uptime
2. RunPod Secure Cloud — 99.4% uptime
3. Lambda Labs — 98.9% uptime

### Price Alerts
⚠️ Vast.ai H100 prices dropped 12% this week (avg $1.50 → $1.32/hr)
⚠️ RunPod launched B200 instances at $2.79/hr
```

---

## 4. Feature 2: Workspace Generator Interview

An interactive onboarding workflow that recommends the optimal model + hardware configuration.

### 4.1 SSSS Workflow Definition

```yaml
---
type: workflow
name: workspace-generator
description: >-
  Interactive interview that profiles a user's workload and generates
  a custom GPU/model configuration recommendation.
triggers:
  - type: command
    command: /setup-workspace
  - type: api
    endpoint: POST /api/workspace/generate
isActive: true
---

## Steps

### Step 1: Workload Profiling
Interview the user about:
- Primary use case (chat, coding, RAG, agents, fine-tuning)
- Expected daily token volume (<100K, 100K–1M, 1M–10M, 10M+)
- Latency requirements (real-time <100ms TTFT, interactive <1s, batch OK)
- Privacy requirements (cloud OK, on-prem required, hybrid)
- Budget range (free tier, $50/mo, $200/mo, $500/mo, $2000+/mo)
- Context window needs (<32K, 32K–128K, 128K–1M, 1M+)
- Multimodal needs (text only, text+image, text+image+audio)

### Step 2: Model Matching
Query GPU Intelligence SKILL.md and model catalog to find:
- Best model for use case × budget intersection
- Required quantization level
- Minimum hardware tier

### Step 3: Provider Selection
Cross-reference with live market data to recommend:
- Best value provider for the selected hardware
- Reliability-weighted recommendation
- Geographic preference (if specified)

### Step 4: Configuration Generation
Output a complete deployment spec:
- MODEL.md entry for the workspace
- vLLM / Ollama launch command
- Expected performance (tok/s, TTFT, concurrent users)
- Monthly cost estimate with confidence interval
```

### 4.2 Workspace Templates

Pre-built configurations for common patterns:

| Template | Model | Hardware | Provider | Monthly Cost |
|:---|:---|:---|:---|:---|
| **Solo Dev (Free)** | Gemma 4 E4B | Local CPU/GPU | Self-hosted | $0 |
| **Solo Dev (Fast)** | Gemma 4 26B-A4B | 1× RTX 4090 | Vast.ai | ~$250/mo |
| **Startup Team** | DeepSeek R1 32B | 1× RTX 4000 Ada | DigitalOcean | ~$583/mo |
| **Agency (Multi-Model)** | Gemma 4 31B + DeepSeek V4-Flash | 1× L40S + 1× H100 | RunPod | ~$2,468/mo |
| **Enterprise (Private)** | Llama 4 Scout | 8× H100 | DigitalOcean | ~$18,341/mo |
| **Budget API** | Any | Managed | Groq/Together.ai | ~$5–50/mo |

### 4.3 Interview API

```
POST /api/workspace/interview
Body: { answers: [...] }
Response: {
  recommendation: {
    model: "deepseek-r1-32b",
    quantization: "INT4",
    hardware: "1x RTX 4000 Ada",
    provider: "digitalocean",
    monthly_cost: 583,
    monthly_credits: 5830000,
    vllm_command: "vllm serve deepseek-ai/DeepSeek-R1-Distill-Qwen-32B --quantization awq --enable-prefix-caching",
    expected_performance: {
      tokens_per_second: 42,
      ttft_ms: 180,
      concurrent_users: 5
    },
    confidence: 0.88,
    alternatives: [...]
  }
}
```

---

## 5. Feature 3: Virtual GPU Fabric

### 5.1 JIT GPU Capacity Broker

Instead of customers managing cloud provider accounts directly, Total Recall acts as a **GPU broker** — abstracting multi-provider procurement behind a single API.

```
User Request → TR Broker API → [Query Live Market Data]
                                    ↓
                              [Select Best Provider]
                                    ↓
                    ┌───────────────┼───────────────┐
                    ↓               ↓               ↓
              [Vast.ai API]   [RunPod API]    [DO API]
                    ↓               ↓               ↓
              [Provision]     [Provision]     [Provision]
                    ↓               ↓               ↓
              [Deploy vLLM]  [Deploy vLLM]  [Deploy vLLM]
                    ↓               ↓               ↓
              ← OpenAI-compat endpoint returned to user →
```

**Key capabilities:**
- **Auto-provider selection**: Chooses cheapest available GPU matching requirements
- **Failover**: If primary provider is unavailable, auto-falls to next cheapest
- **Spot/preemptible**: Uses spot instances for batch workloads, reserved for production
- **Scale-to-zero**: Serverless tiers (Modal, RunPod Serverless) for bursty workloads
- **Geographic routing**: Select closest region for latency-sensitive apps

### 5.2 Distributed Inference Pooling

For Enterprise customers, pool inference across multiple smaller GPUs using distributed frameworks:

```
Model: DeepSeek V4-Flash (284B total, 13B active)
Traditional: 1× H100 ($2,475/mo)
Distributed: 3× RTX 4090 via Exo ($750/mo) ← 70% savings
```

**Integration with Exo/Petals:**
- Total Recall provisions multiple consumer GPUs across providers
- Deploys Exo coordinator to manage tensor-parallel inference
- Exposes single OpenAI-compatible endpoint to UltraChat
- Monitors health and auto-replaces failed nodes

### 5.3 Billing Integration

All GPU fabric operations are billed through the existing UltraChat credit system:

```
GPU Cost (from provider) + 5% markup → Credits deducted from user balance
```

Credits are metered per-second for dedicated instances, per-token for serverless/API tiers.

---

## 6. Implementation Phases

### Phase 1: GPU Market Intelligence (Weeks 1–3)
- [ ] Create `gpu-intelligence` skill directory structure
- [ ] Implement provider API scrapers (Vast.ai, RunPod, DigitalOcean)
- [ ] Add `gpu-market-intelligence` daemon task category
- [ ] Create SSSS `memory` nodes for GPU offers with `x_gpu_*` fields
- [ ] Auto-compile SKILL.md leaderboard from market data
- [ ] Add `GET /api/marketplace/intelligence` endpoint

### Phase 2: Distributed Research Protocol (Weeks 3–5)
- [ ] Design multi-client research claim/submit protocol
- [ ] Add provider scrape tasks to research queue
- [ ] Implement result merging and deduplication
- [ ] Add contributor tracking and geographic diversity metrics
- [ ] Test with 3+ concurrent daemon instances

### Phase 3: Workspace Generator Interview (Weeks 5–7)
- [ ] Create `workspace-generator` SSSS workflow
- [ ] Implement interview question engine
- [ ] Build model × hardware × budget matching algorithm
- [ ] Create workspace template library
- [ ] Add `POST /api/workspace/interview` endpoint
- [ ] Add `POST /api/workspace/generate` endpoint

### Phase 4: Virtual GPU Fabric (Weeks 7–12)
- [ ] Implement Vast.ai provisioning adapter
- [ ] Implement RunPod provisioning adapter
- [ ] Implement DigitalOcean provisioning adapter
- [ ] Build JIT capacity broker with failover
- [ ] Integrate Exo for distributed inference pooling
- [ ] Add per-second credit metering
- [ ] Add health monitoring and auto-replacement

---

## 7. Research Queue: Continuous Intelligence Topics

The following research projects should be permanently active in the daemon queue, cycling indefinitely:

| Topic | Priority | Cycle | Notes |
|:---|:---|:---|:---|
| GPU pricing — Vast.ai | high | 4 hours | API scrape: `/api/v0/bundles/` |
| GPU pricing — RunPod | high | 4 hours | Web scrape: pricing page |
| GPU pricing — DigitalOcean | medium | 12 hours | Web scrape: GPU droplets page |
| GPU pricing — Modal/Lambda/Hetzner | medium | 24 hours | Web scrape |
| Model benchmarks — Open LLM Leaderboard | medium | 24 hours | API: HuggingFace |
| Model releases — HuggingFace trending | high | 6 hours | New model detection |
| Provider reliability — community reports | low | 48 hours | Reddit/HN/Discord scrape |
| vLLM/Ollama releases | medium | 12 hours | GitHub releases API |
| Inference cost efficiency | medium | 24 hours | Computed from price + benchmark data |
