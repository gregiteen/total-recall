# System Architecture: SSSS-Native UltraChat Integration

This document defines the REST API endpoints, SSSS schema enhancements, and sandbox isolation boundaries for the unified database-free UltraChat and Total Recall 3.0 platform.

---

## 🌐 1. REST API Routing Interface

### A. Dual-Tier Hardened JIT Sandbox Router
* **Endpoint**: `POST /api/sandbox/execute`
* **Controller**: [/Users/greg/Github/total-recall/src/server/controllers/sandbox.mjs](file:///Users/greg/Github/total-recall/src/server/controllers/sandbox.mjs)
* **Handler Sequence**:
  ```mermaid
  sequenceDiagram
      autonumber
      UltraChat ->> REST Router: POST /api/sandbox/execute { task_slug, script_body, limits }
      REST Router ->> Crypt Supervisor: Decrypt {{secrets.*}} tokens in script_body
      Crypt Supervisor ->> REST Router: Return sanitized script_body with in-memory tokens
      alt Docker Available on Host
          REST Router ->> Docker Service: executeInContainer(userId, script_body)
          Docker Service -->> REST Router: Stream stdout/stderr logs
      else Docker Unavailable / Disabled
          REST Router ->> Hardened Sandbox: Spawn experimentalNodeVm(script_body, limits)
          Hardened Sandbox -->> REST Router: Stream stdout/stderr (Server-Sent Events)
      end
      REST Router -->> UltraChat: SSE events stream (live logs in terminal console)
  ```

### B. Contact & Comms Memory Context Router
* **Endpoint**: `GET /api/comms/context`
* **Controller**: [/Users/greg/Github/total-recall/src/server/controllers/comms.mjs](file:///Users/greg/Github/total-recall/src/server/controllers/comms.mjs)
* **Performance Gate**: Must complete in < 150ms for live Asterisk ARI call streams.
* **Handler Sequence**:
  1. Parse `phone` or `contact_slug` query parameter.
  2. Search `graph-index.jsonl` vector embeddings and apply TF-IDF search for category: `contacts` matching target.
  3. Load matching SSSS contact node and the last 3 linked `interactions` SSSS call/message transcript files.
  4. Synthesize context:
     ```markdown
     ## Active Contact Profile
     - **Name**: [[contact-slug]]
     - **Category**: preferences / family
     - **Key Guidelines**:
       * Modality must: {{guidelines}}
     
     ## Historical Takeaways (Last 3 Communications)
     * call-2026-05-24: {{summary}}
     * msg-2026-05-25: {{summary}}
     ```
  5. Return compiled Markdown string in JSON payload.

### C. UltraChat Custom Model Deployment Router
* **Endpoint**: `POST /api/deploy/digitalocean`
* **Controller**: [/Users/greg/Github/total-recall/src/server/rest.mjs](file:///Users/greg/Github/total-recall/src/server/rest.mjs)
* **Handler Sequence**:
  1. Retrieve GCM-encrypted backend `{{secrets.digitalocean_api_token}}` from central config (not user-owned).
  2. Dispatch model host creation API call to the cloud backend to boot the private CPU/GPU node.
  3. Calculate actual hourly hosting cost, add a 5% markup, and deduct the resulting total in credits from the user's balance:
     * **100 credits = $0.01** ($1.00 = 10,000 credits).
  4. Establish SSH tunnel using backend GCM-encrypted credentials, deploy Docker/vLLM, and pull the open-source model.
  5. Deploy Caddy SSL tunnel to bind automated Let's Encrypt certificates to the custom model subdomain.
  6. Write the SSSS preference node `config-do-<model-slug>.md` back into the workspace preferences vault.

---

## 📂 2. SSSS Schema Extensions ([/Users/greg/Github/total-recall/src/core/schema.mjs](file:///Users/greg/Github/total-recall/src/core/schema.mjs))
We will extend [/Users/greg/Github/total-recall/src/core/schema.mjs](file:///Users/greg/Github/total-recall/src/core/schema.mjs) to validate the new UltraChat categories natively:

```javascript
export const AssistantSubSchema = z.object({
  x_generative_model_target: z.string(),
  system_prompt: z.string(),
  voice_id: z.string().optional(),
  custom_voice_settings: z.object({
    stability: z.number().min(0).max(1).optional(),
    similarity_boost: z.number().min(0).max(1).optional(),
    speed: z.number().min(0.5).max(2).optional()
  }).optional(),
  email: z.string().email().optional(),
  email_behavior: z.string().optional(),
  chat_memory_enabled: z.boolean().default(true),
  standard_knowledge_base_id: z.string().uuid().optional(),
  browser_automation_instructions: z.string().optional(),
  favorite_skills: z.array(z.string()).optional()
});

export const WorkflowSubSchema = z.object({
  cron_expression: z.string().optional(),
  x_sandbox_limits: z.object({
    ram_mb: z.number().int().default(512),
    timeout_sec: z.number().int().default(60)
  }),
  script_body: z.string(),
  variables: z.record(z.unknown()).optional()
});
```

---

## 🔒 3. Hardened JIT Sandbox Boundaries & Key Decryption
All script executions inside the sandbox are isolated using:
* **Node `experimental-vm-modules`**: Thread contexts are fully isolated, disabling `global.process`, `require`, and direct filesystem access outside `~/.agent/`.
* **Subprocess Redaction**: Plane credentials loaded via `{{secrets.*}}` syntax are GCM-decrypted only inside the Express memory heap prior to vm initialization. The sandbox thread itself has no API keys in its context state, preventing script command injections from leaking credentials.
