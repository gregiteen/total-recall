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
    };
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

    // Inject ACTIVE CONTEXT if there's anything to surface
    if (contextItems.length > 0) {
      try {
        const result = writeActiveContext(
          this.paths.activeContextFile,
          contextItems,
          { append: true }
        );
        if (result.success) {
          this.stats.contextInjections++;
          log('INFO', `Injected ${contextItems.length} items into ACTIVE CONTEXT`);
        }
      } catch (err) {
        log('ERROR', 'Failed to inject ACTIVE CONTEXT', { error: err.message });
        this.stats.errors++;
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
        watchers: this.config.watchers,
      },
    };
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

  // Keep process alive
  setInterval(() => {
    // Heartbeat — PM2 monitors this process
    log('DEBUG', 'heartbeat', daemon.stats);
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
