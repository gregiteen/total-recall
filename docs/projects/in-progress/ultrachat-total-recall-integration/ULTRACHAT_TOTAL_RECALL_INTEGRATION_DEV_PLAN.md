# Development Plan: SSSS-Native UltraChat Integration

We will implement the unified database-free integration between UltraChat and Total Recall 3.0 across four distinct execution phases, ensuring complete schema validation and robust posix sandboxing.

---

## ⏳ Phase 1: SSSS Schema Upgrades
We will add strict Zod validations for the new UltraChat categories to ensure all files in the VFS vault pass quality checks.

* **Target File**: [/Users/greg/Github/total-recall/src/core/schema.mjs](file:///Users/greg/Github/total-recall/src/core/schema.mjs)
  * Define `AssistantSubSchema` and `WorkflowSubSchema` validators.
  * Integrate them into the master `MemoryNodeSchema`.
* **Verification File**: [/Users/greg/Github/total-recall/src/core/schema.spec.mjs](file:///Users/greg/Github/total-recall/src/core/schema.spec.mjs)
  * Assert that valid assistant and workflow markdown headers pass Zod validation cleanly.

---

## ⏳ Phase 2: JIT Sandbox Token Decryption Route
We will implement the secure script sandbox route, streaming live events back via Server-Sent Events.

* **Target File**: [/Users/greg/Github/total-recall/src/core/crypto.mjs](file:///Users/greg/Github/total-recall/src/core/crypto.mjs)
  * Add the in-memory AES-256 decryption utility for custom model tokens.
* **Target File**: [/Users/greg/Github/total-recall/src/core/sandbox.mjs](file:///Users/greg/Github/total-recall/src/core/sandbox.mjs)
  * Implement the `POST /api/sandbox/execute` Express handler with dual-tier fallback to [/Users/greg/Github/ultrachat-ai-powered/server/services/cliSandboxService.ts](file:///Users/greg/Github/ultrachat-ai-powered/server/services/cliSandboxService.ts) if Docker is present.
  * Set up Server-Sent Events (SSE) logs streaming.
* **Verification File**: [/Users/greg/Github/total-recall/src/core/sandbox.spec.mjs](file:///Users/greg/Github/total-recall/src/core/sandbox.spec.mjs)
  * Assert that sandbox executions decrypt tokens correctly in-memory and isolate scripts.

---

## ⏳ Phase 3: Comms Memory Context Retrieval Endpoint
We will implement the contact context injection API to deliver relationship memory during live comms.

* **Target File**: [/Users/greg/Github/total-recall/src/server/index.mjs](file:///Users/greg/Github/total-recall/src/server/index.mjs)
  * Implement the `GET /api/comms/context` route with <150ms latency performance bars.
  * Retrieve matching `contacts` and `interactions` nodes using TF-IDF and vector semantic search.
  * Format and compile the final relationship context markdown capsule.
* **Verification File**: [/Users/greg/Github/total-recall/src/core/pruning-optimization.spec.mjs](file:///Users/greg/Github/total-recall/src/core/pruning-optimization.spec.mjs)
  * Add automated integration tests asserting that the correct context markdown is returned for phone numbers.

---

## ⏳ Phase 4: UltraChat Custom Model Deployment Workflow
We will implement automated model spin-up and SSL tunnel configurations on UltraChat's dedicated backend.

* **Target File**: [/Users/greg/Github/total-recall/src/cli/deploy-ui.mjs](file:///Users/greg/Github/total-recall/src/cli/deploy-ui.mjs)
  * Implement the model provisioning API.
  * Inject ssh configuration and docker setup scripts.
* **Target File**: [/Users/greg/Github/total-recall/src/server/rest.mjs](file:///Users/greg/Github/total-recall/src/server/rest.mjs)
  * Rebuild the models catalogue compiler to dynamically bind new custom model endpoints when written to the VFS preferences vault.

---

## ⏳ Phase 6: UltraChat Custom Models & Marketplace Packages Implementation
We will implement the SSSS VFS files, seed script, and database projections for the three custom model packages.

* **Target Files (VFS Model Catalog)**:
  * `models/catalog/ultrachat/developer-cpu-pack/MODEL.md`
  * `models/catalog/ultrachat/pro-gpu-pack/MODEL.md`
  * `models/catalog/ultrachat/enterprise-gpu-pack/MODEL.md`
* **Target Files (VFS Marketplace Listings)**:
  * `marketplace/listings/developer-cpu-pack/LISTING.md`
  * `marketplace/listings/pro-gpu-pack/LISTING.md`
  * `marketplace/listings/enterprise-gpu-pack/LISTING.md`
* **Target File**: `scripts/seed-marketplace-custom-models.ts`
  * Create a TypeScript seed script to dynamically register and synchronize these models and marketplace listings directly via SSSS VFS APIs, ensuring downstream projections are reconstructed.

