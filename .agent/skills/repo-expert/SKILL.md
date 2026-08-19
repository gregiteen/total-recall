---
name: repo-expert
description: >-
  Use this skill when you need to understand codebase architecture, file
  structure, and runtime topology. MANDATORY: You MUST read the full SKILL.md
  file before executing.
repo_scoped: true
generated_at: 2026-08-19T17:43:55.575Z
generated_from: total-recall
---

# total-recall-brain — Codebase Architecture

> Personal AI system — database-free, SSSS-powered intelligence engine deployable to any POSIX host.

> **Auto-generated** by `npx total-recall skill generate-expert`. Regenerate anytime to stay current.

## Stack

- **Languages**: JavaScript (568 files), Markdown (261 files), TypeScript (128 files), Python (29 files), CSS (13 files)
- **Frameworks**: React, Express
- **Tests**: Vitest
- **Module system**: module
- **Package manager**: npm

## Directory Structure

```
.agent/
  logs/  (1 items)
  scratch/  (1 items)
  skills/
    code-mode/  (6 items)
    code-quality/  (9 items)
    instruction-keeper/  (8 items)
    okf/  (5 items)
    project-management/  (6 items)
    push/  (7 items)
    repo-expert/  (7 items)
    research/  (1 items)
    security/  (7 items)
    skill/  (8 items)
    ssss/  (7 items)
    test/  (7 items)
    total-recall/  (17 items)
    total-recall-project-management/  (6 items)
.agents/
  rules/  (3 items)
  skills/  (14 items)
bin/  (4 items)
collab/
  backend/  (3 items)
  frontend/
    public/  (5 items)
    src/  (6 items)
config/  (2 items)
docs/
  architecture/  (2 items)
  developer/  (1 items)
  guides/  (9 items)
  how-to/  (1 items)
  infra/  (3 items)
  projects/
    archived/  (8 items)
    completed/  (46 items)
    in-progress/  (0 items)
    planned/  (3 items)
  reference/  (6 items)
  security/  (2 items)
  setup/  (1 items)
extension/
  icons/  (4 items)
  lib/  (2 items)
  options/  (3 items)
  popup/  (3 items)
  sidepanel/  (3 items)
fixtures/
  invalid/  (5 items)
  okf-bundles/
    cross-linked/  (2 items)
    full/  (2 items)
    minimal/  (1 items)
    nested/  (2 items)
    no-frontmatter/  (1 items)
    with-reserved/  (3 items)
  valid/  (8 items)
frontend/
  public/
    brand/  (4 items)
  src/
    api/  (29 items)
    assets/  (3 items)
    components/  (30 items)
    pages/  (59 items)
    utils/  (1 items)
infra/
  headscale/  (3 items)
knowledge-catalog/
  agents/
    enrichment/  (3 items)
    mdcode/  (8 items)
  okf/
    bundles/  (3 items)
    samples/  (3 items)
    src/  (1 items)
    tests/  (8 items)
  samples/
    discovery/  (6 items)
    enrichment/  (3 items)
  toolbox/
    enrichment/  (5 items)
    mdcode/  (8 items)
models/
  catalog/
    total-recall/  (1 items)
scaffold/
  .agent/
    skills/  (1 items)
scratch/
  dummy-repo/
    .agent/  (1 items)
scripts/  (13 items)
src/
  cli/
    ingest/  (4 items)
  core/  (224 items)
  server/
    routes/  (90 items)
templates/
  default-config/  (4 items)
  obsidian-queries/  (4 items)
  openwiki/  (6 items)
```

## Entry Points

- **total-recall**: `bin/total-recall.mjs` (bin)
- **antigravity**: `bin/antigravity.mjs` (bin)

## CLI Commands

53 commands in `src/cli/`:

| Command | File | Description |
|---------|------|-------------|
| agent-dir | agent-dir.mjs | Shared `.agent/` directory resolver for CLI commands. |
| backfill | backfill.mjs |  |
| backup | backup.mjs | total-recall backup |
| brain | brain.mjs |  |
| chat | chat.mjs | Total Recall CLI Chat Interface |
| collab | collab.mjs | total-recall collab |
| command | command.mjs |  |
| config | config.mjs |  |
| connect | connect.mjs |  |
| daemon | daemon.mjs | total-recall daemon |
| deploy-ui | deploy-ui.mjs | deploy-ui.mjs |
| deploy | deploy.mjs | total-recall deploy |
| doctor | doctor.mjs | total-recall doctor |
| dream | dream.mjs | total-recall dream |
| export | export.mjs |  |
| forget | forget.mjs |  |
| friction | friction.mjs | CLI command to run Friction Detection on logs |
| generate-pat | generate-pat.mjs |  |
| hash-password | hash-password.mjs |  |
| help | help.mjs | total-recall help |
| import-rules | import-rules.mjs | src/cli/import-rules.mjs |
| ingest-okf | ingest-okf.mjs |  |
| ingest-openwiki | ingest-openwiki.mjs |  |
| ingest | ingest.mjs | total-recall ingest |
| init | init.mjs | total-recall init |
| integration-dispatcher | integration-dispatcher.mjs | Dynamic SSSS-driven Integration Dispatcher. |
| key | key.mjs |  |
| lint | lint.mjs | total-recall lint |
| map | map.mjs |  |
| mesh | mesh.mjs | total-recall mesh — control-server (headscale) mesh administ |
| migrate | migrate.mjs |  |
| proposals | proposals.mjs |  |
| rebuild | rebuild.mjs | SSSS Projection Rebuild Command |
| recall | recall.mjs |  |
| relay | relay.mjs | total-recall relay |
| remember | remember.mjs | Parse a human-friendly duration string and return a Date in  |
| repo-expert-generate | repo-expert-generate.mjs | repo-expert-generate.mjs — Auto-generate repo-expert SKILL.m |
| research | research.mjs | src/cli/research.mjs |
| reset-password | reset-password.mjs | Read a password without echoing it, and without it ever beco |
| restore | restore.mjs | total-recall restore |
| ... | +13 more | |

## API Routes

44 route modules in `src/server/routes/`:

### auth (6 endpoints)

- `POST /auth/login`
- `POST /auth/logout`
- `POST /auth/change-password`
- `GET /auth/me`
- `GET /auth/status`
- `POST /auth/setup`

### brains (3 endpoints)

- `GET /api/brains`
- `GET /api/brains/:id/nodes`
- `POST /api/brains/sync`

### capture (1 endpoints)

- `POST /api/capture/:source`

### collab (11 endpoints)

- `POST /api/collab/auth/register`
- `POST /api/collab/auth/login`
- `GET /api/collab/groups`
- `POST /api/collab/groups`
- `POST /api/collab/groups/join`
- `GET /api/collab/annotations`
- `POST /api/collab/annotations`
- `GET token`

### config (5 endpoints)

- `GET /api/config`
- `GET /api/config-json`
- `POST /api/config-json`
- `GET /api/config/:name`
- `PUT /api/config/:name`

### context (4 endpoints)

- `POST /api/context`
- `GET /api/context/preview`
- `POST /api/context/stream`
- `GET /api/context/flash/health`

### dashboard (1 endpoints)

- `GET /api/dashboard/instructions`

### docs (8 endpoints)

- `GET /api/docs`
- `GET /api/docs/read`
- `POST /api/docs`
- `PUT /api/docs`
- `DELETE /api/docs`
- `GET /api/views`
- `POST /api/views`
- `DELETE /api/views/:id`

### dream (1 endpoints)

- `POST /api/dream`

### embeddings (3 endpoints)

- `GET /api/embeddings/provider`
- `POST /api/embeddings/model`
- `POST /api/embeddings/rediscover`

### export (1 endpoints)

- `GET /api/brain/export`

### extension (2 endpoints)

- `GET /api/extension/download`
- `GET /api/extension/status`

### field (3 endpoints)

- `POST /api/field/compile`
- `POST /api/field/sample`
- `GET /api/field/stats`

### files (1 endpoints)

- `GET /api/files`

### graph (10 endpoints)

- `GET host`
- `GET /api/graph`
- `GET /api/conflicts`
- `POST /api/conflicts/resolve`
- `GET /api/ssss`
- `GET /api/ssss/instructions`
- `GET /api/ssss/skill/ssss`
- `GET /api/ssss/spec`
- `GET /api/ssss/references`
- `GET /api/ssss/references/:name`

### headscale (7 endpoints)

- `GET /api/headscale/node`
- `DELETE /api/headscale/node/:id`
- `GET /api/headscale/preauthkey`
- `POST /api/headscale/preauthkey`
- `GET /api/headscale/user`
- `GET /api/headscale/policy`
- `PUT /api/headscale/policy`

### help (3 endpoints)

- `GET /.well-known/total-recall.json`
- `GET /api`
- `GET /api/help`

### import (2 endpoints)

- `GET /api/import/rules`
- `POST /api/import/rules`

### instructions (2 endpoints)

- `GET /api/instructions`
- `PUT /api/instructions`

### integrations (2 endpoints)

- `GET /api/integrations/active`
- `POST /api/integrations/connect`

### keys (3 endpoints)

- `GET /api/keys`
- `POST /api/keys`
- `DELETE /api/keys/:id`

### memory (9 endpoints)

- `GET /api/memory`
- `GET /api/memory/stats`
- `GET /api/memory/:slug`
- `POST /api/memory`
- `PUT /api/memory/:slug`
- `PATCH /api/memory/:slug`
- `DELETE /api/memory/:slug`
- `POST /api/memory/search/semantic`

### mesh (15 endpoints)

- `GET /api/mesh/leader`
- `GET /api/mesh/nodes`
- `POST /api/mesh/access`
- `GET /api/mesh/access/proposals`
- `POST /api/mesh/access/import`
- `GET /api/mesh/enrollment`
- `POST /api/mesh/enroll`
- `GET /api/mesh/io`
- `GET /api/mesh/interfaces`
- `GET /api/mesh/lan`

### models (5 endpoints)

- `GET /v1/models`
- `GET /api/gemini-models`
- `GET /api/claude-models`
- `GET /api/openai-models`
- `GET /api/openrouter-models`

### network (6 endpoints)

- `GET /api/network/stats`
- `GET /api/network/policy`
- `PUT /api/network/policy`
- `POST /api/network/block`
- `DELETE /api/network/block/:domain`
- `GET /api/network/audit`

### notifications (5 endpoints)

- `GET /api/notifications/rules`
- `POST /api/notifications/rules`
- `DELETE /api/notifications/rules/:id`
- `GET /api/notifications/history`
- `POST /api/notifications/test`

### proposals (6 endpoints)

- `GET /api/proposals`
- `GET /api/proposals/stale`
- `GET /api/proposals/:id`
- `POST /api/proposals/:id/apply`
- `POST /api/proposals/:id/reject`
- `POST /api/proposals/:id/revert`

### research (5 endpoints)

- `GET /api/research`
- `POST /api/research`
- `PATCH /api/research/:id`
- `DELETE /api/research/:id`
- `POST /api/sync/remote-vault/run`
- `GET /api/sync/remote-vault/status`

### rules (1 endpoints)

- `GET /api/rules`

### sandbox (1 endpoints)

- `POST /api/sandbox`

### scripts (4 endpoints)

- `GET /api/scripts`
- `GET /api/scripts/:name`
- `PUT /api/scripts/:name`
- `POST /api/scripts/:name/run`

### secrets (26 endpoints)

- `GET /api/secrets/checksum`
- `GET /api/secrets/sync`
- `GET /api/secrets/list`
- `GET /api/secrets/sync/status`
- `POST /api/secrets/sync/trigger`
- `POST /api/secrets/sync/trigger-pull`
- `GET /api/secrets/providers`
- `GET /api/secrets/tracking-health`
- `GET /api/secrets/shared-values`
- `POST /api/secrets/account-sync`

### sessions (5 endpoints)

- `GET /api/sessions`
- `GET /api/sessions/:id`
- `POST /api/sessions/ingest`
- `DELETE /api/sessions/:id`

### share (1 endpoints)

- `POST /api/share`

### skills (12 endpoints)

- `GET /api/skills`
- `GET /api/skills/search`
- `POST /api/skills/install`
- `GET /api/skills/:name/files`
- `GET /api/skills/:name`
- `PUT /api/skills/:name`
- `DELETE /api/skills/:name`
- `POST /api/skills/toggle`
- `POST /api/skills/preview`
- `POST /api/skills/audit`

### ssss (8 endpoints)

- `GET host`
- `GET /api/ssss`
- `GET /api/ssss/instructions`
- `GET /api/ssss/skill/ssss`
- `GET /api/ssss/spec`
- `GET /api/ssss/references`
- `GET /api/ssss/references/:name`
- `POST /api/v1/ssss`

### sync (1 endpoints)

- `POST /api/sync/remote-vault/proposals/:id/decision`

### system (8 endpoints)

- `GET /api/logs/:type`
- `POST /api/diagnostics/agents`
- `GET /api/pairing`
- `GET /api/tasks/failed`
- `POST /api/tasks/:id/retry`
- `GET /api/usage`
- `GET /api/usage/providers`
- `POST /api/daemon/restart`

### tasks (3 endpoints)

- `GET /api/tasks`
- `DELETE /api/tasks/cleanup`
- `POST /api/tasks`

### tts (2 endpoints)

- `GET /api/tts/status`
- `POST /api/tts`

### update (2 endpoints)

- `GET /api/update/check`
- `POST /api/update/run`

### vault (4 endpoints)

- `POST /api/vault/compile`
- `POST /api/vault/compact`
- `GET /api/vault/hash`
- `GET /api/vault/status`

### webauthn (7 endpoints)

- `GET /api/webauthn/status`
- `POST /api/webauthn/register/options`
- `POST /api/webauthn/register/verify`
- `POST /api/webauthn/assert/options`
- `POST /api/webauthn/assert/verify`
- `POST /api/webauthn/step-up/password`
- `DELETE /api/webauthn/credentials/:id`

### webhooks (7 endpoints)

- `GET /api/webhooks/configs`
- `POST /api/webhooks/configs`
- `DELETE /api/webhooks/configs/:provider`
- `GET /api/webhooks/events`
- `POST /api/webhooks/events/:id/redeliver`
- `POST /api/webhooks/test/:provider`
- `POST /api/webhooks/:provider`

## Frontend Pages

- AutomationsPage
- ChatPage
- CollabPage
- DesignDocsPage
- FilesPage
- GraphPage
- HealthPage
- HelpPage
- InboxPage
- InstructionsPage
- IntegrationsPage
- LoginPage
- MemoryPage
- MeshPage
- NetworkPage
- NotificationsPage
- OkfPage
- OnboardingPage
- OpenWikiPage
- RulesPage
- SandboxPage
- SecretsPage
- SettingsPage
- SkillsPage
- TasksPage
- UsagePage
- WebhooksPage

## Components

- BrainSelector
- ContextualHelp
- DaemonLogsTab
- DocumentEditorModal
- DocumentTable
- EmbeddingProviderPanel
- Graph3D
- LatencySparkline
- MarkdownUtils
- MeshTopology
- MobilePairing
- ResearchAgendaTab
- TaskQueueTab
- UsageChart
- VoiceInput
- brand/BrandMark

## Core Modules

104 modules in `src/core/`:

- **append-log** — exports: compactAppendLogs
- **blackboard** — exports: loadBlackboard, saveBlackboard, updateBlackboardState, clearBlackboard
- **browser-session** — exports: getChromium, resolveProfileDir, ensureProfileDir, launchRotationContext, openConsole, isAuthenticated, looksLikeLoginUrl, waitForLogin
- **clarity-rewriter** — exports: runClarityReview, runStalenessCheck, runFactSeeker, runCutoffAudit, writeCorrection
- **conclusion-writer** — exports: validateDraftNode, runConclusionWriter
- **config** — exports: getEnvVar, detectProjectBrain, getActiveBrains, resolveBrainLayer
- **conflict-detector** — exports: detectSemanticConflicts, scanVaultForConflicts, detectPatchConflict, computeFileHash, autoResolveConflict, applyAutoResolution, detectAndResolve, writeConflicts
- **context-compiler** — exports: compileContext, previewContext
- **crons** — exports: runCrons
- **crypto** — exports: clearDerivedKeyCache, deriveKey, deriveKeySync, encryptSecrets, encryptSecretsSync, decryptSecrets, decryptSecretsSync, generateSignatureKeyPair
- **daemon-control** — exports: readPid, getDaemonStatus, startDaemon, stopDaemon, ensureDaemonRunning
- **daemon-loop** — exports: writeInterrupt, acquirePidLock, releasePidLock
- **device-io** — exports: buildIoProfileFromSignals, uiHintsFromIo, detectDeviceIo, mergeIoProfiles
- **dream** — exports: pruneResolvedProposals, autoPruneStorage, scanModifiedVault, loadCandidatesFromInbox, loadCandidatesFromSessions, collectRemCandidates, evaluateCandidates, runDreamCycle
- **drift-detector** — exports: detectIndexDrift, checkEventLogIntegrity
- **embeddings** — exports: getEmbedding, cosineSimilarity, loadEmbeddingsIndex, saveEmbeddingToIndex, removeEmbeddingFromIndex, nodeToEmbedText, chunkNodeBody, buildEmbeddingsIndex
- **emergency-alerts** — exports: writeEmergencyAlert, clearEmergencyAlerts, readEmergencyAlerts, runStartupHealthCheck
- **env-import** — exports: inferProvider, maskSecret, parseEnvText, isCandidateKey, defaultEnvFilePaths, scanEnvSources, publicScanResult, importEnvSecrets
- **evolution** — exports: runSsssEvalWorkflow, proposeSchemaUpgrades, applySchemaUpgrade
- **fact-seeker** — exports: getLocalizedDateTime, formatBeautifulDate, loadAgenda, addToAgenda, markTopicResearched, getNextAgendaTopic, inferTopicsFromSession, buildMultiNoteGraph
- **fast-recall** — exports: fastSearch
- **friction** — exports: detectFriction
- **github-sync** — exports: initGitHubSync, runGitHubSync, getGitHubSyncStatus
- **headscale-client** — exports: headscaleUrlFromEnv, assertSecureControlUrl, normalizeControlUrl, findHeadscaleKeyMeta, resolveHeadscaleConfig, describeHeadscaleAvailability, headscaleFetch, headscaleFetchWithLegacyFallback
- **import-rules** — exports: detectRuleFiles, importRuleFiles, detectAndImport
- **inference-engine** — exports: runInferenceTask, runSynthesisTask
- **lan-discovery** — exports: parseArpTable, discoverLanHosts, probeLanBrains, discoverLanSnapshot, lanHostnameFromIp, registerLanMeshNodes
- **leader-election** — exports: getLeaderInfo, isLeader, tryAcquireLease, renewLease, releaseLease
- **logger**
- **memory-layers** — exports: normalizeMemoryLayer, inferMemoryLayer, memoryLayerRoutingWeight, buildMemoryLayerIndex
- **memory-title** — exports: stripSelfCapturedTitlePrefix, isSelfCapturedEchoTitle, defaultTitleFromBody, normalizeMemoryTitle
- **mesh-access** — exports: parseSshConfig, readSshConfig, sshConfigMatchScore, findSshConfigEntryForNode, accessFromSshConfigEntry, classifyTailscaleVariant, meshSshFromVariant, resolveNodeAccess
- **mesh-auth** — exports: normalizeRemoteAddress, isMeshOrLoopbackAddress, getMeshSyncToken, getMeshSyncAuthorization, requireMeshSyncAuth
- **mesh-enroll** — exports: resetAutoEnrollThrottle, supportsTailscaleSsh, readTailscaleStatus, readTailscalePrefs, resolveLoginServer, getEnrollmentStatus, autoEnrollEnabled, buildUpArgs
- **mesh** — exports: normalizeHostname, meshNodeDocSlug, meshNodeKey, clearMeshStatusCache, isMeshAvailable, getMeshSelf, getMeshIp, getMeshHostname
- **migrate** — exports: runMigration, testMigration
- **network-bind** — exports: resolveServerHost
- **network-interfaces** — exports: classifyInterfaceKind, isLanIpv4, isOverlayIpv4, listLocalInterfaces, summarizeInterfacesForEntity, listLocalLanCidrs
- **notifications** — exports: sendSystemNotification, listNotificationRules, createNotificationRule, deleteNotificationRule, recordNotificationDelivery, listNotificationHistory, sendTestNotification
- **obsidian-sync** — exports: syncObsidianToVault, watchObsidianDirectory
- **okf-adapter** — exports: okfConceptToSsssNode, ssssNodeToOkfConcept, importBundle, exportBundle, lintOkfCompliance, generateLiveIndex, generateLiveLog
- **ollama-embeddings** — exports: normalizeBaseUrl, listOllamaModels, resolveOllamaEndpoint, embeddingWidth, canEmbed, selectEmbeddingModel, getOllamaEmbedding, describeEmbeddingCandidates
- **operation-validator** — exports: processOperation, processOperationAsync, acquireLease, releaseLease
- **optimizer** — exports: proposalKey, loadOpenProposalKeys, dedupeProposals, createProposal, generateMemoryCleanupProposals, generateSkillImprovementProposals, generateWorkflowRepairProposals, generateModelRoutingProposals
- **package-auto-update** — exports: isPackageAutoUpdateEnabled, packageUpdateStatePath, loadUpdateState, saveUpdateState, resolveRegistryFiles, readRegistryEntries, rootsFromEnv, listUpdateRoots
- **pairing** — exports: buildPairingInfo
- **parallel-context** — exports: streamParallelContext, checkFlashHealth
- **pid-lock** — exports: entryPathHint, readProcessCommand, shouldHonorPidLock
- **post-mortem** — exports: readSessionTranscript, runPostMortem, runComplianceAudit
- **project-brain** — exports: resolveProjectBrainPaths, ensureOpenWiki, ensureCoreSkillPackage, writeBrainIdentity, ensureFullProjectBrain, registerProjectBrain, ensureAndRegisterProjectBrain, inspectProjectBrain
- **proposal-applier** — exports: findDissimilarPair, appendProposalAudit, listProposals, getProposal, setProposalStatus, revertProposal, hasHandler, applyProposal
- **protect-instructions** — exports: protectIDEInstructions
- **provider-account-sync** — exports: resolveProbeName, syncSecretAccount, syncAllSecretAccounts, getTrackingHealth
- **provider-catalog** — exports: getProvider, providerForKeyName, listProviders
- **provider-rotation-recipes** — exports: getRecipe, listVerifiedRecipes, valueLooksValid
- **quick-capture** — exports: isValidSource, captureMessage, listCaptureInbox
- **remote-vault-sync** — exports: importRemoteBundle, runSync
- **repo-sync** — exports: syncAllRepos, syncSingleRepo
- **research-queue** — exports: compileResearchProjectSummary, syncResearchProjectNode, loadQueue, saveQueue, listQueue, addToQueue, updateQueueItem, removeFromQueue
- **research** — exports: handleProactiveResearch, writeOrUpdateConsolidatedDraft, saveSynthesizedReportToDraft, handleQuickResearch
- **rotation-capability** — exports: selfGeneratedSpec, generateSecretValue, getRotationPlan, planAll, summarizePlans
- **runtime** — exports: findBinaryInPath, loadRuntimeConfig, checkRuntimeHealth, callLocalRuntime, callLocalRuntimeRaw, cleanAndParseJSON
- **sandbox** — exports: validateCommand, runInSandbox, executeWithEscalation
- **scheduler** — exports: loadPendingTasks, updateTaskStatus, persistTaskToDisk, generateIdleTask, createScheduler
- **schema**
- **search** — exports: semanticSearch
- **secret-integration-research** — exports: gatherCodeUsageContext, parseAiJson, inferSecretIntegrationWithAi, buildIntegrationResearchBrief, maybeEnqueueIntegrationResearch, cancelBogusApiIntegrationQueueItems
- **secrets-env-diff** — exports: isPlaceholderValue, classify, resolveEnvFiles, repoOfEnvFile, diffEnvAgainstStore, defaultBrainDir
- **secrets-env-export** — exports: mergeEnvManagedBlock, projectSlugFromPath, loadProjectRegistry, secretMatchesTarget, buildEnvProjection, exportEnvToProject, exportEnvToRegistry, buildDeploySecretsPayload
- **secrets-keychain** — exports: keychainAvailable, readKeychainPassword, writeKeychainPassword, describeKeychainCarrier
- **secrets-rekey** — exports: readMasterPasswordFromCarrierText, updateMasterPasswordCarrierText, readMasterPasswordFromCarrier, generateSecretsMasterPassword, rekeySecretsTransaction
- **secrets-remote-deploy** — exports: resolveRemoteTargetsPath, loadRemoteTargets, saveRemoteTargets, addRemoteTarget, removeRemoteTarget, deployEnvToRemote, deployKeyToRemotes
- **secrets-rotate** — exports: buildBrowserRotatePrompt, enqueueRotationDueTasks, rotateSecretAndExport, runSecretsRotationCheck, runSecretsExportAll, getBrowserRotateAssist, rotateViaBrowser, rotateAuto
- **secrets-store** — exports: resolveSecretsPath, resolveAuditPath, resolveUsagePath, isPlainJsonStore, loadSecretsSync, saveSecretsSync, loadSecrets, saveSecrets
- **secrets-sync** — exports: getSecretsChecksum, pullSecretsFromLeader, fetchLeaderChecksum, syncLoop
- **session-watcher** — exports: createSessionEntry, parseClaudeCode, parseCodex, parseGeminiCli, parseAntigravity, parseCursor, parseVSCode, contentFingerprint
- **skills-registry** — exports: resolveRegistryDir, resolveRegistryPath, emptyRegistry, loadRegistry, saveRegistry, hashSkillContent, readSkillMeta, registerSkill
- **snapshot** — exports: getSnapshotsDir, createSnapshot, listSnapshots, rollbackVault
- **source-adapters** — exports: loadResearchConfig, isDailyCapReached, getSearchUsageStats, braveSearch, serperSearch, tavilySearch, exaSearch, webSearch
- **source-watcher** — exports: startSourceWatcher
- **ssss-host-extension** — exports: listHostOnlyTypes, listTypesProvidedByPackage, listCoreTypes, listMissingCoreSchemas, buildTotalRecallHostExtension, getTotalRecallHostExtension
- **ssss-kernel-bridge** — exports: getKernelMode, inventorySummary, mapTrPrincipal, createTotalRecallRegistrySet, getTotalRecallEngine, isLowRiskEnvelope, isCoreRouteEnvelope, isProtocolPath
- **ssss-operation-service** — exports: writeVfsDocument, patchVfsDocument, deleteVfsDocument, appendVfsEvent, listVfsEvents
- **steering** — exports: checkLayer1, checkLayer2, detectConflicts, quarantineConflict, resolveConflict
- **surface** — exports: extractWikilinks, replaceFirstManagedInjectionBlock, heuristicCompact, buildRulesBlock, compileSurface, routeNodesToSkills, injectSkills, compileTier1
- **tailscale-cli** — exports: resolveTailscaleBinary, hasTailscaleDaemon
- **task-envelope** — exports: normalizePriority, buildTaskEnvelope, normalizeTask, persistEnvelope, addTask, listTasks, getTask, cancelTask
- **task-executors** — exports: resolveExecutor, dispatchTask, listExecutorIds
- **throttled-fetch** — exports: loadFirewallPolicy, blockDomain, unblockDomain, getAuditLog, throttledFetch, safeFetch, getGateStats, resetGateStats
- **total-recall-memory-validator** — exports: validateMemoryNode
- **tts** — exports: loadVoiceConfig, synthesize, isTtsEnabled
- **usage-fetcher** — exports: fetchAllProviderUsage, usageCachePath, readCachedUsage, refreshProviderUsage
- **usage-tracker** — exports: calculateCurrentCost, syncUsageLedger, loadBudgetConfig, checkBudgetSafety
- **validated-write** — exports: prepareNodeForContract, writeNodeValidated, writeNodeValidatedAsync, validateNode, resolveVaultDir, updateNodeInPlace
- **vault-backfill** — exports: walkVaultNodes, normalizeLegacyShapes, diffNode, analyzeVault, backfillVault
- **vault-cache** — exports: getNodes, invalidate, start
- **vault-watcher** — exports: startVaultWatcher
- **vault** — exports: isSafeVaultName, atomicWrite, safeStringify, walkMd, loadNodes, loadMergedNodes, writeNode, deleteNode
- **vector-field** — exports: compileField, sampleField, loadField, recomputeVelocities, fieldStats
- **vector-store**
- **vfs-documents** — exports: defaultVaultRoot, listVfsDocuments, listVfsDocumentsUnder, findVfsDocument, findVfsDocumentByType, findVfsDocumentByPath
- **watchdog** — exports: attachLogMonitor, detachLogMonitor, attachLogTail, detachLogTail
- **webauthn-store** — exports: resolveWebAuthnPath, listPasskeys, hasPasskeys, resolveRpFromRequest, beginRegistration, finishRegistration, beginAuthentication, finishAuthentication
- **webhook-handlers** — exports: handleWebhook

## Agent Skills

- **code-mode**: "Use this skill when working on the Code Mode Infrastructure, sandbox VFS, or instruction-led architecture. MANDATORY: You MUST read the full SKILL.md file before executing."
- **code-quality**: "Use this skill before committing, publishing, or deploying Total Recall, and whenever fixing errors from a quality gate. This repo is plain Node ESM — it has NO TypeScript and NO ESLint installed, so do NOT run tsc, eslint, npm run typecheck, or npm run lint (they do not exist here). Its gates are dist freshness, the open-source path invariant, SSSS registry verification, and vitest. Run checks as BACKGROUND jobs via scripts/check.mjs. MANDATORY: You MUST read the full SKILL.md file before executing."
- **instruction-keeper**: Use this skill when managing the lifecycle and version control of system
- **okf**: Use this skill to access information about Google's Open Knowledge Format
- **project-management**: "Use this skill when managing project documentation, GitHub issues, pull requests, and project tracker checklists in ANY repository. Defines the universal 4-file (PRD/ARCHITECTURE/DEVELOPMENT_PLAN/PROJECT_TRACKER) Kanban documentation system shared across all repos. Do NOT use for code implementation. MANDATORY: You MUST read the full SKILL.md file before executing."
- **push**: "Use this skill when preparing, testing, version-bumping, and publishing a new release of the Total Recall package to npm and GitHub. Do NOT use for regular local feature commits."
- **repo-expert**: Use this skill when you need to understand codebase architecture, file
- **research**: Use this skill when queueing, searching, and managing long-horizon background
- **security**: Use this skill when auditing Total Recall for security issues, handling
- **skill**: Use this skill when managing the Total Recall Skill Ecosystem — creating,
- **ssss**: "Inspect, validate, implement, or change SSSS primitives, extension registries, operation envelopes, workflow runtimes, semantic search, translation/localization overlays, bundles, projections, and host adapters. Use for SSSS schema changes, registry collisions, conformance failures, portability/privacy questions, or translatable semantic vault work. MANDATORY: Read this file before editing SSSS files or code."
- **test**: Use this skill when running the Total Recall test suite — unit tests,
- **total-recall**: Use this skill to operate Total Recall — portable memory, instructions,
- **total-recall-project-management**: Total Recall-specific project management overlay. Use alongside the global

## Config Files

- **package.json scripts**: dev, start, test, routes:manifest, clean, check:dist, prepublishOnly, check:ssss-registry
- vitest.config.ts
- .env.example
- AGENTS.md
- CLAUDE.md
- GEMINI.md
- INSTRUCTIONS.md
