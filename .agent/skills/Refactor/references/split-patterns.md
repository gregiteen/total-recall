# Refactor Split Patterns  Real Examples

## Pattern 1: Orchestrator + Focused Modules

**When to use:** A class or file does setup/routing AND contains the actual logic for multiple sub-systems inline.

**Example: StreamHandler.ts (1062  4 files)**

Before:
```
StreamHandler.ts (1062 lines)
  - Skills catalog fetch
  - Tool instruction injection
  - OpenRouter request / response
  - Anthropic fallback streaming
  - OpenAI fallback streaming
  - SSE stream parsing
  - Tool execution + recursive follow-up
```

After:
```
StreamHandler.ts     (291 lines)  request setup, header flush, fallback routing
SkillsInjector.ts    ( 86 lines)  fetchSkillsCatalog(), getToolInstructions()
FallbackStreamer.ts  (269 lines)  streamViaAnthropic(), streamViaOpenAI()
CoreStreamProcessor.ts (423 lines)  processStream(), handleToolExecution()
```

**Key signal:** Multiple `private async methodX()` blocks each 100+ lines with distinct imports.

---

## Pattern 2: React Component  Component + Hooks + Sub-components

**When to use:** A React component has inline sub-components, local state logic that could be a hook, and section renders that are independent.

```
ContactDetailView.tsx (1217 lines)
  
ContactDetailView.tsx     (~400 lines)  layout, tab routing, orchestration
hooks/useContactDetail.ts (~200 lines)  data fetching, state management
sections/InteractionsTab.tsx (~200 lines)
sections/DealsTab.tsx        (~200 lines)
sections/TasksTab.tsx        (~200 lines)
```

**Key signal:** Sections inside return JSX that have their own useState/useEffect, or large blocks of JSX >100 lines that map to a tab or panel.

---

## Pattern 3: Service Class  Focused Services

**When to use:** A service class has 3+ unrelated method groups. Each group could be independently instantiated or tested.

```
AuthService.ts (1400 lines)
  
AuthService.ts       (300 lines)  orchestrator, delegates to sub-services
TokenService.ts      (400 lines)  JWT creation, validation, refresh
OAuthService.ts      (400 lines)  OAuth provider flows
SessionService.ts    (300 lines)  session storage, invalidation
```

**Key signal:** The service imports from 5+ different domains. Methods in one group never call methods from another group.

---

## Pattern 4: Utils  Domain-Grouped Helpers

**When to use:** A utils file has grown to cover multiple unrelated domains.

```
utils.ts (1100 lines)
  
dateUtils.ts     (150 lines)
stringUtils.ts   (200 lines)
phoneUtils.ts    (100 lines)
currencyUtils.ts (120 lines)
```

**Key signal:** Functions in the file have no shared state. They could be copy-pasted to any project independently.

---

---

## Pattern 5: Route File  Service Extraction (keep one route file)

**When to use:** A route file (`routes/**/*.ts`) exceeds 500 lines because handler bodies contain business logic instead of thin delegation calls.

**Key rule**: The route file is NEVER split into sub-route files. One domain = one route file, forever. The fix is to extract the *logic inside the handlers* into service classes.

```
assistants.ts (2212 lines)  route file with inline business logic
   (Service Extraction, NOT file split)
assistants.ts              (~250 lines)  route wiring only: router.verb(path, auth, Service.method)
AssistantApiService.ts     (~553 lines)  chat completions handler (already done )
AssistantQueryService.ts   (~300 lines)  GET /, GET /:id, GET /:id/workspace-grants
AssistantMutationService.ts (~400 lines)  POST /, PUT /:id, DELETE /:id, restore/share
AssistantSkillService.ts   (~200 lines)  GET|PUT /:id/skills
AssistantSharingService.ts (~200 lines)  workspace grants, share tokens
AssistantEmailService.ts   (~300 lines)  email-related routes
```

**What stays in the route file:**
```ts
//  Good  thin wiring
router.get("/:id", authenticateUser, AssistantQueryService.getById);
router.delete("/:id", authenticateUser, AssistantMutationService.delete);

//  Bad  business logic in route
router.delete("/:id", authenticateUser, async (req, res) => {
  const assistant = await supabase.from('assistants').select('*')...
  if (!assistant) return res.status(404)...
  // 30 more lines
});
```

**Key signal:** Any route handler body longer than ~5 lines should be in a service.

---

## Coupling Patterns to Watch

### High-coupling (risky to split)
- Shared `const` / `enum` used across all sections  must go to a shared types file
- Recursive calls between methods (`processStream` calls `handleToolExecution` calls `processStream`)  keep these in the same module
- Shared private state (class fields used by multiple method groups)  cannot split without restructuring

### Low-coupling (safe to split)
- Methods that only use their own parameters and imported utilities
- Sections separated by `//  Section Name ` comments
- Methods that are only called from ONE other method
