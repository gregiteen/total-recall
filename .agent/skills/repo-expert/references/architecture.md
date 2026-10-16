---
name: repo-expert
description: >-
  Use this skill when you need to understand codebase architecture, file
  structure, and runtime topology. MANDATORY: You MUST read the full SKILL.md
  file before executing.
repo_scoped: true
repository_id: "total-recall-brain"
generated_at: 2026-10-07T04:47:05.714Z
generated_from: total-recall
---

# total-recall-brain — Codebase Architecture

> Personal AI system — database-free, SSSS-powered intelligence engine deployable to any POSIX host.

> **Auto-generated** by `npx total-recall skill generate-expert`. Regenerate anytime to stay current.

## Stack

- **Languages**: JavaScript (714 files), Markdown (349 files), TypeScript (132 files), Python (29 files), CSS (13 files)
- **Frameworks**: React, Express
- **Tests**: Vitest
- **Module system**: module
- **Package manager**: npm

## Directory Structure

```
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
    completed/  (49 items)
    in-progress/  (13 items)
    planned/  (1 items)
  reference/  (6 items)
  security/  (2 items)
  setup/  (1 items)
extension/
  icons/  (5 items)
  lib/  (4 items)
  options/  (3 items)
  sidepanel/  (3 items)
fixtures/
  bundled-plugins/
    creative-search/  (2 items)
    git-sentinel/  (2 items)
    system-monitor/  (2 items)
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
    brand/  (5 items)
  src/
    api/  (30 items)
    assets/  (3 items)
    components/  (33 items)
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
  openwiki/  (6 items)
scratch/
  dummy-repo/  (1 items)
scripts/  (16 items)
src/
  cli/
    app/  (2 items)
    ingest/  (4 items)
    plugin/  (15 items)
  core/
    app-deploy/  (23 items)
  server/
    routes/  (96 items)
templates/
  claude-hooks/  (1 items)
  default-config/  (4 items)
  obsidian-queries/  (4 items)
  openwiki/  (6 items)
```

## Entry Points

- **total-recall**: `bin/total-recall.mjs` (bin)
- **antigravity**: `bin/antigravity.mjs` (bin)

## CLI Commands

65 commands in `src/cli/`:

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
| ingest-openwiki | ingest-openwiki.mjs | Discover and ingest OpenWiki hubs declared by installed plug |
| ingest | ingest.mjs | total-recall ingest |
| init | init.mjs | total-recall init |
| integration-dispatcher | integration-dispatcher.mjs | Dynamic SSSS-driven Integration Dispatcher. |
| key | key.mjs |  |
| lint | lint.mjs | total-recall lint |
| map | map.mjs |  |
| mesh | mesh.mjs | total-recall mesh — control-server (headscale) mesh administ |
| migrate | migrate.mjs |  |
| project-id | project-id.mjs | total-recall project-id [--json] | --all |
| proposals | proposals.mjs |  |
| ... | +25 more | |

## API Routes

47 route modules in `src/server/routes/`:

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

### mesh-presence (4 endpoints)

- `GET /api/mesh/presence`
- `GET /api/mesh/presence/local`
- `POST /api/mesh/presence/resolve`
- `POST /api/mesh/dispatch`

### mesh (20 endpoints)

- `GET /api/mesh/leader`
- `GET /api/mesh/nodes`
- `POST /api/mesh/access`
- `GET /api/mesh/access/proposals`
- `POST /api/mesh/access/import`
- `GET /api/mesh/enrollment`
- `POST /api/mesh/enroll`
- `POST /api/mesh/preauthkey`
- `POST /api/mesh/register-node`
- `POST /api/mesh/watch`

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

### plugins-mesh (4 endpoints)

- `GET /api/mesh/plugins/installed`
- `GET /api/mesh/plugins`
- `GET /api/mesh/plugins/:id/bundle`
- `GET /api/public/plugins/:id/bundle`

### plugins (17 endpoints)

- `GET /api/plugins/:id/ui/:element`
- `GET /api/plugins`
- `GET /api/plugins/available`
- `GET /api/plugins/peers`
- `POST /api/plugins/install`
- `POST /api/plugins/:id/share`
- `POST /api/plugins/:id/branding`
- `POST /api/plugins/:id/lock`
- `POST /api/plugins/:id/deploy-store`
- `DELETE /api/plugins/:id`

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
- PluginsPage
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
- TailnetEnroll
- TaskQueueTab
- UsageChart
- VoiceInput
- brand/AnimatedBrandMark
- brand/BrandMark

## Core Modules

139 modules in `src/core/`:

- **agent-manager** — exports: loadAgentState, saveAgentState, isProcessRunning, listAgents, buildRemoteSpawnCommand, spawnAgent, killAgent, getAgentLogs
- **api-routes** — exports: silenceInfoLogs, actionFor, loadApiRoutes
- **append-log** — exports: compactAppendLogs
- **autopull-install** — exports: packageRoot, buildLaunchAgentPlist, buildCronLine, mergeCrontab, detectLaunchAgentPort, installAutoPull
- **blackboard** — exports: loadBlackboard, saveBlackboard, updateBlackboardState, clearBlackboard
- **bound-hosts** — exports: registerBoundHost, unregisterBoundHost, getBoundHosts, resetBoundHosts, isLoopbackHost, isReachableFromOtherDevices
- **brain-registry** — exports: globalBrainDirFor, readBrainToggles, isBrainEnabled, setBrainEnabled, listLocalBrains, findLocalBrain
- **brain-state** — exports: isBrainState, rsyncExcludes, findBrainState
- **browser-session** — exports: getChromium, resolveProfileDir, ensureProfileDir, launchRotationContext, openConsole, isAuthenticated, looksLikeLoginUrl, waitForLogin
- **cache-prune** — exports: sessionIngestedGuard, agentHomeFor, isProtected, pruneCaches, formatBytes, maybePruneCaches
- **clarity-rewriter** — exports: runClarityReview, runStalenessCheck, runFactSeeker, runCutoffAudit, writeCorrection
- **claude-hooks** — exports: installClaudeCodeHooks
- **command-surface** — exports: describeCommandFile, run, listSurfaceCommands, buildCommandsSection, surfaceInputsHash
- **conclusion-writer** — exports: validateDraftNode, runConclusionWriter
- **config** — exports: getEnvVar, detectProjectBrain, getActiveBrains, resolveBrainLayer
- **conflict-detector** — exports: detectSemanticConflicts, scanVaultForConflicts, detectPatchConflict, computeFileHash, autoResolveConflict, applyAutoResolution, detectAndResolve, writeConflicts
- **context-cache** — exports: loadSectionCache, saveSectionCache, computeSectionHash, getCachedSection, manageContextBudget
- **context-compiler** — exports: compileContext, renderCapsule, capsuleResponse, previewContext
- **context-policy** — exports: curatedRules, ruleAppliesToRepo, selectRules, assembleContext
- **crons** — exports: runCrons
- **crypto** — exports: clearDerivedKeyCache, deriveKey, deriveKeySync, encryptSecrets, encryptSecretsSync, decryptSecrets, decryptSecretsSync, generateSignatureKeyPair
- **daemon-control** — exports: readPid, getDaemonStatus, startDaemon, stopDaemon, ensureDaemonRunning
- **daemon-loop** — exports: writeInterrupt, acquirePidLock, reassertPidLock, releasePidLock
- **device-io** — exports: buildIoProfileFromSignals, uiHintsFromIo, detectDeviceIo, mergeIoProfiles
- **dream** — exports: pruneResolvedProposals, autoPruneStorage, scanModifiedVault, loadCandidatesFromInbox, loadCandidatesFromSessions, collectRemCandidates, evaluateCandidates, runDreamCycle
- **drift-detector** — exports: detectIndexDrift, checkEventLogIntegrity
- **embeddings** — exports: getEmbedding, cosineSimilarity, loadEmbeddingsIndex, saveEmbeddingToIndex, removeEmbeddingFromIndex, nodeToEmbedText, chunkNodeBody, buildEmbeddingsIndex
- **emergency-alerts** — exports: writeEmergencyAlert, clearEmergencyAlerts, readEmergencyAlerts, runStartupHealthCheck
- **env-import** — exports: inferProvider, maskSecret, parseEnvText, isCandidateKey, defaultEnvFilePaths, scanEnvSources, publicScanResult, importEnvSecrets
- **evolution** — exports: runSsssEvalWorkflow, proposeSchemaUpgrades, applySchemaUpgrade
- **evolving-context** — exports: compileEvolvingContext
- **fact-seeker** — exports: getLocalizedDateTime, formatBeautifulDate, loadAgenda, addToAgenda, cancelBogusAgendaTopics, reclassifyCancelledAgendaTopics, markTopicResearched, getNextAgendaTopic
- **fast-recall** — exports: buildLocalSearchIndex, fastSearch
- **friction** — exports: detectFriction
- **github-sync** — exports: initGitHubSync, runGitHubSync, getGitHubSyncStatus
- **headscale-client** — exports: headscaleUrlFromEnv, assertSecureControlUrl, normalizeControlUrl, findHeadscaleKeyMeta, resolveHeadscaleConfig, describeHeadscaleAvailability, headscaleFetch, headscaleFetchWithLegacyFallback
- **import-rules** — exports: detectRuleFiles, importRuleFiles, detectAndImport
- **inference-engine** — exports: runInferenceTask, runSynthesisTask
- **lan-discovery** — exports: parseArpTable, discoverLanHosts, probeLanBrains, discoverLanSnapshot, lanHostnameFromIp, registerLanMeshNodes
- **leader-election** — exports: leaderPin, getLeaderInfo, isLeader, tryAcquireLease, renewLease, releaseLease
- **logger**
- **memory-layers** — exports: normalizeMemoryLayer, inferMemoryLayer, memoryLayerRoutingWeight, buildMemoryLayerIndex
- **memory-title** — exports: stripSelfCapturedTitlePrefix, isSelfCapturedEchoTitle, defaultTitleFromBody, normalizeMemoryTitle
- **mesh-access-sync** — exports: remoteNodeDocsCommand, parseRemoteNodeDocs, planAccessFromPeerDocs, syncAccessFromPeers
- **mesh-access** — exports: parseSshConfig, readSshConfig, sshConfigMatchScore, findSshConfigEntryForNode, accessFromSshConfigEntry, classifyTailscaleVariant, meshSshFromVariant, resolveNodeAccess
- **mesh-activity** — exports: getLocalIdleSeconds, detectActiveSurface, getLocalPresence, resolveActiveDevice
- **mesh-auth** — exports: normalizeRemoteAddress, isMeshOrLoopbackAddress, getMeshSyncToken, getMeshSyncAuthorization, requireMeshSyncAuth
- **mesh-discover** — exports: candidateUsers, localPrivateKeys, classifyProbeFailure, probeLogin, discoverNodeAccess
- **mesh-enroll** — exports: resetAutoEnrollThrottle, supportsTailscaleSsh, readTailscaleStatus, readTailscalePrefs, resolveLoginServer, getEnrollmentStatus, autoEnrollEnabled, buildUpArgs
- **mesh-late-bind** — exports: startMeshBindWatch
- **mesh** — exports: normalizeHostname, meshNodeDocSlug, meshNodeKey, clearMeshStatusCache, isMeshAvailable, getMeshSelf, getMeshIp, getMeshHostname
- **meta-harness** — exports: normalizeToolSelection, buildHarnessArgs, shellQuote, resolveHarnessEnv, detectHarnesses, dispatchTask, runCouncil
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
- **plugin-bundle** — exports: listPluginFiles, hashPluginDir, packPlugin, decodeBundle, writeEntriesAtomic, copyPluginAtomic
- **plugin-context** — exports: assemblePluginContexts, startPluginDirectedWatcher
- **plugin-loader** — exports: projectPluginsDir, globalPluginsDir, bundledPluginsDir, vaultForPluginsDir, resolveProjectRoot, isCronExpression, isSafeRelativePath, validatePluginManifest
- **plugin-peers** — exports: meshPeerUrl, listPeerPlugins, parsePeerSource, fetchPeerBundle
- **plugin-public** — exports: parsePublicPluginSource, publicPluginShareUrl, fetchPublicBundle
- **plugin-runner-child**
- **plugin-runner** — exports: runPluginCommand
- **plugin-store** — exports: recordPath, readPluginRecord, buildPluginDocumentBody, ensurePluginRecord, syncAllPluginRecords, patchPluginRecord, describePlugin, listInstalledPlugins
- **plugin-tasks** — exports: parseCron, cronMatches, taskRunsOnNode, minuteSlot, latestDueSlot, runDuePluginTasks, startPluginTaskScheduler, stopPluginTaskScheduler
- **post-mortem** — exports: readSessionTranscript, deriveSessionProject, runPostMortem, runComplianceAudit
- **project-brain** — exports: resolveProjectBrainPaths, ensureOpenWiki, ensureCoreSkillPackage, writeBrainIdentity, ensureFullProjectBrain, registerProjectBrain, ensureAndRegisterProjectBrain, inspectProjectBrain
- **project-id** — exports: readProjectId, ensureProjectId, repairProjectIds
- **proposal-applier** — exports: findDissimilarPair, appendProposalAudit, listProposals, getProposal, setProposalStatus, revertProposal, hasHandler, applyProposal
- **protect-instructions** — exports: protectIDEInstructions
- **provider-account-sync** — exports: resolveProbeName, syncSecretAccount, syncAllSecretAccounts, getTrackingHealth
- **provider-catalog** — exports: getProvider, providerForKeyName, listProviders
- **provider-rotation-recipes** — exports: getRecipe, listVerifiedRecipes, valueLooksValid
- **quick-capture** — exports: isValidSource, captureMessage, listCaptureInbox
- **registration-watch** — exports: resolveLogSource, latestAuthId, getWatchStatus, clearWatchResult, stopWatch, startWatch
- **remote-vault-sync** — exports: importRemoteBundle, runSync
- **repo-sync** — exports: syncAllRepos, syncSingleRepo
- **research-gate** — exports: resolveAutonomousConfig, loadAutonomousConfig, requestResearch, defaultCoverageCheck, proposeAutonomousResearch
- **research-queue** — exports: compileResearchProjectSummary, syncResearchProjectNode, loadQueue, saveQueue, listQueue, normalizeTopic, addToQueue, updateQueueItem
- **research-surface** — exports: extractSynthesis, isUsableSynthesis, extractFindings, selectResearchBriefs, formatResearchBriefs, findRelevantResearch, formatChatResearch
- **research** — exports: handleProactiveResearch, writeOrUpdateConsolidatedDraft, saveSynthesizedReportToDraft, promoteDraftToVault, handleQuickResearch
- **rotation-capability** — exports: selfGeneratedSpec, generateSecretValue, getRotationPlan, planAll, summarizePlans
- **runtime** — exports: findBinaryInPath, loadRuntimeConfig, checkRuntimeHealth, loadDynamicSecrets, callLocalRuntime, callLocalRuntimeRaw, cleanAndParseJSON
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
- **secrets-store** — exports: resolveSecretsPath, resolveAuditPath, resolveUsagePath, secretsPassword, readTrEnvFilePassword, isPlainJsonStore, loadSecretsSync, saveSecretsSync
- **secrets-sync** — exports: getSecretsChecksum, pullSecretsFromLeader, fetchLeaderChecksum, syncLoop
- **secure-file** — exports: chmodSecure, writeFileSecure, appendFileSecure
- **server-restart** — exports: detectSupervisor, requestSelfRestart, packageVersionOnDisk
- **session-watcher** — exports: createSessionEntry, parseClaudeCode, parseCodex, parseGeminiCli, parseAntigravity, parseCursor, parseVSCode, contentFingerprint
- **skill-config** — exports: resolveSkillDir, loadConfigSchema, validateSkillConfig, configPath, recordPath, projectVaultFor, readSkillConfigState, readSkillConfig
- **skill-optimizer** — exports: splitSkill, planSkillOptimization, optimizeSkill, skillMetadata, auditSkillOwnership, skillDirectories, optimizeSkills
- **skills-registry** — exports: resolveRegistryDir, resolveRegistryPath, emptyRegistry, loadRegistry, saveRegistry, skillPackageFiles, hashSkillContent, hashSkillLayer
- **snapshot** — exports: getSnapshotsDir, createSnapshot, listSnapshots, rollbackVault
- **source-adapters** — exports: loadResearchConfig, isDailyCapReached, getSearchUsageStats, braveSearch, serperSearch, tavilySearch, exaSearch, webSearch
- **source-watcher** — exports: startSourceWatcher
- **ssss-host-extension** — exports: listHostOnlyTypes, listTypesProvidedByPackage, listCoreTypes, listMissingCoreSchemas, buildTotalRecallHostExtension, getTotalRecallHostExtension
- **ssss-kernel-bridge** — exports: getKernelMode, inventorySummary, mapTrPrincipal, createTotalRecallRegistrySet, getTotalRecallEngine, isLowRiskEnvelope, isCoreRouteEnvelope, isProtocolPath
- **ssss-operation-service** — exports: writeVfsDocument, patchVfsDocument, deleteVfsDocument, appendVfsEvent, listVfsEvents
- **startup-health** — exports: runBounded, verifyListener, processIdentity, healthVerdict, appVerdict, fetchStartup, startupHealth
- **steering** — exports: checkLayer1, checkLayer2, detectConflicts, quarantineConflict, resolveConflict
- **surface** — exports: isSurfaceCodeStale, commandDirsFor, extractWikilinks, replaceFirstManagedInjectionBlock, heuristicCompact, buildResearchSection, readRuleBudgets, legacyRuleContributions
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
- **vault-watcher** — exports: snapshotSignatures, isSettledEvent, startVaultWatcher
- **vault** — exports: isSafeVaultName, atomicWrite, safeStringify, walkMd, loadNodes, loadMergedNodes, writeNode, deleteNode
- **vector-field** — exports: compileField, sampleField, loadField, recomputeVelocities, fieldStats
- **vector-store**
- **vfs-documents** — exports: defaultVaultRoot, listVfsDocuments, listVfsDocumentsUnder, findVfsDocument, findVfsDocumentByType, findVfsDocumentByPath
- **watchdog** — exports: attachLogMonitor, detachLogMonitor, attachLogTail, detachLogTail
- **webauthn-store** — exports: resolveWebAuthnPath, listPasskeys, hasPasskeys, resolveRpFromRequest, beginRegistration, finishRegistration, beginAuthentication, finishAuthentication
- **webhook-handlers** — exports: handleWebhook

## Agent Skills

- **cli-agents**: Discover and coordinate authenticated terminal coding agents when
- **code-mode**: Inspect or change Code Mode sandbox, VFS and instruction-led execution.
- **code-quality**: Run Total Recall's configured package, registry and remote test gates.
- **meta-harness**: Inspect harnesses, agent processes and mesh execution when authorized.
- **okf**: Check OKF compatibility when designing SSSS schemas.
- **plugins**: Standards, authoring guide, and CLI workflows for Total Recall plugins.
- **project-management**: Manage five-file project docs, trackers, GitHub issues and reviews.
- **push**: Prepare and publish a Total Recall npm/GitHub release when authorized.
- **repo-expert**: Read for repository architecture and ownership; load only relevant reference sections.
- **research**: Manage background research queues, status and retrieval through Total Recall.
- **security**: Audit Total Recall secrets, API auth, rotation and outbound trust boundaries.
- **skill**: Manage Total Recall skill registry, deployment and scoped propagation.
- **ssss**: Validate or change SSSS schemas, operations, registries and
- **start**: "Start a session: verify shared runtime, summarize the repo, follow
- **test**: Run Total Recall unit, CLI, API and frontend tests.
- **total-recall**: Portable memory and instruction CLI. Read this compact entrypoint; load operation references only for the current task.
- **total-recall-project-management**: Apply verified Total Recall planning and readiness differences.

## Config Files

- **package.json scripts**: dev, start, test, routes:manifest, clean, check:dist, prepublishOnly, check:ssss-registry
- vitest.config.ts
- .env.example
- AGENTS.md
- CLAUDE.md
- GEMINI.md
- INSTRUCTIONS.md
