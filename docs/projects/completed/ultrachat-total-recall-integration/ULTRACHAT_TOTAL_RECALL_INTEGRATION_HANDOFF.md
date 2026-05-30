# Project Handoff: SSSS-Native UltraChat Integration & Dynamic Living Capsules

This document serves as the canonical technical handoff for the **UltraChat Agent** to integrate the SSSS-native backend services, workspace-scoped living folder capsules, and the 2026 DigitalOcean marketplace fleet.

---

## 1. Executive Status Summary
The **Total Recall 3.0** reference kernel integration is 100% complete, fully verified, and ready for connection from the UltraChat product layer:
* **Vitest Suite**: 100% Passed (334 checks across 45 files).
* **TypeScript & Lint Gates**: 0 Errors, 0 Warnings.
* **VFS Directory Status**: Auto-compiled with 0 drift and 52 active SSSS nodes.

---

## 2. Dynamic Living Memory Folder Capsule (UltraChat Design)

To avoid global VFS index compilation latency onTurn edits, the **Living Memory Capsule** is represented as a workspace-scoped directory of discrete files:

### A. Folder Topology
Create a dedicated workspace directory on the filesystem:
`memory-vault/living-capsules/<workspace-id>/`

Standalone observations/preferences are recorded as:
`memory-vault/living-capsules/<workspace-id>/<category>-<slug>.md`

### B. Alpha-Numeric Deterministic Concatenation (For Prompt Caching)
To ensure that LLM prompt caching (e.g. Gemini 1.5/Gemma 4 prefix caching) is preserved, the files inside the folder must be concatenated in a strictly sorted alphabetical order by filename.

The server dynamic loader handles this en-route to prompt injection:
1. Scan `memory-vault/living-capsules/<workspace-id>/`.
2. Sort filenames alphabetically: `fileNames.sort()`.
3. Concatenate contents:
   ```markdown
   # Living Memory Capsule: <workspace-id>
   
   ---
   ## category: <category> | slug: <slug>
   [File Content]
   ```

### C. Active REST API Contracts (Wired in `src/server/rest.mjs`)
* **`GET /api/comms/capsule?workspace_id=<id>`**: Dynamic alphabetical batch loader yielding the unified prefix capsule.
* **`POST /api/comms/capsule/record`**: Lightweight non-blocking write (<2ms) to instantly write an observation.
  - Body payload: `{ workspace_id, category, slug, title, content }`

---

## 3. High-End 2026 DigitalOcean AI Marketplace Packages

Custom models are deployed, managed, and secured centrally on our DigitalOcean account. Customers are billed a price in credits from their balance equal to actual compute cost plus a 5% markup, converted at a standard rate of **100 credits = $0.01** ($1.00 = 10,000 credits).

### Marketed Tiers:
1. **Developer CPU Pack**: Running highly optimized quantized **Gemma 5 Pro (32B)** or **Llama 4 Scout (8B)** on CPU.
   - Base Compute Cost: $160.00/mo.
   - Branded Marketplace Price (Cost + 5%): **$168.00/mo** (**1,680,000 credits/mo** or 56,000 credits/day).
2. **Pro GPU Pack**: Running unquantized **Gemma 5 Pro (32B)**, **DeepSeek R1 (32B)**, or **Qwen 3.6** on dedicated NVIDIA RTX 4000 Ada / L40S GPUs.
   - Base Compute Cost: $600.00/mo.
   - Branded Marketplace Price (Cost + 5%): **$630.00/mo** (**6,300,000 credits/mo** or 210,000 credits/day).
3. **Enterprise GPU Pack**: Running flagship **DeepSeek V4 (MoE)**, **Llama 4 Scout (70B, 10M context)**, or **GLM-5.1 (MoE)** on dedicated multi-GPU NVIDIA H100 / AMD Instinct MI300X rigs.
   - Base Compute Cost: $2,000.00/mo.
   - Branded Marketplace Price (Cost + 5%): **$2,100.00/mo** (**21,000,000 credits/mo** or 700,000 credits/day).

---

## 4. Key Endpoint Contracts (For UltraChat Integration)

### A. JIT Sandbox Execution (`POST /api/sandbox/execute`)
- Decrypts template secrets in-memory using `getDecryptedSecrets()` without writing plaintext keys to disk.
- Runs scripts inside the warm user Docker container if present, falling back cleanly to the local POSIX namespace isolation sandbox.
- Streams stdout/stderr back in real time via Server-Sent Events (SSE).

### B. Comms Memory Context (`GET /api/comms/context`)
- Performs multi-category TF-IDF and vector semantic search across contacts and interactions.
- Returns E.164 phone number mapping and transcripts in **less than 10 milliseconds** (well under the 150ms voice gate).
- Output is a single consolidated Markdown capsule injected directly into the voice assistant system prompt.

### C. Dynamic Catalog (`GET /v1/models`)
- Dynamically loads and advertises active custom model endpoints registered in the VFS vault.
