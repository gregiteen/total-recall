# Project Tracker: SSSS-Native UltraChat Integration

- `[ ]` uncompleted tasks
- `[/]` in progress tasks
- `[x]` completed tasks

## ✅ Phase 1: SSSS Schema Upgrades
- [x] Implement `AssistantSubSchema` and `WorkflowSubSchema` in [/Users/greg/Github/total-recall/src/core/schema.mjs](file:///Users/greg/Github/total-recall/src/core/schema.mjs)
- [x] Connect validators inside the master `MemoryNodeSchema`
- [x] Author test cases inside [/Users/greg/Github/total-recall/src/core/schema.spec.mjs](file:///Users/greg/Github/total-recall/src/core/schema.spec.mjs) asserting Zod validations pass


## ✅ Phase 2: JIT Sandbox Token Decryption Route
- [x] Add in-memory AES-256 decryption helper in [/Users/greg/Github/total-recall/src/core/crypto.mjs](file:///Users/greg/Github/total-recall/src/core/crypto.mjs)
- [x] Create `POST /api/sandbox/execute` router endpoint inside [/Users/greg/Github/total-recall/src/server/rest.mjs](file:///Users/greg/Github/total-recall/src/server/rest.mjs) with dual-tier fallback if Docker is present
- [x] Add Server-Sent Events (SSE) live logs streaming logs dispatcher
- [x] Add sandbox unit tests verifying token injection in [/Users/greg/Github/total-recall/src/core/sandbox.spec.mjs](file:///Users/greg/Github/total-recall/src/core/sandbox.spec.mjs)

## ✅ Phase 3: Comms Memory Context Retrieval Endpoint
- [x] Create `GET /api/comms/context` route inside [/Users/greg/Github/total-recall/src/server/rest.mjs](file:///Users/greg/Github/total-recall/src/server/rest.mjs) with E.164 phone mapping
- [x] Implement multi-category TF-IDF and vector semantic query resolvers targeting `contacts` and `interactions` under <150ms performance bounds
- [x] Write context formatting compiler yielding a single consolidated Markdown capsule
- [x] Add context retrieval integration tests in [/Users/greg/Github/total-recall/src/core/pruning-optimization.spec.mjs](file:///Users/greg/Github/total-recall/src/core/pruning-optimization.spec.mjs)

## ✅ Phase 4: UltraChat Custom Models Deployment Workflow
- [x] Implement GPU/CPU model hosting provisioning api inside [/Users/greg/Github/total-recall/src/cli/deploy-ui.mjs](file:///Users/greg/Github/total-recall/src/cli/deploy-ui.mjs)
- [x] Add ssh-based Docker, vLLM, and model download configurations
- [x] Integrate Caddy secure SSL subdomain registration script
- [x] Rebuild surface dynamic loader inside [/Users/greg/Github/total-recall/src/server/rest.mjs](file:///Users/greg/Github/total-recall/src/server/rest.mjs) to automatically hook new UltraChat Custom Model endpoints

## ✅ Phase 5: Testing & Verification
- [x] Run typescript typechecking gate: `node .agent/skills/code-quality/scripts/start-here-ts.mjs`
- [x] Run linting gates check: `node .agent/skills/code-quality/scripts/start-here-lint.mjs`
- [x] Execute entire Vitest conformance suite: `npm run test`
- [x] Verify UltraChat custom model setup via local dry run

## ✅ Phase 6: UltraChat Custom Models & Marketplace Packages Implementation
- [x] Create VFS catalog MODEL.md files for the three custom model packages:
  - `models/catalog/ultrachat/developer-cpu-pack/MODEL.md` (Gemma 5 Pro 32B / Llama 4 Scout 8B, 1,680,000 credits/mo)
  - `models/catalog/ultrachat/pro-gpu-pack/MODEL.md` (Gemma 5 Pro 32B / DeepSeek R1 32B / Qwen 3.6, 6,300,000 credits/mo)
  - `models/catalog/ultrachat/enterprise-gpu-pack/MODEL.md` (DeepSeek V4 / Llama 4 Scout 70B / GLM-5.1 MoE, 21,000,000 credits/mo)
- [x] Create VFS marketplace listing files for the three tiers:
  - `marketplace/listings/developer-cpu-pack/LISTING.md`
  - `marketplace/listings/pro-gpu-pack/LISTING.md`
  - `marketplace/listings/enterprise-gpu-pack/LISTING.md`
- [x] Develop dynamic model billing support in billing calculation services to resolve these model rates.
- [x] Implement a seeding/provisioning script `scripts/seed-marketplace-custom-models.ts` that writes both catalog models and marketplace listings.
- [x] Execute the seeding script and verify VFS auto-syncs down to database projections cleanly.
- [x] Run the complete codebase verification (TS check, linting, and tests) and confirm 100% success.


