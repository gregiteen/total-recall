---
name: repo-expert
description: >-
  Use this skill when you need to understand codebase architecture, file
  structure, and runtime topology. MANDATORY: You MUST read the full SKILL.md
  file before executing.
repo_scoped: true
repository_id: "total-recall-brain"
generated_at: 2026-10-25T07:37:59.219Z
generated_from: total-recall
---

# total-recall-brain — Codebase Architecture

> The Vibe Coding Brain & Autonomous Software Factory: memory, rules, secrets, and 33 visual plugins automatically managed across all your devices.

> **Auto-generated** by `npx total-recall skill generate-expert`. Regenerate anytime to stay current.

## Stack

- **Languages**: JavaScript (749 files), Markdown (235 files), TypeScript (130 files), CSS (12 files)
- **Frameworks**: React, Express
- **Tests**: Vitest
- **Module system**: module
- **Package manager**: npm

## Directory Structure

```
bin/  (5 items)
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
    archived/  (10 items)
    completed/  (48 items)
    in-progress/  (1 items)
  reference/  (7 items)
  security/  (2 items)
  setup/  (1 items)
extension/
  icons/  (5 items)
  lib/  (4 items)
  options/  (3 items)
  sidepanel/  (3 items)
fixtures/
  invalid/  (5 items)
  valid/  (8 items)
frontend/
  public/
    brand/  (5 items)
  src/
    api/  (28 items)
    assets/  (3 items)
    components/  (33 items)
    pages/  (54 items)
    utils/  (1 items)
infra/
  headscale/  (3 items)
knowledge-catalog/  (0 items)
models/
  catalog/
    total-recall/  (1 items)
openwiki/  (8 items)
scaffold/  (0 items)
scratch/  (2 items)
scripts/  (23 items)
src/
  cli/
    app/  (2 items)
    ingest/  (4 items)
    plugin/  (20 items)
  core/
    app-deploy/  (23 items)
    plugin-contracts/  (6 items)
    testing/  (1 items)
  server/
    routes/  (93 items)
templates/
  claude-hooks/  (1 items)
  default-config/  (4 items)
  memory/  (1 items)
  obsidian-queries/  (4 items)
```

## Entry Points

- **total-recall**: `bin/total-recall.mjs` (bin)
- **vibebrain**: `bin/total-recall.mjs` (bin)
- **antigravity**: `bin/antigravity.mjs` (bin)
- **total-recall-memory**: `bin/total-recall-memory.mjs` (bin)

## CLI Commands

68 commands in `src/cli/`:

| Command | File | Description |
|---------|------|-------------|
| agent-dir | agent-dir.mjs | Shared `.agent/` directory resolver for CLI commands. |
| agent | agent.mjs | Parse `agent spawn` arguments. Option values are consumed wi |
| api | api.mjs | total-recall api — every HTTP API route as a CLI verb. |
| backfill | backfill.mjs |  |
| backup | backup.mjs | total-recall backup |
| brain | brain.mjs |  |
| brief | brief.mjs | total-recall brief |
| chat | chat.mjs | Total Recall CLI Chat Interface |
| collab | collab.mjs | total-recall collab |
| command | command.mjs | Generate `total-recall <name> config|<collection>|detect|ini |
| config | config.mjs |  |
| connect | connect.mjs |  |
| context-stats | context-stats.mjs | total-recall context-stats — read the capsule measurement le |
| context | context.mjs |  |
| daemon | daemon.mjs | total-recall daemon |
| deploy-ui | deploy-ui.mjs | deploy-ui.mjs |
| deploy | deploy.mjs | total-recall deploy |
| doctor | doctor.mjs | total-recall doctor |
| dream | dream.mjs | total-recall dream |
| edit | edit.mjs | Parse edit arguments into { slug, body, changes, noCompile } |
| export | export.mjs |  |
| forget | forget.mjs |  |
| friction | friction.mjs | CLI command to run Friction Detection on logs |
| generate-pat | generate-pat.mjs |  |
| group | group.mjs | total-recall group |
| harness | harness.mjs |  |
| hash-password | hash-password.mjs |  |
| help | help.mjs | total-recall help |
| import-rules | import-rules.mjs | src/cli/import-rules.mjs |
| ingest-okf | ingest-okf.mjs |  |
| ingest | ingest.mjs | total-recall ingest |
| init | init.mjs | total-recall init |
| integration-dispatcher | integration-dispatcher.mjs | Dynamic SSSS-driven Integration Dispatcher. |
| key | key.mjs |  |
| lint | lint.mjs | total-recall lint |
| map | map.mjs |  |
| memory-entry | memory-entry.mjs |  |
| memory-init | memory-init.mjs |  |
| memory-plugin | memory-plugin.mjs |  |
| mesh | mesh.mjs |  |
| ... | +28 more | |

## API Routes

47 route modules in `src/server/routes/`:

### auth (0 endpoints)


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

### extension (5 endpoints)

- `GET /api/extension/download`
- `GET x-forwarded-proto`
- `GET x-forwarded-host`
- `GET host`
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

### headscale (0 endpoints)


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

### invoke (9 endpoints)

- `GET /v1/invoke/capabilities`
- `POST /v1/invoke`

### keys (0 endpoints)


### memory (10 endpoints)

- `GET /api/memory`
- `GET /api/memory/stats`
- `GET /api/memory/:slug`
- `POST /api/memory`
- `PUT /api/memory/:slug`
- `PATCH /api/memory/:slug`
- `DELETE /api/memory/:slug`
- `POST /api/memory/search/semantic`

### mesh-presence (0 endpoints)


### mesh (0 endpoints)


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

### plugins-mesh (0 endpoints)


### plugins (23 endpoints)

- `GET /api/plugins/execution-targets`
- `PUT /api/plugins/:id/activation`
- `POST /api/plugins/:id/credentials`
- `GET /api/plugins/:id/configuration`
- `PUT /api/plugins/:id/configuration`
- `GET /api/plugins/:id/ui/:element`
- `GET /api/plugins/:id/logo`
- `GET /api/plugins`
- `GET /api/plugins/available`
- `GET /api/plugins/peers`

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

### system (9 endpoints)

- `GET /api/logs/:type`
- `POST /api/diagnostics/agents`
- `GET /api/pairing`
- `GET /api/tasks/failed`
- `POST /api/tasks/:id/retry`
- `GET /api/usage`
- `GET /api/usage/providers`
- `POST /api/daemon/restart`
- `POST /api/server/restart`

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

### webauthn (0 endpoints)


### webhooks (7 endpoints)

- `GET /api/webhooks/configs`
- `POST /api/webhooks/configs`
- `DELETE /api/webhooks/configs/:provider`
- `GET /api/webhooks/events`
- `POST /api/webhooks/events/:id/redeliver`
- `POST /api/webhooks/test/:provider`
- `POST /api/webhooks/:provider`

## Frontend Pages

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
- PluginsPage
- RulesPage
- SandboxPage
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
- TailnetEnroll
- TaskQueueTab
- UsageChart
- VoiceInput
- brand/AnimatedBrandMark
- brand/BrandMark
- plugins/PluginPanel
- plugins/PluginSettings

## Core Modules

159 modules in `src/core/`:

- **action-predictor** — exports: buildActionQuestions, shortlistActions, predictNextAction
- **agent-manager** — exports: loadAgentState, saveAgentState, isProcessRunning, listAgents, buildRemoteSpawnCommand, spawnAgent, killAgent, getAgentLogs
- **api-routes** — exports: silenceInfoLogs, actionFor, loadApiRoutes
- **append-log** — exports: compactAppendLogs
- **auth-guard**
- **auto-compile** — exports: autoCompileSurfaces
- **automatic-brain-updates** — exports: automaticUpdateStatus, startAutomaticBrainUpdates, runAutomaticBrainUpdates
- **autopull-install** — exports: packageRoot, buildLaunchAgentPlist, buildCronLine, mergeCrontab, detectLaunchAgentPort, installAutoPull
- **blackboard** — exports: loadBlackboard, saveBlackboard, updateBlackboardState, clearBlackboard
- **bound-hosts** — exports: registerBoundHost, unregisterBoundHost, getBoundHosts, resetBoundHosts, isLoopbackHost, isReachableFromOtherDevices
- **brain-registry** — exports: globalBrainDirFor, readRegisteredProjects, readBrainToggles, isBrainEnabled, setBrainEnabled, listLocalBrains, findLocalBrain
- **brain-state** — exports: isBrainState, rsyncExcludes, findBrainState
- **brain-updates** — exports: installedBrainPackage, discoverBrainConsumers, brainInstallOwner, updateAllBrains
- **cache-prune** — exports: sessionIngestedGuard, agentHomeFor, isProtected, pruneCaches, formatBytes, maybePruneCaches
- **clarity-rewriter** — exports: runClarityReview, runStalenessCheck, runFactSeeker, runCutoffAudit, writeCorrection
- **claude-hooks** — exports: installClaudeCodeHooks
- **cli-commands**
- **cli-maintenance** — exports: cliInputFingerprint, maintainCliSurfaces, startCliSurfaceMaintenance
- **cli-quick-reference**
- **cli-semantic-index** — exports: hashVerb, harvestAllCliVerbs, loadCliSemanticIndex, buildCliSemanticIndex, queryCliSemanticIndex
- **command-surface** — exports: commandScopeDirectories, describeCommandFile, run, listSurfaceCommands, buildCommandsSection, surfaceInputsHash
- **composed-command-resolution** — exports: composedCommandDirectories, resolveComposedCommand
- **conclusion-writer** — exports: validateDraftNode, runConclusionWriter
- **config** — exports: surfaceDir, instructionsFilePath, detectProjectBrain, getActiveBrains, resolveBrainLayer
- **confined-memory** — exports: validateConfinedFact, createConfinedFact
- **conflict-detector** — exports: detectSemanticConflicts, scanVaultForConflicts, detectPatchConflict, computeFileHash, autoResolveConflict, applyAutoResolution, detectAndResolve, writeConflicts
- **context-cache** — exports: loadSectionCache, saveSectionCache, computeSectionHash, getCachedSection, manageContextBudget
- **context-compiler** — exports: compileContext, renderCapsule, capsuleResponse, previewContext
- **context-policy** — exports: curatedRules, ruleAppliesToRepo, selectRules, assembleContext
- **context-telemetry** — exports: ledgerPath, recordCapsule, readLedger, summariseLedger
- **crons** — exports: runCrons
- **daemon-control** — exports: readPid, getDaemonObservation, getDaemonStatus, startDaemon, stopDaemon, ensureDaemonRunning
- **daemon-loop** — exports: writeInterrupt, acquirePidLock, reassertPidLock, releasePidLock
- **default-plugins**
- **device-io**
- **dream** — exports: pruneResolvedProposals, autoPruneStorage, scanModifiedVault, loadCandidatesFromInbox, loadCandidatesFromSessions, collectRemCandidates, evaluateCandidates, runDreamCycle
- **drift-detector** — exports: detectIndexDrift, checkEventLogIntegrity
- **embeddings** — exports: getEmbedding, getEmbeddingWithProvenance, cosineSimilarity, loadEmbeddingsIndex, saveEmbeddingToIndex, removeEmbeddingFromIndex, nodeToEmbedText, chunkNodeBody
- **emergency-alerts** — exports: writeEmergencyAlert, clearEmergencyAlerts, readEmergencyAlerts, runStartupHealthCheck
- **evolution** — exports: runSsssEvalWorkflow, proposeSchemaUpgrades, applySchemaUpgrade
- **evolving-context** — exports: compileEvolvingContext
- **fact-seeker** — exports: getLocalizedDateTime, formatBeautifulDate, loadAgenda, addToAgenda, cancelBogusAgendaTopics, reclassifyCancelledAgendaTopics, markTopicResearched, getNextAgendaTopic
- **fast-recall** — exports: buildLocalSearchIndex, fastSearch
- **friction** — exports: detectFriction
- **frontmatter**
- **github-sync** — exports: initGitHubSync, runGitHubSync, getGitHubSyncStatus
- **global-brain-updates** — exports: updateGlobalBrainPackages
- **headscale-client**
- **host-type-catalog**
- **import-rules** — exports: detectRuleFiles, importRuleFiles, detectAndImport
- **inference-engine** — exports: runInferenceTask, runSynthesisTask
- **lan-discovery**
- **leader-election**
- **logger** — exports: enforceLogSize, pruneOldLogs
- **memory-brain** — exports: writeBrainIdentity, registerProjectBrain
- **memory-layers** — exports: normalizeMemoryLayer, inferMemoryLayer, memoryLayerRoutingWeight, buildMemoryLayerIndex
- **memory-schema**
- **memory-title** — exports: stripSelfCapturedTitlePrefix, isSelfCapturedEchoTitle, defaultTitleFromBody, normalizeMemoryTitle
- **mesh-access-sync**
- **mesh-access**
- **mesh-activity**
- **mesh-auth**
- **mesh-brain-updates** — exports: updateMeshBrainPackages
- **mesh-discover**
- **mesh-enroll**
- **mesh-late-bind**
- **mesh**
- **meta-harness** — exports: normalizeToolSelection, buildHarnessArgs, shellQuote, resolveHarnessEnv, detectHarnesses, detectHarnessesWithAuth, dispatchTask, runCouncil
- **migrate** — exports: runMigration, testMigration
- **network-bind** — exports: resolveServerHost
- **network-interfaces**
- **notifications** — exports: sendSystemNotification, listNotificationRules, createNotificationRule, deleteNotificationRule, recordNotificationDelivery, listNotificationHistory, sendTestNotification
- **obsidian-sync** — exports: syncObsidianToVault, watchObsidianDirectory
- **ollama-embeddings** — exports: normalizeBaseUrl, listOllamaModels, resolveOllamaEndpoint, embeddingWidth, canEmbed, selectEmbeddingModel, getOllamaEmbedding, describeEmbeddingCandidates
- **operation-validator** — exports: processOperation, processOperationAsync, acquireLease, releaseLease
- **optimizer** — exports: proposalKey, loadOpenProposalKeys, dedupeProposals, createProposal, generateMemoryCleanupProposals, generateSkillImprovementProposals, generateWorkflowRepairProposals, generateModelRoutingProposals
- **package-auto-update** — exports: isPackageAutoUpdateEnabled, packageUpdateStatePath, loadUpdateState, saveUpdateState, resolveRegistryFiles, readRegistryEntries, rootsFromEnv, listUpdateRoots
- **package-version** — exports: comparePackageVersions, packageVersionStatus
- **pairing** — exports: buildPairingInfo
- **parallel-context** — exports: streamParallelContext, checkFlashHealth
- **pid-lock** — exports: entryPathHint, readProcessCommand, shouldHonorPidLock
- **plugin-activation** — exports: setPluginActive
- **plugin-bundle** — exports: listPluginFiles, pluginBundleFiles, hashPluginDir, packPlugin, decodeBundle, writeEntriesAtomic, copyPluginAtomic
- **plugin-catalog** — exports: buildPluginCatalog, refreshPluginCatalog
- **plugin-context** — exports: assemblePluginContexts, startPluginDirectedWatcher
- **plugin-cron** — exports: parseCron, cronMatches
- **plugin-dependencies** — exports: preparePluginDependencies
- **plugin-distribution** — exports: installPlugin, setPluginShared, setPluginBranding, setPluginLocked, deployPluginToStore, listSharedPlugins, packSharedPlugin, packPublicPlugin
- **plugin-document-store** — exports: resolvePluginAssetPath, executePluginDocument, pluginDocumentOperation
- **plugin-loader** — exports: projectPluginsDir, globalPluginsDir, bundledPluginsDir, vaultForPluginsDir, resolveProjectRoot, isCronExpression, isSafeRelativePath, resolvePluginFile
- **plugin-peers**
- **plugin-public** — exports: parsePublicPluginSource, publicPluginShareUrl, fetchPublicBundle
- **plugin-runner-child**
- **plugin-runner** — exports: validatePluginSecretInput, runPluginCommand
- **plugin-runtime** — exports: loadPluginModule, loadPluginRouters, unavailablePluginOperation
- **plugin-setup** — exports: setupInstalledPlugins
- **plugin-state-store** — exports: executePluginState, listPluginStates
- **plugin-state** — exports: projectActivationOverride, pluginActivation, pluginExecutionEnabled, readActivationRecord
- **plugin-store** — exports: recordPath, recordPluginsDir, vaultFor, readPluginRecord, readProjectActivationRecord, emit, buildPluginDocumentBody, ensurePluginRecord
- **plugin-tasks** — exports: taskRunsOnNode, minuteSlot, latestDueSlot, runDuePluginTasks, startPluginTaskScheduler, stopPluginTaskScheduler
- **plugin-updates** — exports: remoteGitHead, checkPlugin, updateInstalledPlugins
- **plugin-vendor** — exports: readBricks, listBricks, satisfiesRange, vendorPlugin
- **post-mortem** — exports: readSessionTranscript, deriveSessionProject, runPostMortem, runComplianceAudit
- **project-brain** — exports: resolveProjectBrainPaths, ensureCoreSkillPackage, ensureFullProjectBrain, ensureAndRegisterProjectBrain, inspectProjectBrain
- **project-id** — exports: readProjectId, ensureProjectId, repairProjectIds
- **project-status** — exports: outstandingProjectStatus, formatOutstandingProjectStatus
- **proposal-applier** — exports: findDissimilarPair, appendProposalAudit, listProposals, getProposal, setProposalStatus, revertProposal, hasHandler, applyProposal
- **protect-instructions** — exports: protectIDEInstructions
- **quick-capture** — exports: isValidSource, captureMessage, listCaptureInbox
- **registration-watch**
- **remote-vault-sync** — exports: importRemoteBundle, runSync
- **repo-sync** — exports: isGeneratedSurface, syncAllRepos, syncSingleRepo
- **required-plugins** — exports: inspectRequiredPlugins, ensureRequiredPlugins, auditProjectPluginCopies
- **research-gate** — exports: resolveAutonomousConfig, loadAutonomousConfig, requestResearch, defaultCoverageCheck, proposeAutonomousResearch
- **research-queue** — exports: compileResearchProjectSummary, syncResearchProjectNode, loadQueue, saveQueue, listQueue, normalizeTopic, addToQueue, updateQueueItem
- **research-surface** — exports: extractSynthesis, isUsableSynthesis, extractFindings, selectResearchBriefs, formatResearchBriefs, findRelevantResearch, formatChatResearch
- **research** — exports: handleProactiveResearch, writeOrUpdateConsolidatedDraft, saveSynthesizedReportToDraft, promoteDraftToVault, handleQuickResearch
- **runtime** — exports: findBinaryInPath, loadRuntimeConfig, checkRuntimeHealth, loadDynamicSecrets, callLocalRuntime, callLocalRuntimeRaw, cleanAndParseJSON
- **sandbox** — exports: validateCommand, runInSandbox, executeWithEscalation
- **scaffold-plugins** — exports: isReleaseFile, releaseFiles, syncScaffoldPlugins
- **scheduler** — exports: loadPendingTasks, updateTaskStatus, persistTaskToDisk, generateIdleTask, createScheduler
- **schema**
- **search** — exports: semanticSearch
- **secure-file** — exports: chmodSecure, writeFileSecure, appendFileSecure
- **server-restart** — exports: detectSupervisor, requestSelfRestart, packageVersionOnDisk
- **session-watcher** — exports: createSessionEntry, parseClaudeCode, parseCodex, parseGeminiCli, parseAntigravity, parseCursor, parseVSCode, contentFingerprint
- **skill-config** — exports: useCoreDir, coreDirOf, resolveSkillDir, loadConfigSchema, validateSkillConfig, configPath, recordPath, projectVaultFor
- **skill-optimizer** — exports: splitSkill, planSkillOptimization, optimizeSkill, skillMetadata, auditSkillOwnership, skillDirectories, optimizeSkills
- **skills-registry** — exports: resolveRegistryDir, resolveRegistryPath, emptyRegistry, loadRegistry, saveRegistry, skillPackageFiles, hashSkillContent, hashSkillLayer
- **snapshot** — exports: getSnapshotsDir, createSnapshot, listSnapshots, rollbackVault
- **source-adapters** — exports: loadResearchConfig, isDailyCapReached, getSearchUsageStats, braveSearch, serperSearch, tavilySearch, exaSearch, webSearch
- **source-brain-updates** — exports: updateSourceBrainPackages, updateSourceBrainPackage
- **source-watcher** — exports: startSourceWatcher
- **ssss-host-extension** — exports: listHostOnlyTypes, listTypesProvidedByPackage, listCoreTypes, listMissingCoreSchemas, buildTotalRecallHostExtension, getTotalRecallHostExtension
- **ssss-kernel-bridge** — exports: getKernelMode, inventorySummary, mapTrPrincipal, createTotalRecallRegistrySet, getTotalRecallEngine, isLowRiskEnvelope, isCoreRouteEnvelope, isProtocolPath
- **ssss-operation-service** — exports: writeVfsDocument, patchVfsDocument, deleteVfsDocument, appendVfsEvent, listVfsEvents
- **startup-health** — exports: runBounded, verifyListener, readProcessCwd, processIdentity, observeDaemon, healthVerdict, appVerdict, fetchStartup
- **steering** — exports: checkLayer1, checkLayer2, detectConflicts, quarantineConflict, resolveConflict
- **surface** — exports: isSurfaceCodeStale, commandDirsFor, extractWikilinks, replaceFirstManagedInjectionBlock, heuristicCompact, readRuleBudgets, readContextBudget, legacyRuleContributions
- **tailscale-cli**
- **task-envelope** — exports: normalizePriority, buildTaskEnvelope, normalizeTask, persistEnvelope, addTask, listTasks, getTask, cancelTask
- **task-executors** — exports: resolveExecutor, dispatchTask, listExecutorIds
- **throttled-fetch** — exports: loadFirewallPolicy, blockDomain, unblockDomain, getAuditLog, throttledFetch, safeFetch, getGateStats, resetGateStats
- **total-recall-memory-validator** — exports: validateMemoryNode
- **tts** — exports: loadVoiceConfig, synthesize, isTtsEnabled
- **usage-fetcher** — exports: fetchAllProviderUsage, usageCachePath, readCachedUsage, refreshProviderUsage
- **usage-tracker** — exports: calculateCurrentCost, syncUsageLedger, loadBudgetConfig, checkBudgetSafety
- **validated-write** — exports: prepareNodeForContract, writeNodeValidated, writeNodeValidatedAsync, validateNode, resolveVaultDir, updateNodeInPlace
- **vault-backfill** — exports: walkVaultNodes, normalizeLegacyShapes, diffNode, analyzeVault, backfillVault
- **vault-cache** — exports: isGeneratedVaultPath, getNodes, invalidate, start
- **vault-files** — exports: isSafeVaultName, atomicWrite
- **vault-watcher** — exports: snapshotSignatures, isSettledEvent, startVaultWatcher
- **vault** — exports: safeStringify, walkMd, loadNodes, loadMergedNodes, writeNode, deleteNode, createMemoryNode, loadSkills
- **vector-field** — exports: compileField, sampleField, loadField, recomputeVelocities, fieldStats
- **vector-store**
- **vfs-documents** — exports: defaultVaultRoot, listVfsDocuments, listVfsDocumentsUnder, findVfsDocument, findVfsDocumentByType, findVfsDocumentByPath
- **watchdog** — exports: attachLogMonitor, detachLogMonitor, attachLogTail, detachLogTail
- **webauthn-store**
- **webhook-handlers** — exports: handleWebhook

## Agent Skills

- **cli-agents**: Discover and coordinate authenticated terminal coding agents when
- **code-mode**: Inspect or change Code Mode sandbox, VFS and instruction-led execution.
- **code-quality**
- **meta-harness**: Inspect harnesses, agent processes and mesh execution when authorized.
- **okf**: Check OKF compatibility when designing SSSS schemas.
- **plugin**: Author, review or fix a Total Recall plugin (tr-plugin-*). A recipe of exact specifications an agent executes, so the plugin declares the surfaces its function needs, serves agents through its CLI, scaffolds its capability into other applications, and renders a bespoke card face.
- **project-management**: Manage five-file project docs, trackers, GitHub issues and reviews.
- **push**: Prepare and publish a Total Recall npm/GitHub release when authorized.
- **repo-expert**: Read for repository architecture and ownership; load only relevant reference sections.
- **research**: Manage background research queues, status and retrieval through Total Recall.
- **security**: Audit Total Recall secrets, API auth, rotation and outbound trust boundaries.
- **skill**: Manage Total Recall skill registry, deployment and scoped propagation.
- **ssss**: Validate or change SSSS schemas, operations, registries and
- **start**: "Start a session: verify shared runtime, summarize the repo, follow
- **test**: Run Total Recall unit, CLI, API and frontend tests.
- **total-recall**: Operate Total Recall memory, instructions, plugin discovery and runtime; route auth/secrets, OpenWiki, CRM and mesh work to their owning plugins.
- **total-recall-project-management**: Apply verified Total Recall planning and readiness differences.

## Config Files

- **package.json scripts**: dev, start, test, routes:manifest, sync:scaffold-plugins, clean, check:dist, prepublishOnly, check:ssss-registry, check:package, start:memory
- vitest.config.ts
- .env.example
- AGENTS.md
- CLAUDE.md
- GEMINI.md
- INSTRUCTIONS.md
