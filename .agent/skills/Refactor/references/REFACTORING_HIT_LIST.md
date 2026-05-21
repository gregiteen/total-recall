# Refactoring Hit List: Files >1000 Lines

> **Protocol**: Follow [`.agent/skills/refactor/SKILL.md`](file:///Users/greg/Github/ultrachat-ai-powered/.agent/skills/refactor/SKILL.md) for all refactoring work.
> **Rule**: Route files are NEVER split into sub-route files. Extract services, helpers, and validators instead.
> **Generated**: 2026-05-03 | **Source**: `audit.sh` live scan — reflects actual code, not aspirational state

---

## 🔴 Critical Frontend (>1500 lines)

- [x] **`src/components/media-generation/audio/MultitrackAudioEditor.tsx`** — 1,740 lines (Extracted into 6 modules)
  - Extract: `TrackControls`, `AudioTimeline`, `MixerPanel`, `useMultitrackPlayback` hook
  - Largest frontend file; multiple distinct DSP + UI concerns

- [x] **`src/components/workspaces/useWorkspaceInterviewController.ts`** — 1,528 lines (Extracted into 4 modules)
  - Extract: `useApprovalPlanState`, `useInterviewApi`, and `useBlueprintGeneration` hooks
  - State machine for the wizard generator is overly tangled sub-hooks

- [x] **`src/pages/DeploymentsHub.tsx`** — 1,437 lines (Extracted into 7 modules)
  - Extract: `DeploymentCard`, `DeploymentStatusBadge`, `useDeploymentList` hook

- [x] **`src/components/crm/ContactDetailView.tsx`** — 1,423 lines (Extracted into 5 modules)
  - Extract: `ContactOverviewTab`, `ContactInteractionsTab`, `ContactTasksTab`, `ContactDealsTab`

---

## 🟡 High Frontend (1200–1500 lines)

- [x] **`src/pages/InvestPage.tsx`** (1,294 lines) - Marketing and Lead Gen
  - Extracted `InvestHeroSection`, `InvestMarketSection`, `InvestMetricsSection`, and `InvestorInterview` sub-components. Reduced orchestrator to ~100 lines.

- [ ] **`src/pages/DeploymentLandingEditor.tsx`** — 1,235 lines
  - Extract: `LandingPagePreview`, `EditorToolbar`, `useLandingEditor` hook

- [ ] **`src/components/calling/assistant-calling-modal/components.tsx`** — 1,131 lines
  - Extract: per-component files (modal is a monolith of inline sub-components)

- [ ] **`src/components/crm/ContactForm.tsx`** — 1,117 lines
  - Extract: `ContactFieldSection`, `ContactTagSelector`, `useContactForm` hook

---

## 🟡 High Backend (1100–1500 lines)

- [ ] **`server/services/workspace/WorkspacePresetCatalog.ts`** — 1,475 lines
  - If purely data, may be acceptable — analyze first. If it contains logic, extract `PresetBuilder`

- [ ] **`server/services/PersonalMailboxSyncService.ts`** — 1,171 lines
  - Extract: `MailboxFolderSyncer`, `MailboxMessageNormalizer`

- [ ] **`server/services/workflow/WorkflowExecutor.ts`** — 1,193 lines
  - Extract: `WorkflowStepRunner`, `WorkflowConditionEvaluator`

- [ ] **`server/services/assistantAutoReplyService.ts`** — 1,203 lines
  - Extract: `AutoReplyTriggerMatcher`, `AutoReplyTemplateRenderer`

- [ ] **`server/services/productivity/ProductionOrchestratorService.ts`** — 1,176 lines
  - Extract: sub-orchestrators per domain

- [ ] **`server/services/marketing/ViralContentService.ts`** — 1,115 lines
  - Extract: `ContentScorer`, `DistributionPlanner`

- [ ] **`server/services/marketing/BulkEmailCampaignService.ts`** — 1,105 lines
  - Extract: `CampaignScheduler`, `RecipientListBuilder`

- [ ] **`server/services/skills/crud.ts`** — 1,125 lines
  - Extract: `SkillValidator`, `SkillMergeStrategy`

---

## 🟠 Medium (1000–1100 lines)

- [ ] **`src/components/tasks/AdvancedTaskManager.tsx`** — 1,142 lines
  - Extract: `TaskCard`, `TaskFilterBar`, `useTaskActions` hook

- [ ] **`src/components/calendar/Calendar.tsx`** — 1,074 lines
  - Extract: `CalendarEventModal`, `CalendarDayView`, `useCalendarNavigation`

- [ ] **`src/components/chat/ToolResultsAccordion.tsx`** — 1,019 lines
  - Extract: per-tool-type result renderers

- [ ] **`src/hooks/useChatThreads.ts`** — 1,050 lines
  - Extract: `useThreadSearch`, `useThreadPagination`, `useThreadMutations`

- [ ] **`src/pages/CRM.tsx`** — 1,026 lines
  - Extract: `CRMContactList`, `CRMFilterPanel`, `useCRMData`

- [ ] **`src/pages/workflows/StepWorkflowEditor.tsx`** — 1,043 lines
  - Extract: `WorkflowStepNode`, `WorkflowEdgeRenderer`, `useWorkflowDrag`

- [ ] **`src/pages/deployment-detail/DetailContent.tsx`** — 1,075 lines
  - Extract: sub-section components

- [ ] **`src/services/NotificationService.ts`** — 1,195 lines
  - Extract: `NotificationChannelRouter`, `NotificationTemplateEngine`

- [ ] **`server/services/CRMService.ts`** — 1,068 lines
  - Extract: `CRMContactMatcher`, `CRMActivityLogger`

- [ ] **`server/services/KnowledgeBaseService.ts`** — 1,008 lines
  - Extract: `KBChunkIndexer`, `KBSemanticSearcher`

- [ ] **`server/services/SearchService.ts`** — 1,057 lines
  - Extract: `SearchIndexBuilder`, `SearchRanker`

- [ ] **`server/services/payoutService.ts`** — 1,027 lines
  - Extract: `PayoutCalculator`, `PayoutLedger`

- [ ] **`server/services/UsernameGenerationService.ts`** — 1,013 lines
  - Analyze first — may be large due to word lists (acceptable)

- [ ] **`server/services/notification/templates.ts`** — 1,033 lines
  - Analyze first — if pure templates, may be acceptable catalog

- [ ] **`src/App.tsx`** — 1,002 lines
  - Extract: route groupings, lazy-load wrappers — careful, high-coupling

---

## ⚪ Acceptable — SKIP (Route Handlers & Data Catalogs)

> These are route files (NEVER split into sub-routes) or pure data catalogs. Service extraction may still apply to route files with inline business logic >30 lines — audit individually.

| File | Lines | Reason |
|---|---|---|
| `server/routes/api/v1/email.ts` | 1,975 | Route handler — service extraction candidate, not file split |
| `server/routes/api/v1/workspaces.ts` | 1,580 | Route handler |
| `server/routes/communication/receptionist.ts` | 1,451 | Route handler |
| `server/routes/api/v1/admin/pricing.ts` | 1,410 | Route handler |
| `server/routes/communication/video.ts` | 1,346 | Route handler |
| `server/routes/workflows.ts` | 1,338 | Route handler |
| `server/routes/tasks.ts` | 1,343 | Route handler |
| `server/routes/assistant-email.ts` | 1,507 | Route handler |
| `server/routes/api/v1/asterisk.ts` | 1,134 | Route handler — partially refactored |
| `server/routes/crm/contacts.ts` | 1,105 | Route handler |
| `server/routes/admin/email.routes.ts` | 1,217 | Route handler |
| `server/routes/admin/system.ts` | 1,027 | Route handler |
| `server/routes/api/v1/code-execute.ts` | 1,066 | Route handler |
| `src/services/workflow/library/catalog.ts` | 1,168 | Static node catalog — acceptable |
| `src/types/workspace.ts` | 1,195 | Type definitions — acceptable |
| `server/services/__tests__/RuntimeService.test.ts` | 1,291 | Test file — never split |

---

## Execution Priority

1. **Frontend first** — `MultitrackAudioEditor.tsx` (1,740), `useWorkspaceInterviewController.ts` (1,528), `DeploymentsHub.tsx` (1,437) — self-contained, lower blast radius
2. **Backend services** — `WorkspacePresetCatalog.ts`, `PersonalMailboxSyncService.ts`, `WorkflowExecutor.ts`
3. **Route service extraction** — `email.ts`, `workspaces.ts` (inline business logic → services, route file stays)
4. **Low-risk medium files** — medium-sized files last

> **Note on asterisk.ts**: Previously targeted (2,224 lines in April). Now 1,134 lines — significant reduction already done. Confirm if service extraction is complete or still partial.
