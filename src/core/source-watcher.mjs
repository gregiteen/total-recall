/**
 * Source Watcher — auto-regenerates repo-expert when code changes.
 *
 * Watches key source directories (src/, frontend/src/, package.json, etc.)
 * and triggers a debounced repo-expert regeneration when files change.
 * Runs alongside the vault-watcher in the daemon loop.
 */
import fs from 'node:fs';
import path from 'node:path';
import { logger } from './logger.mjs';

let regenTimer = null;
const REGEN_DEBOUNCE_MS = 5000; // Wait 5s of quiet before regenerating
let watchers = [];
let stopWrapper = null;

/**
 * Directories to watch relative to the project root.
 * Only top-level dirs — fs.watch with recursive handles subdirs.
 */
const WATCH_TARGETS = [
  'src',
  'frontend/src',
  'bin',
];

/** Files to watch in the project root (exact match). */
const WATCH_FILES = [
  'package.json',
  'tsconfig.json',
];

/** Extensions that count as "code changes". */
const CODE_EXTENSIONS = new Set([
  '.mjs', '.js', '.cjs', '.ts', '.tsx', '.jsx', '.vue', '.json',
]);

function isCodeChange(filename) {
  if (!filename) return false;
  const ext = path.extname(filename);
  return CODE_EXTENSIONS.has(ext);
}

/**
 * Start watching source directories for code changes.
 * When a change is detected, debounce and regenerate repo-expert.
 *
 * @param {string} repoRoot — project root to watch
 * @param {string} skillsDir — .agent/skills dir where repo-expert lives
 */
export function startSourceWatcher(repoRoot, skillsDir) {
  if (stopWrapper) return stopWrapper;

  const repoExpertDir = path.join(skillsDir, 'repo-expert');
  if (!fs.existsSync(repoExpertDir)) {
    // No repo-expert skill installed — nothing to regenerate
    return { stop() {} };
  }

  const triggerRegen = (eventType, filename, source) => {
    if (!isCodeChange(filename)) return;

    // Don't react to changes inside node_modules, dist, build, .git
    if (filename && (
      filename.includes('node_modules') ||
      filename.includes('dist') ||
      filename.includes('build') ||
      filename.includes('.git')
    )) return;

    if (regenTimer) clearTimeout(regenTimer);
    regenTimer = setTimeout(async () => {
      regenTimer = null;
      try {
        logger.info({
          subsystem: 'source-watcher',
          message: `Code change detected (${filename} in ${source}). Regenerating repo-expert...`,
        });

        const { generateRepoExpert } = await import('../cli/repo-expert-generate.mjs');
        const result = generateRepoExpert(repoRoot, { force: true });

        logger.info({
          subsystem: 'source-watcher',
          message: `repo-expert regenerated: ${result.stats.cliCommands} CLI commands, ${result.stats.apiRoutes} API routes, ${result.stats.coreModules} core modules`,
        });
      } catch (err) {
        logger.error({
          subsystem: 'source-watcher',
          message: `repo-expert regeneration failed: ${err.message}`,
        });
      }
    }, REGEN_DEBOUNCE_MS);
  };

  // Watch directories
  for (const rel of WATCH_TARGETS) {
    const dir = path.join(repoRoot, rel);
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) continue;
    try {
      const w = fs.watch(dir, { recursive: true }, (eventType, filename) => {
        triggerRegen(eventType, filename, rel);
      });
      watchers.push(w);
    } catch (err) {
      logger.info({
        subsystem: 'source-watcher',
        message: `Cannot watch ${dir}: ${err.message}`,
      });
    }
  }

  // Watch individual root files
  for (const file of WATCH_FILES) {
    const filePath = path.join(repoRoot, file);
    if (!fs.existsSync(filePath)) continue;
    try {
      const w = fs.watch(filePath, (eventType) => {
        triggerRegen(eventType, file, 'root');
      });
      watchers.push(w);
    } catch { /* non-fatal */ }
  }

  if (watchers.length > 0) {
    logger.info({
      subsystem: 'source-watcher',
      message: `Watching ${watchers.length} source targets in ${repoRoot} for repo-expert auto-regen`,
    });
  }

  stopWrapper = {
    stop() {
      for (const w of watchers) {
        try { w.close(); } catch { /* ignore */ }
      }
      watchers = [];
      if (regenTimer) {
        clearTimeout(regenTimer);
        regenTimer = null;
      }
      stopWrapper = null;
    }
  };
  return stopWrapper;
}
