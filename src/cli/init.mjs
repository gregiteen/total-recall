/**
 * total-recall init
 *
 * Bootstrap Total Recall into an existing project repository.
 * Runs in the current working directory (cwd).
 *
 * What it does:
 *   1. Creates .agent/memory-vault/<categories>/ directory structure
 *   2. Creates .agent/skills/ and seeds the core SSSS skill
 *   3. Copies default invariant memory nodes from the scaffold
 *   4. Runs compile to inject the Total Recall memory block into any
 *      existing IDE instruction files (GEMINI.md, .cursorrules, CLAUDE.md,
 *      AGENTS.md, .clauderules) non-destructively, or creates INSTRUCTIONS.md
 *      + symlinks if they don't exist yet.
 *
 * Usage:
 *   npx total-recall init [options]
 *
 * Options:
 *   --dry-run     Print what would be done without making changes
 *   --help        Show this help
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { exec, spawn, spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');

// ─── Helpers ────────────────────────────────────────────────────────────────

function log(msg)      { console.error(`  ${msg}`); }
function logStep(n, msg) { console.error(`\n  [${n}] ${msg}`); }
function logOk(msg)    { console.error(`  ✅ ${msg}`); }
function logSkip(msg)  { console.error(`  ⏭  ${msg} (already exists)`); }
function logWarn(msg)  { console.error(`  ⚠️  ${msg}`); }

function ensureDir(dirPath, dryRun) {
  if (fs.existsSync(dirPath)) return false;
  if (!dryRun) fs.mkdirSync(dirPath, { recursive: true });
  return true;
}

function copyFile(src, dest, dryRun) {
  if (fs.existsSync(dest)) {
    logSkip(path.basename(dest));
    return false;
  }
  if (!dryRun) fs.copyFileSync(src, dest);
  logOk(`Installed ${path.relative(process.cwd(), dest)}`);
  return true;
}

function copyDirMerge(src, dest, dryRun) {
  if (!fs.existsSync(src)) return;
  ensureDir(dest, dryRun);
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirMerge(srcPath, destPath, dryRun);
    } else {
      copyFile(srcPath, destPath, dryRun);
    }
  }
}

function parseArgs(args) {
  const opts = { dryRun: false, help: false, brain: null, token: null };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--help' || arg === '-h') opts.help = true;
    else if (arg === '--brain') opts.brain = args[++i];
    else if (arg === '--token') opts.token = args[++i];
  }
  return opts;
}

function printHelp() {
  console.log(`
  total-recall init — Bootstrap Total Recall into an existing project repo

  Run this command from inside your project directory.

  Usage: total-recall init [options]

  Options:
    --dry-run     Print what would be done without making changes
    --help, -h    Show this help

  What it does:
    1. Creates .agent/memory-vault/ with the full SSSS category directory layout
    2. Seeds the SSSS skill into .agent/skills/ssss/
    3. Copies core operating invariant memory nodes from the scaffold
    4. Runs compile — injects the Total Recall memory block into any existing
       IDE instruction files (GEMINI.md, .cursorrules, CLAUDE.md, AGENTS.md,
       .clauderules) without overwriting them. If none exist, creates
       INSTRUCTIONS.md and the standard IDE symlinks.

  Example:
    cd ~/my-project
    npx total-recall init
`);
}

// ─── Main ───────────────────────────────────────────────────────────────────

export default async function init(args) {
  const opts = parseArgs(args);
  if (opts.help) { printHelp(); return; }

  const cwd = process.cwd();
  const agentDir = path.join(cwd, '.agent');
  const brainDir = path.join(agentDir, 'skills', 'total-recall');
  let passwordMessage = "";

  console.error(`
  ┌─────────────────────────────────────────────────────────┐
  │  Total Recall Init                                       │
  │  Bootstrapping into: ${cwd.slice(0, 36).padEnd(36)}  │
  └─────────────────────────────────────────────────────────┘
`);

  if (opts.dryRun) logWarn('DRY RUN — no changes will be made\n');

  // ── Step 1: Create .agent/ directory layout ──
  logStep('1/4', 'Creating .agent/ directory structure');

  const dirs = [
    path.join(agentDir, 'skills'),
  ];

  let created = 0;
  for (const dir of dirs) {
    const wasCreated = ensureDir(dir, opts.dryRun);
    if (wasCreated) {
      if (opts.dryRun) log(`  mkdir ${path.relative(cwd, dir)}`);
      created++;
    }
  }
  logOk(`Base directory structure ready (${created} created, ${dirs.length - created} already existed)`);

  // ── Step 2: Seed core skills ──
  logStep('2/4', 'Installing core skills into .agent/skills/');

  const scaffoldSkillsDir = path.join(ROOT, 'scaffold', '.agent', 'skills');
  let skillsToSeed = ['total-recall'];
  if (fs.existsSync(scaffoldSkillsDir)) {
    try {
      skillsToSeed = fs.readdirSync(scaffoldSkillsDir).filter(f => fs.statSync(path.join(scaffoldSkillsDir, f)).isDirectory());
    } catch { /* fallback to default */ }
  }

  for (const skill of skillsToSeed) {
    const skillSrc = path.join(scaffoldSkillsDir, skill);
    const skillDest = path.join(agentDir, 'skills', skill);

    if (!fs.existsSync(skillSrc)) {
      logWarn(`${skill} skill source not found — skipping.`);
    } else {
      copyDirMerge(skillSrc, skillDest, opts.dryRun);
      logOk(`${skill} skill installed`);
    }
  }

  // ── Step 2.5: Create data directories inside the meta-skill (brain dir) ──
  logStep('2.5/4', 'Creating user data directories inside meta-skill');

  const vaultCategories = [
    'invariants', 'patterns', 'anti-patterns',
    'preferences', 'decisions', 'concepts'
  ];

  const dataDirs = [
    path.join(brainDir, 'memory-derived'),
    path.join(brainDir, 'memory-inbox', 'pending'),
    path.join(brainDir, 'memory-inbox', 'conflicts'),
    path.join(brainDir, 'sessions'),
    ...vaultCategories.map(c => path.join(brainDir, 'memory-vault', c))
  ];

  let dataCreated = 0;
  for (const dir of dataDirs) {
    const wasCreated = ensureDir(dir, opts.dryRun);
    if (wasCreated) {
      if (opts.dryRun) log(`  mkdir ${path.relative(cwd, dir)}`);
      dataCreated++;
    }
  }
  logOk(`Data directories ready (${dataCreated} created inside meta-skill)`);

  // ── Step 3: Copy default memory vault nodes ──
  logStep('3/4', 'Seeding default memory vault nodes');

  const scaffoldVaultSrc = path.join(ROOT, 'scaffold', '.agent', 'memory-vault');
  const localVaultDest = path.join(brainDir, 'memory-vault');

  if (!fs.existsSync(scaffoldVaultSrc)) {
    logWarn('Scaffold memory vault not found — skipping.');
  } else {
    copyDirMerge(scaffoldVaultSrc, localVaultDest, opts.dryRun);
    logOk('Default memory vault seeded');
  }

  // ── Step 3.5: Seed the onboarding interview task ──
  logStep('3.5/4', 'Seeding onboarding interview into scheduler queue');

  const queueDir = path.join(brainDir, 'scheduler', 'queue');
  const interviewDest = path.join(queueDir, 'onboarding-interview.md');
  const interviewSrc = path.join(ROOT, 'templates', 'onboarding-interview.md');

  if (!fs.existsSync(interviewDest)) {
    if (!opts.dryRun) {
      fs.mkdirSync(queueDir, { recursive: true });
      if (fs.existsSync(interviewSrc)) {
        const now = new Date().toISOString();
        const content = fs.readFileSync(interviewSrc, 'utf8').replace(/\{\{CREATED_AT\}\}/g, now);
        fs.writeFileSync(interviewDest, content);
        logOk('Onboarding interview task queued — agent will conduct it on first chat');
      } else {
        logWarn('Interview template not found — skipping');
      }
    } else {
      log(`  Would write ${path.relative(cwd, interviewDest)}`);
    }
  } else {
    logSkip('onboarding-interview.md already in queue');
  }

  // ── Step 3.6: Ensure Default Dashboard Password ──
  if (!opts.dryRun) {
    const configDir = path.join(brainDir, "config");
    const securityPath = path.join(configDir, "security.yml");
    try {
      fs.mkdirSync(configDir, { recursive: true });
      const { default: bcrypt } = await import("bcrypt");
      const { default: yaml } = await import("yaml");

      let config = {};
      if (fs.existsSync(securityPath)) {
        try {
          config = yaml.parse(fs.readFileSync(securityPath, "utf8")) || {};
        } catch {
          config = {};
        }
      }

      config.dashboard ??= {};
      config.api ??= { pats: [], allow_static_pats: false };
      config.network ??= { require_https: true, public_health: false, allowed_origins: [] };
      config.bind ??= { host: "127.0.0.1", port: 3000, allow_public_bind: false };

      if (!config.dashboard.password_hash) {
        const defaultPassword = "totalrecall";
        const hash = bcrypt.hashSync(defaultPassword, 12);
        config.dashboard.password_hash = hash;
        config.dashboard.force_password_reset = true;
        fs.writeFileSync(securityPath, yaml.stringify(config), { encoding: "utf8", mode: 0o600 });
        passwordMessage = "\n  🔑 Temporary Login Password: \"totalrecall\"\n     (You will be forced to change it upon first login)";
      } else {
        passwordMessage = "\n  🔑 Dashboard credentials preserved (custom password hash already configured)";
      }
    } catch (err) {
      logWarn(`Failed to seed default dashboard credentials: ${err.message}`);
    }
  }

  // ── Step 4: Run compile to inject memory block into existing IDE files ──
  logStep('4/4', 'Compiling vault and injecting into IDE instruction files');

  if (opts.dryRun) {
    log('  Would run: total-recall compile (targeting current directory)');
    logOk('Dry run complete. Run without --dry-run to apply changes.');
    return;
  }

  const instructionsFile = path.join(cwd, 'INSTRUCTIONS.md');
  const vaultDir = path.join(brainDir, 'memory-vault');
  const skillsDir = path.join(agentDir, 'skills');
  const derivedDir = path.join(brainDir, 'memory-derived');

  try {
    const { compileSurface } = await import('../core/surface.mjs');
    const result = await compileSurface({ vaultDir, skillsDir, derivedDir, instructionsFile });
    logOk(`Compile complete — ${result.nodesProcessed} nodes processed`);
  } catch (err) {
    logWarn(`Compile failed: ${err.message}`);
    logWarn('You can run `npx total-recall compile` manually once the issue is resolved.');
  }


  // ── Optional: register a remote brain for hybrid mode ──
  if (opts.brain) {
    const cfgDir = path.join(brainDir, 'config');
    fs.mkdirSync(cfgDir, { recursive: true });
    const brainCfg = { url: opts.brain };
    if (opts.token) brainCfg.token = opts.token;
    fs.writeFileSync(path.join(cfgDir, 'brain.json'), JSON.stringify(brainCfg, null, 2), { mode: 0o600 });
    logOk(`Registered brain at ${opts.brain}. Run \`npx total-recall sync\` to pull instructions.`);
  }

  let dashboardUrl = "";

  // ── Automatic Cloudflare Quick Tunnel Spawner ──
  let hasCloudflared = false;
  try {
    const whichCf = spawnSync("which", ["cloudflared"], { encoding: "utf8" });
    if (whichCf.status === 0 && whichCf.stdout?.trim()) {
      hasCloudflared = true;
    } else if (fs.existsSync("/usr/local/bin/cloudflared")) {
      hasCloudflared = true;
    }
  } catch {
    if (fs.existsSync("/usr/local/bin/cloudflared")) {
      hasCloudflared = true;
    }
  }

  if (hasCloudflared) {
    log("Cloudflared detected. Spawning background Quick Tunnel...");
    const logsDir = path.join(agentDir, "logs");
    if (!opts.dryRun) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    const cfLogPath = path.join(logsDir, "cloudflared.log");
    
    if (!opts.dryRun) {
      try {
        if (fs.existsSync(cfLogPath)) {
          fs.unlinkSync(cfLogPath);
        }
      } catch {}
      
      const logStream = fs.openSync(cfLogPath, "w");
      let port = 3000;
      try {
        const { default: cfg } = await import("../core/config.mjs");
        if (cfg.port) port = cfg.port;
      } catch {}

      const cfProcess = spawn("cloudflared", ["tunnel", "--url", `http://localhost:${port}`], {
        detached: true,
        stdio: ["ignore", logStream, logStream]
      });
      cfProcess.unref();

      log("Waiting for Cloudflare Quick Tunnel URL allocation...");
      let tunnelUrl = "";
      for (let attempt = 0; attempt < 20; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 500));
        if (fs.existsSync(cfLogPath)) {
          const logs = fs.readFileSync(cfLogPath, "utf8");
          const match = logs.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
          if (match) {
            tunnelUrl = match[0];
            break;
          }
        }
      }

      if (tunnelUrl) {
        logOk(`Cloudflare Quick Tunnel Active: ${tunnelUrl}`);
        
        const configDir = path.join(os.homedir(), ".agent", "config");
        const configFile = path.join(configDir, "wizard-config.json");
        fs.mkdirSync(configDir, { recursive: true });
        
        let current = {};
        if (fs.existsSync(configFile)) {
          try {
            current = JSON.parse(fs.readFileSync(configFile, "utf8") || "{}");
          } catch {}
        }
        current["cfg-domain"] = tunnelUrl.replace("https://", "");
        current["cfg-api-url"] = tunnelUrl;
        current["cfg-dash-url"] = `${tunnelUrl}/dashboard`;
        current["cfg-health-url"] = `${tunnelUrl}/health`;
        
        fs.writeFileSync(configFile, JSON.stringify(current, null, 2), { encoding: "utf8", mode: 0o600 });
        logOk("Registered Quick Tunnel URL in wizard-config.json!");
        dashboardUrl = `${tunnelUrl}/`;
      } else {
        logWarn("Could not extract Cloudflare Quick Tunnel URL. Falling back to local configuration.");
      }
    }
  }

  // 1. Try opts.brain
  if (!dashboardUrl && opts.brain) {
    dashboardUrl = opts.brain;
  }

  // 2. Try process.env.TR_BRAIN
  if (!dashboardUrl && process.env.TR_BRAIN) {
    dashboardUrl = process.env.TR_BRAIN;
  }

  // 3. Try ~/.agent/config/wizard-config.json (Cloudflare remote URL)
  if (!dashboardUrl) {
    const wizardConfigPath = path.join(os.homedir(), ".agent", "config", "wizard-config.json");
    if (fs.existsSync(wizardConfigPath)) {
      try {
        const wizardCfg = JSON.parse(fs.readFileSync(wizardConfigPath, "utf8"));
        if (wizardCfg["cfg-dash-url"]) {
          dashboardUrl = wizardCfg["cfg-dash-url"];
        } else if (wizardCfg["cfg-api-url"]) {
          dashboardUrl = wizardCfg["cfg-api-url"];
        }
      } catch {
        // Ignored
      }
    }
  }

  // 4. Try ~/.agent/config/brain.json
  if (!dashboardUrl) {
    const brainJsonPath = path.join(agentDir, "config", "brain.json");
    if (fs.existsSync(brainJsonPath)) {
      try {
        const brainCfg = JSON.parse(fs.readFileSync(brainJsonPath, "utf8"));
        if (brainCfg.url) {
          dashboardUrl = brainCfg.url;
        }
      } catch {
        // Ignored
      }
    }
  }

  // 5. Fallback to localhost:port
  if (!dashboardUrl) {
    try {
      const { default: cfg } = await import("../core/config.mjs");
      const displayHost = cfg.host === "127.0.0.1" || cfg.host === "0.0.0.0" ? "localhost" : cfg.host;
      dashboardUrl = `http://${displayHost}:${cfg.port}/`;
    } catch {
      dashboardUrl = "http://localhost:3000/";
    }
  }

  // Normalize dashboardUrl
  if (dashboardUrl && !dashboardUrl.endsWith("/")) {
    dashboardUrl += "/";
  }

  console.error(`
  ✅ Total Recall initialized!
  ${passwordMessage}

  Your .agent/ directory is ready. Here is what was set up:
    .agent/memory-vault/    ← Your SSSS memory vault (Tier 3)
    .agent/skills/ssss/     ← SSSS schema reference skill (Tier 2)

  IDE instruction files have been updated with the Total Recall memory block.
  Existing content in GEMINI.md, .cursorrules, CLAUDE.md etc. was preserved.

  🖥️  Dashboard UI:
     ${dashboardUrl}

  Next steps:
    1. Run \`npx total-recall compile\` any time to rebuild the memory surface.
    2. Add memory nodes under .agent/memory-vault/<category>/<slug>.md
       (Read .agent/skills/ssss/SKILL.md for the exact SSSS schema.)
    3. Run \`npx total-recall daemon start\` to enable the background Dream Cycle.
`);

  // Automatically open the Dashboard UI in the user's browser
  log("Launching Dashboard UI Walkthrough in your browser...");
  const startCmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  exec(`${startCmd} "${dashboardUrl}"`, (err) => {
    // Silently ignore browser opening failures
  });
}
