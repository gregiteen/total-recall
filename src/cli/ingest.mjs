/**
 * total-recall ingest
 *
 * Scan all known IDE agent conversation logs and ingest them into
 * the Total Recall sessions directory.
 *
 * Usage:
 *   npx total-recall ingest [options]
 *
 * Options:
 *   --sources <list>   Comma-separated source names (default: all)
 *   --watch            Start watching for new files (daemon mode)
 *   --help             Show this help
 */

import path from 'node:path';
import { resolveAgentDir, resolveBrainDir } from './agent-dir.mjs';

const AGENT_DIR = resolveAgentDir();
const BRAIN_DIR = resolveBrainDir();

function parseArgs(args) {
  const opts = { sources: null, watch: false, help: false };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--sources': opts.sources = args[++i]?.split(',').map(s => s.trim()); break;
      case '--watch': opts.watch = true; break;
      case '--help': case '-h': opts.help = true; break;
    }
  }
  return opts;
}

function printHelp() {
  console.log(`
  total-recall ingest — Ingest IDE agent conversation logs

  Scans known local directories for conversation history from:
    • Claude Code   (~/.claude/projects/)
    • OpenAI Codex  (~/.codex/sessions/)
    • Gemini CLI    (~/.gemini/tmp/)
    • Antigravity   (~/.gemini/antigravity/brain/)
    • Cursor        (~/.cursor/projects/)

  Ingested sessions are written as JSONL to .agent/skills/total-recall/sessions/

  Usage: total-recall ingest [options]

  Options:
    --sources <list>   Comma-separated source filter (e.g. claude-code,codex)
    --watch            Keep watching for new files (daemon mode)
    --help, -h         Show this help
`);
}

export default async function ingest(args) {
  const opts = parseArgs(args);
  if (opts.help) { printHelp(); return; }

  const sessionsDir = path.join(BRAIN_DIR, 'sessions');

  const { scanAndIngest, startWatching } = await import('../core/session-watcher.mjs');

  // One-shot scan
  console.error('\n  🔍 Scanning IDE conversation logs...\n');
  const scanOpts = opts.sources ? { enabledSources: opts.sources } : {};
  const result = scanAndIngest(sessionsDir, scanOpts);

  for (const source of result.sources) {
    const icon = source.status === 'not-found' ? '⚪' : source.files > 0 ? '🟢' : '🔵';
    console.error(`  ${icon} ${source.name}: ${source.status} (${source.files} new sessions)`);
  }
  console.error(`\n  Total ingested: ${result.ingested} sessions\n`);

  // Watch mode
  if (opts.watch) {
    console.error('  👁️  Watching for new conversation files... (Ctrl+C to stop)\n');
    const watcher = startWatching(sessionsDir, scanOpts);

    process.on('SIGINT', () => {
      watcher.stop();
      process.exit(0);
    });

    // Keep the process alive
    await new Promise(() => {}); // blocks forever
  }
}
