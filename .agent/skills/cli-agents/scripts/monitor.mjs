#!/usr/bin/env node

/**
 * monitor.mjs — Live agent dispatch monitor
 * 
 * Tails log files from dispatched agents and shows status in a formatted dashboard.
 * 
 * Usage:
 *   node .agent/skills/cli-agents/scripts/monitor.mjs
 *   node .agent/skills/cli-agents/scripts/monitor.mjs /tmp/claude-dispatch.log /tmp/gemini-dispatch.log
 */

import { watch, readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

const LOG_DIR = '/tmp';
const LOG_PATTERN = /^(gemini|claude|codex)-dispatch.*\.log$/;

function getLogFiles(explicitFiles) {
  if (explicitFiles.length > 0) return explicitFiles;
  
  try {
    return readdirSync(LOG_DIR)
      .filter(f => LOG_PATTERN.test(f))
      .map(f => path.join(LOG_DIR, f));
  } catch {
    return [];
  }
}

function getAgentName(filepath) {
  const base = path.basename(filepath);
  if (base.includes('gemini')) return '🟦 Gemini';
  if (base.includes('claude')) return '🟧 Claude';
  if (base.includes('codex')) return '🟩 Codex';
  return '⬜ Unknown';
}

function getLastLines(filepath, n = 5) {
  try {
    if (!existsSync(filepath)) return ['(waiting for output...)'];
    const content = readFileSync(filepath, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());
    return lines.slice(-n);
  } catch {
    return ['(error reading file)'];
  }
}

function getStatus(filepath) {
  try {
    const content = readFileSync(filepath, 'utf-8');
    if (content.includes('error') || content.includes('Error') || content.includes('FAILED')) return '❌ ERROR';
    if (content.includes('committed') || content.includes('Created file') || content.includes('Done')) return '✅ DONE';
    return '⏳ RUNNING';
  } catch {
    return '⏳ PENDING';
  }
}

function render(logFiles) {
  console.clear();
  const now = new Date().toLocaleTimeString();
  console.log(`\x1b[1m╔══════════════════════════════════════════════════════╗\x1b[0m`);
  console.log(`\x1b[1m║         🤖 CLI Agent Monitor — ${now}          ║\x1b[0m`);
  console.log(`\x1b[1m╚══════════════════════════════════════════════════════╝\x1b[0m\n`);

  if (logFiles.length === 0) {
    console.log('  No active agent logs found in /tmp/*-dispatch*.log');
    console.log('  Dispatch an agent first, then re-run this monitor.\n');
    return;
  }

  for (const file of logFiles) {
    const agent = getAgentName(file);
    const status = getStatus(file);
    const lines = getLastLines(file, 4);
    
    console.log(`  ${agent}  ${status}  \x1b[2m${path.basename(file)}\x1b[0m`);
    console.log(`  ${'─'.repeat(50)}`);
    for (const line of lines) {
      const truncated = line.length > 70 ? line.substring(0, 67) + '...' : line;
      console.log(`  \x1b[2m│\x1b[0m ${truncated}`);
    }
    console.log('');
  }

  console.log(`\x1b[2m  Press Ctrl+C to exit. Auto-refreshes every 2s.\x1b[0m\n`);
}

// Main
const explicitFiles = process.argv.slice(2);
const logFiles = getLogFiles(explicitFiles);

render(logFiles);

// Auto-refresh every 2 seconds
const interval = setInterval(() => {
  const files = getLogFiles(explicitFiles);
  render(files);
}, 2000);

// Watch for new log files
if (explicitFiles.length === 0) {
  try {
    watch(LOG_DIR, (eventType, filename) => {
      if (filename && LOG_PATTERN.test(filename)) {
        const files = getLogFiles([]);
        render(files);
      }
    });
  } catch {
    // Silently ignore watch errors
  }
}

process.on('SIGINT', () => {
  clearInterval(interval);
  console.log('\n  Monitor stopped.\n');
  process.exit(0);
});
