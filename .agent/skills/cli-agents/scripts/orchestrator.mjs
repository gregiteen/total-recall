#!/usr/bin/env node

/**
 * orchestrator.mjs — Autonomous AI Orchestrator
 * 
 * Launches a real Gemini agent as the orchestrator. The AI agent reads the
 * project folder, understands the tracker + plan, dispatches subagents in
 * parallel, monitors their completion, updates the tracker, and keeps going
 * until the entire project is done.
 * 
 * Usage:
 *   node .agent/skills/cli-agents/scripts/orchestrator.mjs <project-folder> [options]
 * 
 * Examples:
 *   node .agent/skills/cli-agents/scripts/orchestrator.mjs docs/projects/in-progress/standards-enforcement
 *   node .agent/skills/cli-agents/scripts/orchestrator.mjs docs/projects/in-progress/media-suite --agent claude
 * 
 * Options:
 *   --agent <name>       Agent to use as orchestrator (gemini|claude). Default: gemini
 *   --max-parallel <n>   Max concurrent subagents. Default: 2
 *   --dry-run            Show the orchestrator prompt without launching
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../../../../');
const DISPATCH_SCRIPT = path.join(__dirname, 'dispatch.mjs');

// --- Args ---
const args = process.argv.slice(2);
const projectFolder = args[0];
if (!projectFolder) {
  console.error('Usage: orchestrator.mjs <project-folder> [--agent gemini] [--max-parallel 2] [--dry-run]');
  process.exit(1);
}

const agentName = args.includes('--agent') ? args[args.indexOf('--agent') + 1] : 'gemini';
const maxParallel = args.includes('--max-parallel') ? parseInt(args[args.indexOf('--max-parallel') + 1], 10) : 2;
const dryRun = args.includes('--dry-run');

// --- Resolve project folder ---
const absFolder = path.isAbsolute(projectFolder) ? projectFolder : path.join(ROOT, projectFolder);
if (!fs.existsSync(absFolder) || !fs.statSync(absFolder).isDirectory()) {
  console.error(`[Orchestrator] Not a directory: ${absFolder}`);
  process.exit(1);
}

// --- Find tracker and plan ---
const files = fs.readdirSync(absFolder);
const trackerFile = files.find(f => /_PROJECT_TRACKER\.md$/i.test(f));
const planFile = files.find(f => /_DEVELOPMENT_PLAN\.md$/i.test(f));

if (!trackerFile) {
  console.error(`[Orchestrator] No *_PROJECT_TRACKER.md found in ${absFolder}`);
  process.exit(1);
}

const relFolder = path.relative(ROOT, absFolder);
const relTracker = path.join(relFolder, trackerFile);
const relPlan = planFile ? path.join(relFolder, planFile) : null;

console.log(`[Orchestrator] Project: ${relFolder}`);
console.log(`[Orchestrator] Tracker: ${trackerFile}`);
console.log(`[Orchestrator] Plan: ${planFile || '(none)'}`);
console.log(`[Orchestrator] Agent: ${agentName} | Max parallel: ${maxParallel}`);

// --- Build the orchestrator mega-prompt ---
const prompt = `
You are the AUTONOMOUS ORCHESTRATOR for the project at: ${relFolder}

YOUR MISSION: Read the project tracker and development plan, then systematically complete ALL remaining phases by dispatching subagents. You do NOT do the work yourself — you DELEGATE to subagents and MONITOR their progress.

## Project Files
- **Tracker**: ${relTracker} (read this FIRST to understand what phases are pending)
${relPlan ? `- **Plan**: ${relPlan} (read this for architectural context)` : ''}
- **Output folder**: ${relFolder}/ (subagents write reports here)

## Your Tools

### Dispatching Subagents
Use the dispatch script to launch subagents:
\`\`\`bash
node .agent/skills/cli-agents/scripts/dispatch.mjs gemini "<task prompt>" --bg --notify
\`\`\`

You can dispatch up to ${maxParallel} subagents simultaneously. Each subagent gets its own task.

### Monitoring Subagents
Check subagent status by reading their log files:
\`\`\`bash
ls -la /tmp/*dispatch*.log
tail -20 /tmp/gemini-dispatch-*.log
\`\`\`

Check if subagent processes are still running:
\`\`\`bash
ps aux | grep gemini | grep -v grep
\`\`\`

## Your Protocol

1. **READ** the tracker file to identify all pending phases (marked with ⏳ or unchecked items \`- [ ]\`)
2. **SKIP** completed phases (marked with ✅ or \`- [x]\`)
3. **SELECT** up to ${maxParallel} phases to work on simultaneously
4. **DISPATCH** a subagent for each selected phase with a detailed prompt that includes:
   - The phase number and title
   - All checklist items for that phase
   - The project folder path for output
   - The tracker file path for updates
   - Whether this is an audit-only or code-modification task
5. **WAIT** by polling \`ps aux | grep gemini\` every 30 seconds until subagents finish
6. **VERIFY** results by reading the dispatch logs and checking the tracker for updates
7. **ADVANCE** to the next batch of phases
8. **REPEAT** until ALL phases are complete

## Critical Rules
- Do NOT do the phase work yourself. You are the MANAGER, not the worker.
- Always dispatch subagents using the dispatch.mjs script.
- NEVER delete any /tmp/*.log files. The monitor dashboard reads them to display agent history.
- After each batch completes, re-read the tracker to see what the subagents updated.
- If a subagent fails or produces incomplete results, re-dispatch it with a more specific prompt.
- When ALL phases are ✅, write a final summary report to ${relFolder}/ORCHESTRATOR_FINAL_REPORT.md
- Do NOT stop until every phase in the tracker is complete.

BEGIN NOW. Read the tracker and start orchestrating.
`;

if (dryRun) {
  console.log('\n[Orchestrator] --dry-run mode. Prompt:\n');
  console.log(prompt);
  process.exit(0);
}

// --- Launch the orchestrator as a real Gemini agent via dispatch ---
console.log(`[Orchestrator] 🚀 Launching ${agentName} orchestrator agent...`);

const LOG_FILE = `/tmp/orchestrator-dispatch-${Date.now()}.log`;

// Use dispatch.mjs to launch so it shows up in the monitor
const child = spawn('node', [
  DISPATCH_SCRIPT, agentName, prompt, '--notify'
], { 
  cwd: ROOT, 
  stdio: 'inherit',
  env: { ...process.env, ORCHESTRATOR_LOG: LOG_FILE }
});

child.on('close', (code) => {
  console.log(`[Orchestrator] Agent exited with code ${code}`);
  process.exit(code || 0);
});
