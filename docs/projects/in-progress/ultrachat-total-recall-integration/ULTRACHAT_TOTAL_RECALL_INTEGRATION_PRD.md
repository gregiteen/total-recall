# Product Requirements Document (PRD): SSSS-Native UltraChat Integration

## 1. Product Requirements & Objectives
This project delivers the ultimate database-free, sovereign operating system coupling between **UltraChat** and **Total Recall 3.0** utilizing Total Recall's reference memory kernel, SSSS v2 markdown schemas, and dual-layer JIT sandbox execution.

### User Persona & Pain Points:
* **The Sovereign Developer**: Wants complete local control of their personal/business intelligence, messaging history, crons, and custom model endpoints with zero database configuration, zero cloud-vendor locks, and lightweight encrypted backups.
* **The Privacy Practitioner**: Demands all relationships, transcripts, and credentials remain private, offline, and GPG-encrypted.

---

## 2. Functional Requirements & Specifications

### Pillar A: SSSS VFS Asset Mapping & Schemas
We must support native SSSS v2 Zod schema validation and indexing for all UltraChat assets, directly mirroring columns in the transactional Supabase `ai_assistants` database:

#### 1. Assistants Schema (Mapping to `ai_assistants` transactional table)
* **Operational Fields**:
  * `x_generative_model_target`: The primary LLM model string (dynamic openrouter alias or custom endpoint).
  * `system_prompt`: Unified personality system instruction.
  * `voice_id` & `custom_voice_settings`: ElevenLabs speech synthesis markers.
  * `email` & `email_behavior`: Operational inbox routing flags.
  * `chat_memory_enabled` & `standard_knowledge_base_id`: Cognitive retrieval controls.
  * `browser_automation_instructions`: Custom Playwright rules for Code Mode.
  * `favorite_skills`: Hardcoded tool authorization whitelist.

#### 2. Workflows & Crons Schema
* **Requirements**: Defines visual node sequences, variables, execution limits, and cron timers.
* **Specialized Fields**: `cron_expression`, `x_sandbox_limits: { ram_mb, timeout_sec }`, `script_body`.

#### 3. CRM Contacts & Interactions Schema
* **Requirements**: Stores contact identities, relationship summaries, and voice call/message transcripts.
* **Specialized Fields**: `phone` (standard E.164), `tags`, `x_transcript_hash`, `x_call_duration_sec`, `related: []`.

---

### Pillar B: Dual-Tier JIT Sandbox Execution (`POST /api/sandbox/execute`)
UltraChat calls this secure endpoint to run visual node-based workflows or scheduled cron scripts.

#### Input Request Payload:
```json
{
  "task_slug": "backup-vault-nightly",
  "script_body": "const fs = require('fs'); ...",
  "limits": {
    "ram_mb": 512,
    "timeout_sec": 60
  }
}
```

#### Dual-Tier Execution Rules:
1. **Primary Docker Sandbox**: If Docker is present and running on the host system, execution routes into the user's warm active container (`container-${userId}-code` managed via [/Users/greg/Github/ultrachat-ai-powered/server/services/cliSandboxService.ts](file:///Users/greg/Github/ultrachat-ai-powered/server/services/cliSandboxService.ts)).
2. **Fallback OS Sandbox**: If Docker is unavailable or inactive, the scheduler falls back to the local POSIX namespace isolation sandbox ([/Users/greg/Github/total-recall/src/core/sandbox.mjs](file:///Users/greg/Github/total-recall/src/core/sandbox.mjs)), running inside `sandbox-exec` (macOS) or `unshare` (Linux).
3. **Secrets Decryption & Token Injection**: Scan `script_body` for `{{secrets.*}}` syntax. Fetch scrypt-encrypted keys from [/Users/greg/Github/total-recall/.agent/skills/total-recall/config/secrets.enc](file:///Users/greg/Github/total-recall/.agent/skills/total-recall/config/secrets.enc), decrypt in-memory, and inject dynamically. Plaintext keys must never touch the disk.
4. **SSE Log Streaming**: Stream live stdout/stderr log events back to the UltraChat console using Server-Sent Events (SSE).

---

### Pillar C: Low-Latency Comms Pre-Context Injection (`GET /api/comms/context`)
When a voice call is bridged via Asterisk ARI or a message is received, the voice gateway calls this endpoint to retrieve the contact's contextual memory:

#### API Request Parameter:
* `phone` (E.164 standard) or `contact_slug`

#### Latency & Retrieval Mechanics:
1. **Under 150ms Performance Gate**: Inbound gateways require context retrieval in less than 150ms to prevent barge-in voice lags.
2. Perform rapid TF-IDF keyword match and vector semantic similarity check across `contacts` and `interactions` SSSS categories.
3. Load the contact's profile, relationship details, and key takeaways from the last 3 call/message transcripts.
4. Output a single, beautifully structured Markdown context capsule to be injected directly into the voice/text assistant prompt context on initialization.

---

### Pillar D: UltraChat Custom Models on Backend Cloud
Total Recall deploys, configures, and secures open-source model servers on UltraChat's dedicated central cloud backend on behalf of users.

#### Provisioning & Credit Deduction Workflow:
1. **Central Backend Deployment**: Models are spawned directly on UltraChat's master cloud account using secure, backend-held cloud tokens. User credentials are not required.
2. **Dynamic Cloud Cost + 5% Markup Billing**: The system dynamically calculates custom model hourly cloud costs and deducts a corresponding amount in credits from the user's active account balance. The charge is calculated as: `Actual Cloud Cost + 5% markup`.
3. **Credit Conversion Standard**: Billing is computed using UltraChat's standard credit exchange rate:
   * **100 credits = $0.01** ($1.00 = 10,000 credits).
4. **Docker/vLLM Setup**: Deploys vLLM/Ollama Docker images on the new custom model host and downloads the user's selected open-source model.
5. **Caddy Secure SSL Tunneling**: Configures Caddy on the host to automatically obtain Let's Encrypt SSL/TLS certificates for a designated custom subdomain.
6. **VFS Endpoint Auto-Registration**: Upon successful health verification, dynamically writes the `config-do-<model-slug>.md` node back into the workspace VFS preferences folder for instant model routing.

---

### Pillar E: Workspace-Scoped Living Memory Folder Capsule
To deliver highly personalized, up-to-the-minute contexts for UltraChat workspaces while completely avoiding SSSS global VFS compilation latency on memory updates, we introduce the **Living Memory Capsule**:
1. **Directory-Based Topology**: Small, standalone memory nodes are saved instantly as tiny independent files inside `memory-vault/living-capsules/<workspace-id>/<category>-<slug>.md` without triggering global SSSS compilations (write speed <2ms).
2. **Deterministic Caching Loader**: Concatenates folder contents in a strictly sorted alphabetical order by filename to guarantee a 100% character-for-character identical prefix, maximizing LLM Prompt Caching performance.
3. **Automated Pruning**: A background garbage collector handles redundancies and contradictions asynchronously.

---

### Pillar F: Marketplace Custom Model Packages (2026 Fleet)
We package and market three tiers of state-of-the-art 2026 open-source model servers for the UltraChat Marketplace:

* **Developer CPU Pack**: Running highly optimized quantized **Gemma 5 Pro (32B)** or **Llama 4 Scout (8B)** on CPU.
  - Base Cost: $160.00/mo. Branded Price (Cost + 5%): **$168.00/mo** (**1,680,000 credits/mo** or 56,000 credits/day).
* **Pro GPU Pack**: Running unquantized **Gemma 5 Pro (32B)**, **DeepSeek R1 (32B)**, or **Qwen 3.6** on dedicated NVIDIA RTX 4000 Ada / L40S.
  - Base Cost: $600.00/mo. Branded Price (Cost + 5%): **$630.00/mo** (**6,300,000 credits/mo** or 210,000 credits/day).
* **Enterprise GPU Pack**: Running flagship **DeepSeek V4**, **Llama 4 Scout (70B, 10M context)**, or **GLM-5.1 (MoE)** on dedicated multi-GPU NVIDIA H100 / AMD Instinct MI300X rigs.
  - Base Cost: $2,000.00/mo. Branded Price (Cost + 5%): **$2,100.00/mo** (**21,000,000 credits/mo** or 700,000 credits/day).
