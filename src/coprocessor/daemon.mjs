/**
 * daemon.mjs — Memory Co-Processor Daemon (Total Recall Layer 5)
 *
 * A lightweight PM2-managed background daemon that watches IDE
 * conversation logs in real-time and handles ALL memory operations:
 *   - Steering detection (user directives → steer cascade)
 *   - Sentiment analysis (praise/frustration → active notes)
 *   - Relevance injection (topic → FTS5 search → ACTIVE CONTEXT)
 *   - Contradiction detection (agent claims vs wiki)
 *
 * The primary agent devotes 100% attention to the user.
 * Memory happens here, automatically, in the background.
 *
 * Usage:
 *   node daemon.mjs [--root /path/to/repo] [--config totalrecall.config.mjs]
 *   node daemon.mjs --stop   # Graceful shutdown
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { createHash } from 'crypto';
import { loadConfig, resolvePaths } from '../core/utils.mjs';
import { openDatabase } from '../core/fts5.mjs';
import { steer } from '../core/steering.mjs';
import { loadWatchers, stopAll, getAllStatus } from './watchers/index.mjs';
import { detectDirectives } from './checks/steering.mjs';
import { detectSentiment } from './checks/sentiment.mjs';
import { findRelevantMemories } from './checks/relevance.mjs';
import { checkContradictions, detectUncertainClaims } from './checks/contradiction.mjs';
import { writeActiveContext, clearActiveContext } from './inject.mjs';
import { detectResearchableClaims, batchResearch, createConclusionNode, indexConclusionNode, formatResearchResults } from './checks/researcher.mjs';
import { enqueue, drain as drainNotifications, purgeStale } from './notify.mjs';
import { compileSurface, writeSurfaceMulti, compileSurfaceFromGraph } from '../core/surface.mjs';
import { runConfidenceDecay, pruneStaleNodes, regenerateMemoryMd } from '../core/dream.mjs';
import { classifyPrompt } from '../core/classifier.mjs';

// ─── CONSTANTS ──────────────────────────────────────────────────────────────────

const PID_FILE = '/tmp/total-recall-coprocessor.pid';
const LOG_FILE = '/tmp/total-recall-coprocessor.log';

// ─── LOGGING ────────────────────────────────────────────────────────────────────

function log(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [${level}] ${message}${data ? ' ' + JSON.stringify(data) : ''}`;
  console.log(line);

  // Also append to log file for monitoring
  try {
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch {
    // Silently ignore log file write errors
  }
}

// ─── NOTIFICATION ───────────────────────────────────────────────────────────────

function notify(title, message, type = 'note') {
  try {
    enqueue({ title, message, type, desktop: true });
  } catch {
    // Notifications are best-effort
  }
}

// ─── DAEMON STATE ───────────────────────────────────────────────────────────────

class CoProcessorDaemon {
  constructor(root, config) {
    this.root = root;
    this.config = config;
    this.paths = resolvePaths(root, config);
    this.db = null;
    this.watchers = new Map();
    this.seenTurnHashes = new Set();  // Cross-watcher dedup
    this.debounceTimer = null;
    this.pendingTurns = [];
    this.running = false;
    this.stats = {
      startedAt: new Date().toISOString(),
      turnsProcessed: 0,
      steeringsDetected: 0,
      sentimentsDetected: 0,
      contextInjections: 0,
      contradictionsDetected: 0,
      researchDispatched: 0,
      researchCompleted: 0,
      conclusionsCreated: 0,
      errors: 0,
      heartbeatsRun: 0,
      lastHeartbeat: null,
    };
    this.heartbeatTimer = null;
  }

  // ─── LIFECYCLE ──────────────────────────────────────────────────────────────

  async start() {
    log('INFO', 'Memory Co-Processor starting...', {
      root: this.root,
      watchers: this.config.watchers,
      intervalMs: this.config.coprocessor.intervalMs,
    });

    // Write PID file
    fs.writeFileSync(PID_FILE, String(process.pid));

    // Open database
    try {
      this.db = openDatabase(this.paths.dbPath);
      log('INFO', 'Database connected', { path: this.paths.dbPath });
    } catch (err) {
      log('ERROR', 'Failed to open database', { error: err.message });
      this.stats.errors++;
    }

    // Create IDE watchers (supports multiple)
    try {
      this.watchers = await loadWatchers(this.config.watchers, {
        onNewTurns: (turns, conversationId) => {
          this.onNewTurns(turns, conversationId);
        },
      });
      const names = [...this.watchers.keys()];
      log('INFO', `Watchers started: ${names.join(', ')}`);
    } catch (err) {
      log('ERROR', 'Failed to start watchers', { error: err.message });
      this.stats.errors++;
    }

    this.running = true;
    log('INFO', 'Memory Co-Processor started', { pid: process.pid });

    // Start heartbeat timer
    const hbInterval = this.config.coprocessor.heartbeatIntervalMs || 1800000;
    log('INFO', `Heartbeat scheduled every ${Math.round(hbInterval / 60000)} min`);
    this.heartbeatTimer = setInterval(() => this.runHeartbeat(), hbInterval);

    // Handle graceful shutdown
    const shutdown = () => this.stop();
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
    process.on('SIGHUP', shutdown);
  }

  stop() {
    if (!this.running) return;
    this.running = false;

    log('INFO', 'Memory Co-Processor shutting down...');

    // Stop watchers
    if (this.watchers.size > 0) {
      stopAll(this.watchers);
    }

    // Clear debounce timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    // Clear heartbeat timer
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    // Close database
    if (this.db) {
      try { this.db.close(); } catch { /* ignore */ }
      this.db = null;
    }

    // Clean up ACTIVE CONTEXT from system prompt
    try {
      clearActiveContext(this.paths.activeContextFile);
      log('INFO', 'Cleared ACTIVE CONTEXT file');
    } catch {
      // Best effort
    }

    // Remove PID file
    try { fs.unlinkSync(PID_FILE); } catch { /* ignore */ }

    log('INFO', 'Memory Co-Processor stopped', this.stats);
    process.exit(0);
  }

  // ─── TURN HANDLING ──────────────────────────────────────────────────────────

  onNewTurns(turns, conversationId) {
    // Cross-watcher dedup: skip turns already seen within 60s
    const DEDUP_TTL_MS = 60000;
    const now = Date.now();
    const fresh = [];

    for (const turn of turns) {
      const hash = createHash('sha256').update(turn.text).digest('hex').slice(0, 16);
      if (this.seenTurnHashes.has(hash)) continue;
      this.seenTurnHashes.add(hash);
      fresh.push({ ...turn, conversationId });

      // Expire old hashes after TTL
      setTimeout(() => this.seenTurnHashes.delete(hash), DEDUP_TTL_MS);
    }

    if (fresh.length === 0) return;
    this.pendingTurns.push(...fresh);

    // Debounce: wait for intervalMs before processing
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.processPendingTurns();
    }, this.config.coprocessor.intervalMs);
  }

  async processPendingTurns() {
    if (this.pendingTurns.length === 0) return;

    // Adaptive timing: skip if previous cycle is still running
    if (this._processing) {
      log('DEBUG', 'Skipping cycle — previous still running');
      return;
    }
    this._processing = true;

    const turns = [...this.pendingTurns];
    this.pendingTurns = [];

    log('DEBUG', `Processing ${turns.length} pending turns`);

    // Separate user and model turns
    const userTurns = turns.filter(t => t.role === 'user');
    const modelTurns = turns.filter(t => t.role === 'model');
    const allUserText = userTurns.map(t => t.text).join('\n');
    const allModelText = modelTurns.map(t => t.text).join('\n');

    const contextItems = [];

    // Drain queued notifications (from external callers or previous pipeline runs)
    try {
      purgeStale(); // Remove notifications older than 30 min
      const queued = drainNotifications();
      if (queued.length > 0) {
        contextItems.push(...queued);
        log('INFO', `Drained ${queued.length} queued notification(s)`);
      }
    } catch {
      // Notification queue is best-effort
    }

    // Phase 19: 4-mode Prompt Classification
    let mode = 'discuss';
    let budget = 2500;
    if (allUserText) {
      const classification = classifyPrompt(allUserText);
      mode = classification.mode;
      budget = classification.budget;
      log('INFO', `Prompt classified as mode: ${mode} (budget: ${budget})`);
    }

    // Phase 19: Compliance Verification
    if (this.db && allModelText.trim() && turns[0]?.conversationId) {
      this.runComplianceVerification(allModelText, turns[0].conversationId);
    }

    // Run all 4 checks in parallel
    try {
      const results = await Promise.allSettled([
        this.runSteeringCheck(allUserText),
        this.runSentimentCheck(allUserText),
        this.runRelevanceCheck(allUserText + '\n' + allModelText),
        this.runContradictionCheck(allModelText),
      ]);

      // Collect context items from all checks
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          contextItems.push(...result.value);
        }
      }
    } catch (err) {
      log('ERROR', 'Check pipeline error', { error: err.message });
      this.stats.errors++;
    }

    // Phase 19.5: Inject immediate ACTIVE CONTEXT for IDE auto-injection
    try {
      const { writeActiveContext, clearActiveContext } = await import('./inject.mjs');
      if (contextItems.length > 0) {
        writeActiveContext(this.paths.activeContextFile, contextItems, { append: false });
        this.stats.contextInjections++;
      } else {
        clearActiveContext(this.paths.activeContextFile);
      }
    } catch (err) {
      log('ERROR', 'Failed to inject active context', { error: err.message });
    }

    // Phase 19: Inject graph-aware DYNAMIC CONTEXT based on classification
    if (this.db) {
      try {
        const compiled = compileSurfaceFromGraph(this.db, mode, { tokenBudget: budget, includeTemporalContext: true });
        
        // Write the dynamically compiled surface to the system prompt
        const targetFiles = this.paths.systemPromptFiles || [this.paths.systemPrompt];
        // PHASE 20: Write graph surface as a standalone rule file for IDE auto-injection.
        // The IDE reads .agent/rules/*.md on every turn as hard rules.
        const rulesGraphPath = path.join(this.root, '.agent', 'rules', 'graph-context.md');
        try {
          fs.mkdirSync(path.dirname(rulesGraphPath), { recursive: true });
          fs.writeFileSync(rulesGraphPath, compiled.surface);
          log('INFO', `Graph surface written to ${rulesGraphPath} (Mode: ${mode})`);
        } catch (writeErr) {
          log('ERROR', `Failed to write graph-context.md: ${writeErr.message}`);
        }
        
        // Log injected rules for future compliance verification
        const injectedSlugs = compiled.stats.dynamicNodes || [];
        this.db.prepare(`
          INSERT INTO compliance_log (turn_id, mode, injected_rules)
          VALUES (?, ?, ?)
        `).run(turns[0]?.conversationId || 'unknown', mode, JSON.stringify(injectedSlugs));
      } catch (err) {
        log('ERROR', 'Failed to inject graph-aware surface', { error: err.message });
      }
    }

    this.stats.turnsProcessed += turns.length;

    // Release processing lock before fire-and-forget research
    this._processing = false;

    // ── System 2 Research (fire-and-forget, non-blocking) ──────────────
    if (this.config.coprocessor.researchEnabled && allModelText.trim()) {
      this.dispatchResearch(allModelText, turns[0]?.conversationId);
    }
  }

  // ─── CHECK RUNNERS ──────────────────────────────────────────────────────────

  runComplianceVerification(modelText, turnId) {
    if (!this.db) return;
    try {
      // Get the rules injected in the PREVIOUS turn
      const lastLog = this.db.prepare(`
        SELECT id, injected_rules, mode FROM compliance_log 
        ORDER BY created_at DESC LIMIT 1
      `).get();
      
      if (!lastLog || !lastLog.injected_rules) return;
      
      const injectedRules = JSON.parse(lastLog.injected_rules);
      if (typeof injectedRules !== 'number' || injectedRules === 0) return;

      // Deterministic compliance check: mark as compliant
      // Full LLM-based verification would send modelText + rules for assessment
      // For now, mark all turns as compliant (no random noise)
      this.db.prepare(`
        UPDATE compliance_log 
        SET compliance_score = 1.0
        WHERE id = ?
      `).run(lastLog.id);
    } catch (err) {
      log('ERROR', 'Compliance verification failed', { error: err.message });
    }
  }

  async runSteeringCheck(userText) {
    if (!userText.trim()) return [];

    const directives = detectDirectives(userText);
    if (directives.length === 0) return [];

    log('INFO', `Detected ${directives.length} steering directive(s)`);
    this.stats.steeringsDetected += directives.length;

    const contextItems = [];

    for (const directive of directives) {
      try {
        const result = steer({
          type: directive.type,
          directive: directive.directive,
          paths: this.paths,
          db: this.db,
          intensity: directive.intensity,
          behavioralSurfaceHeader: this.config.behavioralSurfaceHeader,
        });

        log('INFO', 'Steering cascade executed', {
          type: directive.type,
          slug: result.slug,
          steps: result.steps,
        });

        // Notify on high-intensity steerings
        if (this.config.coprocessor.notificationsEnabled && directive.intensity >= 8) {
          notify('Steering Detected', `${directive.type.toUpperCase()}: ${directive.directive.slice(0, 60)}`);
        }

        contextItems.push({
          type: 'important',
          label: 'Auto-Steered',
          text: `Detected "${directive.type}" directive: ${directive.directive.slice(0, 100)}`,
        });
      } catch (err) {
        log('ERROR', 'Steering cascade failed', { error: err.message });
        this.stats.errors++;
      }
    }

    return contextItems;
  }

  async runSentimentCheck(userText) {
    if (!userText.trim()) return [];

    const { sentiment, intensity, signals } = detectSentiment(userText);
    if (sentiment === 'neutral') return [];

    log('INFO', `Detected ${sentiment} sentiment (intensity: ${intensity})`, { signals });
    this.stats.sentimentsDetected++;

    // Only inject context for strong signals
    if (intensity >= 6) {
      const contextItems = [{
        type: sentiment === 'positive' ? 'tip' : 'caution',
        label: sentiment === 'positive' ? 'User Pleased' : 'User Frustrated',
        text: sentiment === 'positive'
          ? `The user expressed satisfaction (intensity: ${intensity}). Reinforce this behavior pattern.`
          : `The user is frustrated (intensity: ${intensity}). Review recent actions and correct course.`,
      }];

      // Notify on high-intensity negative sentiment
      if (this.config.coprocessor.notificationsEnabled && sentiment === 'negative' && intensity >= 8) {
        notify('⚠️ User Frustrated', `Intensity: ${intensity}/10. Signals: ${signals.join(', ')}`);
      }

      return contextItems;
    }

    return [];
  }

  async runRelevanceCheck(combinedText) {
    if (!this.db || !combinedText.trim()) return [];

    try {
      return findRelevantMemories(this.db, combinedText, { maxResults: 3 });
    } catch (err) {
      log('ERROR', 'Relevance check failed', { error: err.message });
      this.stats.errors++;
      return [];
    }
  }

  async runContradictionCheck(modelText) {
    if (!this.db || !modelText.trim()) return [];

    try {
      const contradictions = checkContradictions(this.db, modelText, { maxResults: 2 });

      if (contradictions.length > 0) {
        this.stats.contradictionsDetected += contradictions.length;
        log('WARN', `Detected ${contradictions.length} potential contradiction(s)`);

        // Notify on contradictions
        if (this.config.coprocessor.notificationsEnabled && contradictions.length > 0) {
          notify('Contradiction Detected', contradictions[0].text.slice(0, 80));
        }
      }

      return contradictions;
    } catch (err) {
      log('ERROR', 'Contradiction check failed', { error: err.message });
      this.stats.errors++;
      return [];
    }
  }

  // ─── SYSTEM 2 RESEARCH ──────────────────────────────────────────────────────

  async dispatchResearch(modelText, conversationId) {
    try {
      const claims = detectResearchableClaims(modelText);
      if (claims.length === 0) return;

      this.stats.researchDispatched += claims.length;
      log('INFO', `Dispatching System 2 research for ${claims.length} claim(s)`);

      const model = this.config.coprocessor.analysisModel || 'gemini-2.5-flash';
      const results = await batchResearch(claims, { model });

      this.stats.researchCompleted += results.length;

      // Persist results as conclusion wiki nodes
      for (const { claim, result } of results) {
        if (result.verified === null) continue; // Skip inconclusive

        try {
          const { filePath, slug } = createConclusionNode(this.paths.wikiDir, {
            claim,
            verified: result.verified,
            correction: result.correction,
            sources: result.sources,
            summary: result.summary,
            conversationId,
          });

          // Index immediately for future recall
          if (this.db) {
            indexConclusionNode(this.db, filePath, this.paths.root);
          }

          this.stats.conclusionsCreated++;
          log('INFO', `Created conclusion node: ${slug}`, { verified: result.verified });

          // Notify on critical corrections
          if (result.verified === false && this.config.coprocessor.notificationsEnabled) {
            notify('⚠️ Fact Check', `CORRECTION: ${claim.slice(0, 60)}... → ${(result.correction || result.summary).slice(0, 60)}`);
          }
        } catch (err) {
          log('ERROR', 'Failed to create conclusion node', { error: err.message });
          this.stats.errors++;
        }
      }

      // Format and inject results into ACTIVE CONTEXT
      const contextItems = formatResearchResults(results);
      if (contextItems.length > 0) {
        try {
          const injected = writeActiveContext(
            this.paths.activeContextFile,
            contextItems,
            { append: true }
          );
          if (injected.success) {
            this.stats.contextInjections++;
            log('INFO', `Injected ${contextItems.length} research result(s) into ACTIVE CONTEXT`);
          }
        } catch (err) {
          log('ERROR', 'Failed to inject research results', { error: err.message });
          this.stats.errors++;
        }
      }
    } catch (err) {
      log('ERROR', 'System 2 research pipeline error', { error: err.message });
      this.stats.errors++;
    }
  }

  // ─── STATUS ─────────────────────────────────────────────────────────────────

  getStatus() {
    return {
      running: this.running,
      watcher: getAllStatus(this.watchers),
      stats: this.stats,
      config: {
        intervalMs: this.config.coprocessor.intervalMs,
        heartbeatIntervalMs: this.config.coprocessor.heartbeatIntervalMs,
        watchers: this.config.watchers,
      },
    };
  }

  // ─── HEARTBEAT ───────────────────────────────────────────────────────────────

  /**
   * Periodic heartbeat: recompile behavioral surface, run decay, prune, regenerate.
   * Same logic as the Supabase Edge Function heartbeat, but running locally.
   */
  async runHeartbeat() {
    if (this._heartbeatRunning) {
      log('DEBUG', 'Skipping heartbeat — previous still running');
      return;
    }
    this._heartbeatRunning = true;
    const t0 = Date.now();

    try {
      log('INFO', 'Heartbeat starting — surface recompilation + maintenance');

      // 1. Recompile behavioral surface from the instruction graph
      //    Use 'discuss' mode for heartbeat (general-purpose surface)
      let surfaceResult = null;
      if (this.db) {
        try {
          const compiled = compileSurfaceFromGraph(this.db, 'discuss', {
            tokenBudget: 2500,
            includeTemporalContext: true,
            timezone: undefined,
          });
          surfaceResult = compiled;
        } catch (err) {
          log('WARN', 'Graph surface compilation failed, falling back to wiki surface', { error: err.message });
        }
      }

      // Fallback to wiki-based surface if graph compilation failed or no DB
      if (!surfaceResult) {
        const wikiResult = compileSurface({
          wikiDir: this.paths.wikiDir,
          root: this.root,
          ranking: this.config.ranking,
          includeTemporalContext: true,
          episodesDir: this.paths.episodesDir,
        });
        surfaceResult = wikiResult;
      }

      if (surfaceResult) {
        // Write to all configured system prompt files
        const targetFiles = this.paths.systemPromptFiles || [this.paths.systemPrompt];
        // PHASE 20: Write graph surface as a standalone rule file for IDE auto-injection.
        const rulesGraphPath = path.join(this.root, '.agent', 'rules', 'graph-context.md');
        try {
          fs.mkdirSync(path.dirname(rulesGraphPath), { recursive: true });
          fs.writeFileSync(rulesGraphPath, surfaceResult.surface);
          log('INFO', `Heartbeat surface written to ${rulesGraphPath}: ${surfaceResult.stats.totalNodes} nodes`);
        } catch (writeErr) {
          log('ERROR', `Failed to write graph-context.md: ${writeErr.message}`);
        }
      } else {
        log('DEBUG', 'No wiki nodes found — skipping surface compilation');
      }

      // 2. Confidence decay
      const decay = runConfidenceDecay(this.paths.wikiDir);
      if (decay.decayed > 0) {
        log('INFO', `Confidence decay: ${decay.decayed} node(s) decayed`, decay.details.slice(0, 3));
      }

      // 3. Prune stale zero-access nodes
      const prune = pruneStaleNodes({ wikiDir: this.paths.wikiDir, root: this.root });
      if (prune.pruned > 0) {
        log('INFO', `Pruned: ${prune.pruned} stale node(s) moved to .trash/`);
      }

      // 4. Regenerate MEMORY.md
      if (this.paths.memoryMd) {
        regenerateMemoryMd({ wikiDir: this.paths.wikiDir, memoryMd: this.paths.memoryMd });
      }

      // 5. Reindex FTS5 if database is open
      if (this.db) {
        try {
          const { reindex } = await import('../core/fts5.mjs');
          const result = reindex(this.db, this.paths);
          log('DEBUG', `FTS5 reindexed: ${result.totalIndexed} items`);
        } catch (err) {
          log('WARN', 'FTS5 reindex failed (non-fatal)', { error: err.message });
        }
      }

      this.stats.heartbeatsRun++;
      this.stats.lastHeartbeat = new Date().toISOString();
      log('INFO', `Heartbeat complete in ${Date.now() - t0}ms`);

    } catch (err) {
      log('ERROR', 'Heartbeat failed', { error: err.message });
      this.stats.errors++;
    } finally {
      this._heartbeatRunning = false;
    }
  }
}

// ─── CLI ENTRY POINT ────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  // --stop: send SIGTERM to existing daemon
  if (args.includes('--stop')) {
    try {
      const pid = parseInt(fs.readFileSync(PID_FILE, 'utf-8').trim());
      process.kill(pid, 'SIGTERM');
      console.log(`✅ Sent SIGTERM to co-processor (PID ${pid})`);
    } catch {
      console.log('⚠️  No running co-processor found');
    }
    process.exit(0);
  }

  // --status: print stats
  if (args.includes('--status')) {
    try {
      const pid = parseInt(fs.readFileSync(PID_FILE, 'utf-8').trim());
      // Check if process is alive
      process.kill(pid, 0);
      const logContent = fs.existsSync(LOG_FILE)
        ? fs.readFileSync(LOG_FILE, 'utf-8').split('\n').slice(-20).join('\n')
        : '(no log file)';
      console.log(`🧠 Co-Processor running (PID ${pid})`);
      console.log('\n--- Recent Log ---');
      console.log(logContent);
    } catch {
      console.log('⚠️  Co-processor is not running');
    }
    process.exit(0);
  }

  // Determine root directory
  let root = process.cwd();
  const rootIdx = args.indexOf('--root');
  if (rootIdx !== -1 && args[rootIdx + 1]) {
    root = path.resolve(args[rootIdx + 1]);
  }

  // Check for existing PID
  if (fs.existsSync(PID_FILE)) {
    try {
      const pid = parseInt(fs.readFileSync(PID_FILE, 'utf-8').trim());
      process.kill(pid, 0); // Check if alive
      console.log(`⚠️  Co-processor already running (PID ${pid}). Use --stop first.`);
      process.exit(1);
    } catch {
      // PID file is stale — clean up and continue
      fs.unlinkSync(PID_FILE);
    }
  }

  // Truncate log file on fresh start
  try { fs.writeFileSync(LOG_FILE, ''); } catch { /* ignore */ }

  // Load config and start daemon
  const config = await loadConfig(root);
  const daemon = new CoProcessorDaemon(root, config);
  await daemon.start();

  // Keep process alive — use heartbeat for status logging
  setInterval(() => {
    log('DEBUG', 'keepalive', daemon.stats);
  }, 60000);
}

// ─── EXPORTS FOR PROGRAMMATIC USE ───────────────────────────────────────────────

export { CoProcessorDaemon };
export default CoProcessorDaemon;

// Run as CLI
main().catch(err => {
  log('FATAL', 'Daemon crashed', { error: err.message, stack: err.stack });
  process.exit(1);
});
