#!/usr/bin/env node

/**
 * switch-memory-pipeline.mjs — Autonomous Memory Extraction Pipeline
 *
 * Dispatches 3 specialized CLI agents in parallel during /switch:
 *   1. Archivist (Gemini Flash) — Archives the conversation as an episode,
 *      extracts wiki nodes, updates USER.md/SOUL.md
 *   2. Synthesizer (Claude) — Reads the wiki graph, generates the attitude
 *      paragraph and curated rules, replaces DISTILLED MEMORY
 *   3. Fact-Checker (Codex) — Cross-references wiki claims against the
 *      codebase, updates confidence/last_verified
 *
 * Usage:
 *   node total-recall/src/agents/switch-memory-pipeline.mjs --root <repo> [--conversation-id <id>] [--dry-run]
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { loadConfig, resolvePaths } from '../core/utils.mjs';
import { getAdapter, checkAvailability } from './adapters/index.mjs';

// ─── CONSTANTS ──────────────────────────────────────────────────────────────────

const NOTIFY_SCRIPT = '.agents/skills/notifications/scripts/notify.mjs';

// ─── PROMPT TEMPLATES ───────────────────────────────────────────────────────────

function archivistPrompt(paths, conversationId) {
  return `You are the Memory Archivist. Your job is to read a conversation and extract structured knowledge.

## INPUT
- Conversation overview: ${path.join(process.env.HOME, '.gemini/antigravity/brain', conversationId, '.system_generated/logs/overview.txt')}
- Wiki directory: ${paths.wikiDir}
- Episodes directory: ${paths.episodesDir}
- USER.md: ${paths.userMd}
- SOUL.md: ${paths.soulMd}

## TASKS
1. Read the conversation overview.txt
2. Create an episode archive in ${paths.episodesDir}/YYYY/MM/DD/session-${conversationId.slice(0, 8)}.md with YAML frontmatter (session_id, date, files_modified, decisions, user_mood, objective)
3. Extract any NEW knowledge as wiki nodes in ${paths.wikiDir}/ — one .md file per concept, following SCHEMA.md format
4. If the user revealed personal preferences, work habits, or identity traits, append to ${paths.userMd}
5. If the user expressed strong emotional reactions, document the behavioral pattern in ${paths.soulMd}

## RULES
- Each wiki node MUST have: type, confidence, sentiment, sentiment_intensity, provenance (linking to the conversation)
- Use the proper alert format: > [!CAUTION] for anti-patterns, > [!TIP] for praised behaviors, > [!IMPORTANT] for corrections
- Do NOT modify existing wiki nodes — only create new ones
- Do NOT modify INSTRUCTIONS.md
- Report what you created at the end`;
}

function synthesizerPrompt(paths) {
  return `You are the Memory Synthesizer. Your job is to compile the knowledge graph into a behavioral surface.

## INPUT
- Wiki directory: ${paths.wikiDir}
- INSTRUCTIONS.md: ${paths.systemPrompt}
- SCHEMA.md: ${path.join(paths.wikiDir, '..', 'memory-wiki', 'SCHEMA.md')}

## TASKS
1. Read ALL wiki nodes in ${paths.wikiDir}/ (recursively)
2. Rank each node by: signal_score = intensity × (access+1)^0.5 × max(0.1, 0.5^(days/half_life))
3. Generate a new DISTILLED MEMORY (SUBJECT STATES) block with:
   - AGENT ATTITUDE: A personality paragraph derived from the top-ranked nodes
   - ANTI-PATTERN: > [!CAUTION] blocks from negative sentiment nodes
   - PATTERN: > [!TIP] blocks from positive sentiment nodes  
   - CONCEPT: > [!IMPORTANT] blocks from corrective nodes
   - PROJECT: > [!NOTE] blocks from active projects
4. Replace the ## DISTILLED MEMORY (SUBJECT STATES) section in INSTRUCTIONS.md with your compiled output

## RULES
- Preserve ALL content before and after the DISTILLED MEMORY section
- Cap the output at 30 rules maximum
- Use the same formatting style already present in INSTRUCTIONS.md
- Report what you changed at the end`;
}

function factCheckerPrompt(paths) {
  return `You are the Memory Fact-Checker. Your job is to verify wiki node claims against the actual codebase.

## INPUT  
- Wiki directory: ${paths.wikiDir}
- Codebase root: ${paths.root}

## TASKS
1. Read ALL wiki nodes in ${paths.wikiDir}/ (recursively)
2. For each node that references specific files, code patterns, or technical claims:
   a. Verify the claim still holds against the current codebase
   b. If verified: update last_verified to today's date in the YAML frontmatter
   c. If contradicted: set confidence to "low" and add a corrective note
3. Check for stale nodes (last_verified older than their type-specific threshold) and flag them

## RULES
- Do NOT delete any wiki nodes
- Do NOT modify the markdown body — only update YAML frontmatter fields
- Only check nodes of type: pattern, anti-pattern, decision, concept
- Skip preference and project nodes (they don't need codebase verification)
- Report a summary of findings at the end`;
}

// ─── PIPELINE EXECUTION ─────────────────────────────────────────────────────────

async function dispatchAgent(root, agentName, model, prompt, label, dryRun = false) {
  if (dryRun) {
    console.log(`\n🏷️  [DRY RUN] ${label}`);
    console.log(`   Agent: ${agentName}`);
    console.log(`   Model: ${model}`);
    console.log(`   Prompt length: ${prompt.length} chars`);
    return { success: true, dryRun: true };
  }

  console.log(`\n🚀 Dispatching ${label}...`);

  // Load adapter dynamically
  const adapter = getAdapter(agentName);
  const args = adapter.buildArgs(prompt, model);

  return new Promise((resolve) => {
    // Set TERM so CLI agents don't refuse to start in "dumb" terminals
    const env = { ...process.env, TERM: 'xterm-256color' };

    let child;

    if (adapter.usesStdin) {
      // Build args WITHOUT the prompt — it comes from stdin
      const stdinArgs = adapter.buildArgs(null, model);

      child = spawn(adapter.bin, stdinArgs, {
        cwd: root,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 300000,
      });
      child.stdin.write(prompt);
      child.stdin.end();
    } else {
      const args = adapter.buildArgs(prompt, model);
      child = spawn(adapter.bin, args, {
        cwd: root,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 300000, // 5 min max per agent
      });
      child.stdin.end(); // Close stdin to prevent hanging
    }

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    child.on('close', (code) => {
      const success = code === 0;
      console.log(`   ${success ? '✅' : '❌'} ${label} ${success ? 'completed' : 'failed'} (exit ${code})`);
      if (!success && stderr) {
        console.log(`   Error: ${stderr.slice(0, 200)}`);
      }
      resolve({ success, label, stdout, stderr, code });
    });

    child.on('error', (err) => {
      console.log(`   ❌ ${label} error: ${err.message}`);
      resolve({ success: false, label, error: err.message });
    });
  });
}

async function main() {
  const args = process.argv.slice(2);

  // Parse flags
  let root = process.cwd();
  let conversationId = null;
  let dryRun = false;
  let skipArchivist = false;
  let skipSynthesizer = false;
  let skipFactChecker = false;
  let agentOverride = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--root' && args[i + 1]) root = args[++i];
    if (args[i] === '--conversation-id' && args[i + 1]) conversationId = args[++i];
    if (args[i] === '--dry-run') dryRun = true;
    if (args[i] === '--skip-archivist') skipArchivist = true;
    if (args[i] === '--skip-synthesizer') skipSynthesizer = true;
    if (args[i] === '--skip-fact-checker') skipFactChecker = true;
    if (args[i] === '--agent' && args[i + 1]) agentOverride = args[++i];
  }

  // Resolve root to absolute — prompts are sent to external CLI agents
  root = path.resolve(root);

  const config = await loadConfig(root);
  const paths = resolvePaths(root, config);
  const agents = config.agents;

  // --agent flag overrides all roles. Fall back to config.agents.default.
  const uniformAgent = agentOverride || agents.default || null;

  console.log('🧠 Total Recall — Memory Extraction Pipeline');
  console.log(`   Root: ${root}`);
  console.log(`   Conversation: ${conversationId || 'latest'}`);
  console.log(`   Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  if (uniformAgent) console.log(`   Agent override: ${uniformAgent} (all roles)`);

  // Validate agent availability
  if (!dryRun) {
    const availability = checkAvailability();
    const archivistBin = uniformAgent || agents.archivist.binary || 'gemini';
    const synthBin = uniformAgent || agents.synthesizer.binary || 'claude';
    const fcBin = uniformAgent || agents.factChecker.binary || 'codex';

    const needed = [];
    if (!skipArchivist) needed.push({ name: archivistBin, role: 'Archivist' });
    if (!skipSynthesizer) needed.push({ name: synthBin, role: 'Synthesizer' });
    if (!skipFactChecker) needed.push({ name: fcBin, role: 'Fact-Checker' });

    const missing = needed.filter(n => !availability[n.name]?.available);
    if (missing.length > 0) {
      console.log(`\n   ⚠️  Missing agents: ${missing.map(m => `${m.role} (${m.name})`).join(', ')}`);
      console.log('   Pipeline will skip unavailable agents.\n');
    } else {
      console.log(`   Agents: ${needed.map(n => `✅ ${n.role}`).join(' | ')}\n`);
    }
  } else {
    console.log('');
  }

  // Auto-detect latest conversation if not specified
  if (!conversationId) {
    const brainDir = path.join(process.env.HOME, '.gemini/antigravity/brain');
    if (fs.existsSync(brainDir)) {
      const convDirs = fs.readdirSync(brainDir, { withFileTypes: true })
        .filter(d => d.isDirectory() && /^[0-9a-f-]+$/.test(d.name))
        .map(d => ({
          name: d.name,
          mtime: fs.statSync(path.join(brainDir, d.name)).mtimeMs,
        }))
        .sort((a, b) => b.mtime - a.mtime);

      if (convDirs.length > 0) {
        conversationId = convDirs[0].name;
        console.log(`   Auto-detected latest conversation: ${conversationId.slice(0, 8)}...`);
      }
    }
  }

  if (!conversationId) {
    console.error('❌ No conversation ID found. Specify with --conversation-id');
    process.exit(1);
  }

  // ── Dispatch agents sequentially with stagger to avoid rate limits ────
  const STAGGER_MS = 3000; // 3s between agents
  const results = [];

  const archivistAgent = uniformAgent || agents.archivist.binary || 'gemini';
  const synthAgent = uniformAgent || agents.synthesizer.binary || 'claude';
  const fcAgent = uniformAgent || agents.factChecker.binary || 'codex';

  if (!skipArchivist) {
    results.push(await dispatchAgent(root, archivistAgent, agents.archivist.model, archivistPrompt(paths, conversationId), `Archivist (${archivistAgent})`, dryRun));
    if (!dryRun && (!skipSynthesizer || !skipFactChecker)) {
      await new Promise(r => setTimeout(r, STAGGER_MS));
    }
  }

  if (!skipSynthesizer) {
    results.push(await dispatchAgent(root, synthAgent, agents.synthesizer.model, synthesizerPrompt(paths), `Synthesizer (${synthAgent})`, dryRun));
    if (!dryRun && !skipFactChecker) {
      await new Promise(r => setTimeout(r, STAGGER_MS));
    }
  }

  if (!skipFactChecker) {
    results.push(await dispatchAgent(root, fcAgent, agents.factChecker.model, factCheckerPrompt(paths), `Fact-Checker (${fcAgent})`, dryRun));
  }

  // ── Summary & Error Logging ─────────────────────────────────────────────
  console.log('\n📊 Pipeline Summary:');
  let allSuccess = true;
  const failures = [];

  for (const r of results) {
    if (!r.success) {
      allSuccess = false;
      failures.push(r);
    }
  }

  if (allSuccess) {
    console.log('   ✅ All agents completed successfully');
  } else {
    console.log(`   ⚠️  ${failures.length} agent(s) failed`);
  }

  // Write errors to persistent log file so they can be reviewed
  if (failures.length > 0) {
    const logPath = path.join(root, '.agent', 'memory-pipeline-errors.log');
    const timestamp = new Date().toISOString();
    const logLines = [`\n--- Pipeline Run: ${timestamp} ---\n`];

    for (const f of failures) {
      logLines.push(`Agent: ${f.label || 'unknown'}`);
      logLines.push(`Exit code: ${f.code}`);
      if (f.stderr) logLines.push(`Stderr:\n${f.stderr.slice(0, 500)}`);
      if (f.error) logLines.push(`Error: ${f.error}`);
      logLines.push('');
    }

    try {
      const logDir = path.dirname(logPath);
      if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
      fs.appendFileSync(logPath, logLines.join('\n'));
      console.log(`   📝 Error details written to ${logPath}`);
    } catch (e) {
      console.log(`   ⚠️  Could not write error log: ${e.message}`);
    }
  }

  // Trigger reindex after extraction (even partial success — index what we got)
  if (!dryRun) {
    console.log('\n📇 Reindexing FTS5...');
    try {
      const { openDatabase, reindex } = await import('../core/fts5.mjs');
      const db = openDatabase(paths.dbPath);
      const indexResult = reindex(db, paths);
      console.log(`   Indexed ${indexResult.totalIndexed} items`);
      db.close();
    } catch (err) {
      console.log(`   ⚠️  Reindex failed: ${err.message}`);
    }
  }

  // Notify user via macOS notification (always — success or failure)
  if (!dryRun) {
    const title = allSuccess ? '✅ Memory Pipeline Complete' : '⚠️ Memory Pipeline — Failures';
    const message = allSuccess
      ? `All ${results.length} agents completed successfully`
      : `${failures.length}/${results.length} agents failed. Check .agent/memory-pipeline-errors.log`;

    try {
      const { execFileSync } = await import('child_process');
      const os = await import('os');
      const path = await import('path');
      const fs = await import('fs');
      
      const notifyLog = path.join(os.homedir(), '.total-recall', 'notifications', 'notification-log.md');
      
      // 1. Write to Notification Log FIRST
      try {
        fs.mkdirSync(path.dirname(notifyLog), { recursive: true });
        const ts = new Date().toISOString();
        const entry = [
          `### [${ts}] ${title}`,
          `> ${message.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}`,
          ``,
          `*info · memory-pipeline | Channels: os*`,
          ``,
          `---`,
          ``,
        ].join('\n');
        const existing = fs.existsSync(notifyLog) ? fs.readFileSync(notifyLog, 'utf8') : '';
        fs.writeFileSync(notifyLog, entry + existing);
      } catch { /* best effort log */ }

      // 2. Fire the OS popup
      try {
        execFileSync('terminal-notifier', [
          '-title', title,
          '-message', message,
          '-open', `file://${notifyLog}`,
          '-actions', 'View Log',
          '-closeLabel', 'Dismiss',
          '-group', 'total-recall-pipeline'
        ], { stdio: 'ignore' });
      } catch {
        execFileSync('osascript', [
          '-e',
          `display notification "${message.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}" with title "${title.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
        ], { stdio: 'ignore' });
      }
    } catch { /* best effort */ }

    // Also use the notification skill if available
    try {
      const notifyPath = path.join(root, NOTIFY_SCRIPT);
      const fs = await import('fs');
      if (fs.existsSync(notifyPath)) {
        const { spawn: spawnNotify } = await import('child_process');
        spawnNotify('node', [notifyPath, title, message], { stdio: 'ignore', detached: true }).unref();
      }
    } catch { /* best effort */ }
  }

  process.exit(allSuccess ? 0 : 1);
}

main().catch(err => {
  console.error('❌ Pipeline error:', err.message);
  process.exit(1);
});
