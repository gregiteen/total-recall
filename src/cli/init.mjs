/**
 * total-recall init
 *
 * Bootstrap Total Recall with a layered brain architecture.
 *
 * Two modes:
 *   1. `npx total-recall init` (default) — creates the GLOBAL brain at
 *      ~/.agent/skills/total-recall/. This holds identity: universal
 *      preferences, invariants, corrections, coding principles.
 *
 *   2. `npx total-recall init --project` — creates a PROJECT brain at
 *      <cwd>/.agent/skills/total-recall/. This holds project-specific
 *      knowledge: facts, decisions, architecture patterns.
 *      Also registers the project in the global brain's project registry.
 *
 * Both modes seed core skills, default memory nodes, and compile
 * IDE instruction files (GEMINI.md, .cursorrules, CLAUDE.md, etc.)
 *
 * Usage:
 *   npx total-recall init [options]
 *
 * Options:
 *   --project     Create a project-level brain in the current directory
 *   --dry-run     Print what would be done without making changes
 *   --help        Show this help
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { exec, spawn, spawnSync } from 'node:child_process';
import { projectSkillsForScope, detectActiveSkillTargets } from './skill-projection.mjs';

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
  const opts = {
    dryRun: false,
    help: false,
    brain: null,
    token: null,
    project: false,
    deployMode: null,
    domain: null,
    tunnelName: null,
    tunnelCredentials: null,
    yes: false,
    force: false
  };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--help' || arg === '-h') opts.help = true;
    else if (arg === '--project') opts.project = true;
    else if (arg === '--brain') opts.brain = args[++i];
    else if (arg === '--token') opts.token = args[++i];
    else if (arg === '--deploy-mode') opts.deployMode = args[++i];
    else if (arg === '--domain') opts.domain = args[++i];
    else if (arg === '--tunnel-name') opts.tunnelName = args[++i];
    else if (arg === '--tunnel-credentials') opts.tunnelCredentials = args[++i];
    else if (arg === '--yes' || arg === '-y') opts.yes = true;
    else if (arg === '--force') opts.force = true;
  }
  return opts;
}

function printHelp() {
  console.log(`
  total-recall init — Bootstrap Total Recall with layered brain architecture

  Usage: total-recall init [options]

  Modes:
    (default)     Create the GLOBAL brain at ~/.agent/skills/total-recall/
                  Holds: universal preferences, invariants, corrections, coding principles
    --project     Create a PROJECT brain at <cwd>/.agent/skills/total-recall/
                  Holds: project-specific facts, decisions, architecture patterns
                  Also registers the project in the global brain's project registry.

  Options:
    --deploy-mode <mode>  Set the UI deploy mode (local | quick-tunnel | named-tunnel | custom-domain)
    --domain <domain>     Domain for custom-domain/named-tunnel mode
    --tunnel-name <name>  Name of the Cloudflare tunnel for named-tunnel mode
    --tunnel-credentials <path> Path to credentials JSON for named-tunnel mode
    --yes, -y             Skip interactive prompts and use defaults
    --dry-run             Print what would be done without making changes
    --help, -h            Show this help

  Interactive Scaffolding Prompts (when run without --yes):
    - UI Deploy Mode (Local, Cloudflare Tunnel, Custom Domain)
    - OpenWiki Initialization (auto-document codebase)
    - OKF Knowledge Bundle Import

  Examples:
    npx total-recall init              # Global brain (run once)
    npx total-recall init --project    # Project brain (run per project)
`);
}

// ─── Main ───────────────────────────────────────────────────────────────────

export default async function init(args) {
  const opts = parseArgs(args);
  if (opts.help) { printHelp(); return; }

  const cwd = process.cwd();
  const globalAgentDir = path.join(os.homedir(), '.agent');
  const globalBrainDir = path.join(globalAgentDir, 'skills', 'total-recall');

  // Determine target based on --project flag
  const isProject = opts.project;
  const agentDir = isProject ? path.join(cwd, '.agent') : globalAgentDir;
  const brainDir = isProject ? path.join(agentDir, 'skills', 'total-recall') : globalBrainDir;
  const layerLabel = isProject ? 'PROJECT' : 'GLOBAL';
  const targetPath = isProject ? cwd : os.homedir();
  let passwordMessage = "";

  console.error(`
  ┌─────────────────────────────────────────────────────────┐
  │  Total Recall Init (${layerLabel.padEnd(7)})                         │
  │  Bootstrapping into: ${targetPath.slice(0, 36).padEnd(36)}  │
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

  const scaffoldVaultSrc = path.join(ROOT, 'scaffold', '.agent', 'skills', 'total-recall', 'memory-vault');
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

  // ── Restore credentials from backup if present ──
  let restoredPasswordHash = null;
  if (!opts.dryRun) {
    const backupSecretsPath = path.join(agentDir, 'secrets.enc');
    if (fs.existsSync(backupSecretsPath)) {
      try {
        const configDir = path.join(brainDir, 'config');
        fs.mkdirSync(configDir, { recursive: true });
        
        // Copy secrets.enc to brainDir/config/secrets.enc
        const destSecretsPath = path.join(configDir, 'secrets.enc');
        fs.copyFileSync(backupSecretsPath, destSecretsPath);
        
        // Read to see if password hash is present
        const secretsObj = JSON.parse(fs.readFileSync(destSecretsPath, 'utf8') || '{}');
        if (secretsObj.dashboard_password_hash) {
          restoredPasswordHash = secretsObj.dashboard_password_hash;
          // Strip password hash from the copied secrets.enc to keep secrets.enc clean
          delete secretsObj.dashboard_password_hash;
          fs.writeFileSync(destSecretsPath, JSON.stringify(secretsObj, null, 2), { encoding: 'utf8', mode: 0o600 });
        }
        logOk('Restored saved API keys and credentials from persistent backup!');
      } catch (err) {
        logWarn(`Failed to restore credentials from backup: ${err.message}`);
      }
    }
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

      if (restoredPasswordHash && !config.dashboard.password_hash) {
        config.dashboard.password_hash = restoredPasswordHash;
      }

      if (!config.dashboard.password_hash) {
        fs.writeFileSync(securityPath, yaml.stringify(config), { encoding: "utf8", mode: 0o600 });
        passwordMessage = "\n  🔑 Dashboard Access: Unconfigured\n     (You will be prompted to set your password upon first browser access)";
      } else {
        fs.writeFileSync(securityPath, yaml.stringify(config), { encoding: 'utf8', mode: 0o600 });
        passwordMessage = '\n  🔑 Dashboard credentials preserved (custom password hash already configured)';
      }
    } catch (err) {
      logWarn(`Failed to seed default dashboard credentials: ${err.message}`);
    }
  }

  // ── Step 3.7: Select UI Deploy Location ──
  let deployMode = opts.deployMode;
  let domain = opts.domain;
  let tunnelName = opts.tunnelName;
  let tunnelCredentials = opts.tunnelCredentials;

  const isInteractive = process.stdin.isTTY && !opts.yes && !opts.dryRun;

  if (isInteractive && !deployMode) {
    const rl = (await import('node:readline')).createInterface({
      input: process.stdin,
      output: process.stdout
    });
    const ask = (query) => new Promise(resolve => rl.question(query, resolve));

    console.error('\n  [3.7] How would you like to access your dashboard?');
    console.error('    1. Local only (http://localhost:3000)');
    console.error('    2. Cloudflare Quick Tunnel (random public URL, changes on restart)');
    console.error('    3. Cloudflare Named Tunnel (permanent subdomain, requires cloudflare auth)');
    console.error('    4. Custom domain (you provide the domain, uses Caddy for TLS)');

    let choice = '';
    while (true) {
      const answer = (await ask('\n  Choice [1]: ')).trim();
      if (!answer) {
        choice = '1';
        break;
      }
      if (['1', '2', '3', '4'].includes(answer)) {
        choice = answer;
        break;
      }
      console.error('  Invalid choice. Please enter 1, 2, 3, or 4.');
    }

    if (choice === '1') {
      deployMode = 'local';
    } else if (choice === '2') {
      deployMode = 'quick-tunnel';
    } else if (choice === '3') {
      deployMode = 'named-tunnel';
      while (!tunnelName) {
        tunnelName = (await ask('  Enter Cloudflare Tunnel Name: ')).trim();
      }
      while (!tunnelCredentials) {
        tunnelCredentials = (await ask('  Enter Cloudflare Tunnel Credentials Path: ')).trim();
      }
      while (!domain) {
        domain = (await ask('  Enter Public Domain mapped to this tunnel: ')).trim();
      }
    } else if (choice === '4') {
      deployMode = 'custom-domain';
      while (!domain) {
        domain = (await ask('  Enter Custom Domain (e.g. brain.mydomain.com): ')).trim();
      }
    }

    const runOpenwiki = (await ask('\n  [3.8] Would you like to initialize OpenWiki for auto-documentation? (Y/n): ')).trim().toLowerCase();
    if (runOpenwiki !== 'n' && runOpenwiki !== 'no') {
      console.error('\n  Starting OpenWiki interactive setup...');
      spawnSync('npx', ['-y', 'openwiki', '--init'], { stdio: 'inherit', cwd: process.cwd() });
    }

    const runOkf = (await ask('\n  [3.9] Would you like to import an existing OKF knowledge bundle? (y/N): ')).trim().toLowerCase();
    if (runOkf === 'y' || runOkf === 'yes') {
      const bundlePath = (await ask('  Enter path to OKF bundle: ')).trim();
      if (bundlePath) {
        spawnSync('npx', ['-y', 'total-recall', 'ingest', 'okf', bundlePath], { stdio: 'inherit', cwd: process.cwd() });
      }
    }

    rl.close();
  } else {
    if (!deployMode) {
      deployMode = 'local';
    }
    if (!opts.dryRun) {
      console.error('\n  Starting OpenWiki automatic setup...');
      spawnSync('npx', ['-y', 'openwiki', '--init', '--yes'], { stdio: 'inherit', cwd: process.cwd() });
    }
  }

  // Verify cloudflared binary dependency if a tunnel mode is selected
  if (['quick-tunnel', 'named-tunnel'].includes(deployMode)) {
    let hasCf = false;
    try {
      const whichCf = spawnSync('which', ['cloudflared'], { encoding: 'utf8' });
      if (whichCf.status === 0 && whichCf.stdout?.trim()) {
        hasCf = true;
      } else if (fs.existsSync('/usr/local/bin/cloudflared')) {
        hasCf = true;
      }
    } catch {
      if (fs.existsSync('/usr/local/bin/cloudflared')) {
        hasCf = true;
      }
    }

    if (!hasCf) {
      logWarn('Cloudflare Tunnel mode selected, but `cloudflared` was not found in your PATH.');
      if (process.platform === 'darwin') {
        console.error('\n  To install via Homebrew, run:');
        console.error('    brew install cloudflare/cloudflare/cloudflared\n');
      } else {
        console.error('\n  To install, please refer to Cloudflare\'s guide:');
        console.error('    https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/\n');
      }

      if (isInteractive) {
        const rl = (await import('node:readline')).createInterface({
          input: process.stdin,
          output: process.stdout
        });
        const ask = (query) => new Promise(resolve => rl.question(query, resolve));
        const proceed = (await ask('  Proceed anyway? (y/N): ')).trim().toLowerCase();
        rl.close();
        if (proceed !== 'y' && proceed !== 'yes') {
          console.error('  Aborting setup.');
          process.exit(1);
        }
      } else {
        logWarn('Proceeding in non-interactive mode. Tunnels will fail to spawn until cloudflared is installed.');
      }
    }
  }

  // Persist UI deploy settings to wizard-config.json
  if (!opts.dryRun) {
    const configDir = path.join(brainDir, 'config');
    const configFile = path.join(configDir, 'wizard-config.json');
    fs.mkdirSync(configDir, { recursive: true });

    let current = {};
    if (fs.existsSync(configFile)) {
      try {
        current = JSON.parse(fs.readFileSync(configFile, 'utf8') || '{}');
      } catch {}
    }

    current['deploy-mode'] = deployMode;
    current['tunnel-auto-start'] = ['quick-tunnel', 'named-tunnel'].includes(deployMode);

    if (deployMode === 'named-tunnel') {
      current['cfg-cloudflare-tunnel-name'] = tunnelName;
      current['cfg-cloudflare-tunnel-credentials'] = tunnelCredentials;
      if (domain) {
        current['cfg-domain'] = domain;
        current['cfg-api-url'] = `https://${domain}`;
        current['cfg-dash-url'] = `https://${domain}/`;
        current['cfg-health-url'] = `https://${domain}/health`;
      }
    } else if (deployMode === 'custom-domain') {
      current['cfg-domain'] = domain;
      current['cfg-api-url'] = `https://${domain}`;
      current['cfg-dash-url'] = `https://${domain}/`;
      current['cfg-health-url'] = `https://${domain}/health`;
    } else if (deployMode === 'local') {
      current['cfg-domain'] = 'localhost';
      current['cfg-api-url'] = 'http://localhost:3000';
      current['cfg-dash-url'] = 'http://localhost:3000/';
      current['cfg-health-url'] = 'http://localhost:3000/health';
    }

    fs.writeFileSync(configFile, JSON.stringify(current, null, 2), { encoding: 'utf8', mode: 0o600 });
    logOk('UI deploy configuration persisted to wizard-config.json!');
  }

  // ── Symlink nested brain skills to top-level .agent/skills/ ──
  // Skills inside the brain (e.g. .agent/skills/total-recall/skills/tr-ssss/) are
  // invisible to IDEs because they only scan .agent/skills/<name>/ one level
  // deep. Create symlinks so they appear as slash commands.
  const nestedSkillsDir = path.join(brainDir, 'skills');
  if (fs.existsSync(nestedSkillsDir)) {
    const topSkillsDir = path.join(agentDir, 'skills');
    for (const entry of fs.readdirSync(nestedSkillsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const target = path.join(topSkillsDir, entry.name);
      const source = path.join(nestedSkillsDir, entry.name);
      if (fs.existsSync(target)) continue; // don't clobber existing top-level skills
      if (!opts.dryRun) {
        try {
          fs.symlinkSync(source, target);
          logOk(`Symlinked nested skill: ${entry.name} → IDE-visible`);
        } catch (err) {
          logWarn(`Could not symlink skill "${entry.name}": ${err.message}`);
        }
      } else {
        log(`  Would symlink ${entry.name} → ${target}`);
      }
    }
  }

  // ── Step 3.7: Project skills as slash commands into the IDEs in use ──
  // Scope matches the brain: `init --project` projects PROJECT skills into the
  // repo's IDE skill dirs for IDEs actually used here (.claude/, .agents/, or
  // the current process); `init` projects GLOBAL skills into installed IDEs'
  // global skill dirs. Codex (global-only) is opt-in for project skills.
  const skillScope = isProject ? 'project' : 'global';
  logStep('3.7/4', `Projecting ${skillScope} skills as slash commands (IDEs in use)`);
  if (opts.dryRun) {
    const targets = detectActiveSkillTargets({ scope: skillScope, cwd });
    for (const t of targets.filter(t => t.supported)) {
      const destLabel = t.destDir ? path.relative(cwd, t.destDir) || t.destDir : '(n/a)';
      log(`  ${t.active ? 'would wire' : 'available (opt-in)'}: ${t.label} → ${destLabel}/`);
    }
  } else {
    try {
      const { skills, wired, available } = projectSkillsForScope({
        scope: skillScope, cwd, agentDir, opts: { force: opts.force }
      });
      if (skills.length === 0) {
        log('  No skills found yet — author one under .agent/skills/<name>/SKILL.md');
      } else if (wired.length === 0) {
        log(`  No in-use IDE detected for ${skillScope} skills — run \`npx total-recall connect <ide>\` to wire them.`);
      } else {
        for (const t of wired) {
          const n = t.results.filter(r => ['linked', 'exists', 'source'].includes(r.action)).length;
          logOk(`${t.label}: ${n} skill(s) → ${path.relative(cwd, t.destDir) || t.destDir}/`);
        }
        log(`  Slash commands: ${skills.map(s => '/' + s.name).join(', ')}`);
        if (available.length > 0) {
          log(`  Also available (opt-in): ${available.map(t => t.clients.join('/')).join(', ')} — \`npx total-recall connect <ide>\``);
        }
      }
    } catch (err) {
      logWarn(`Could not project skills into IDEs: ${err.message}`);
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
    if (result.semanticUnavailable) {
      logWarn("Semantic index build is temporarily unavailable (missing API credentials or Ollama offline).");
      logWarn("Please set GOOGLE_API_KEY or OPENAI_API_KEY, or run 'npx total-recall setup' later to enable full semantic search.");
    }
    logOk(`Compile complete — ${result.nodesProcessed} nodes processed`);
  } catch (err) {
    logWarn(`❌ Initialization aborted due to critical error: ${err.message}`);
    process.exit(1);
  }

  // ── Optional: register a remote brain for hybrid mode ──
  if (opts.brain) {
    const cfgDir = path.join(brainDir, 'config');
    fs.mkdirSync(cfgDir, { recursive: true });
    const brainCfg = { url: opts.brain };
    if (opts.token) brainCfg.token = opts.token;
    fs.writeFileSync(path.join(cfgDir, 'brain.json'), JSON.stringify(brainCfg, null, 2), { mode: 0o600 });
    logOk(`Registered brain at ${opts.brain}. Run \`npx total-recall sync\` to pull instructions.`);
  } else {
    // Zero-config bootstrap: auto-generate localhost brain.json and valid Developer PAT out-of-the-box
    const cfgDir = path.join(brainDir, 'config');
    fs.mkdirSync(cfgDir, { recursive: true });
    const brainJsonPath = path.join(cfgDir, 'brain.json');
    let needsBootstrap = false;
    let brainCfg = {};
    if (fs.existsSync(brainJsonPath)) {
      try {
        brainCfg = JSON.parse(fs.readFileSync(brainJsonPath, 'utf8'));
        if (!brainCfg.url || !brainCfg.token) needsBootstrap = true;
      } catch {
        needsBootstrap = true;
      }
    } else {
      needsBootstrap = true;
    }

    if (needsBootstrap) {
      try {
        const { issueKey } = await import('../server/keys.mjs');
        const keyData = issueKey('Default Local Developer Key', { scopes: ['*'] });
        brainCfg.url = brainCfg.url || 'http://localhost:3000';
        brainCfg.token = brainCfg.token || keyData.token;
        fs.writeFileSync(brainJsonPath, JSON.stringify(brainCfg, null, 2), { mode: 0o600 });
        logOk(`Bootstrap configuration successfully generated and pre-authorized at ${brainCfg.url}`);
      } catch (err) {
        logWarn(`Could not auto-generate bootstrap developer key: ${err.message}`);
      }
    }
  }

  let dashboardUrl = '';

  // ── Automatic Cloudflare Quick Tunnel Spawner ──
  if (deployMode === 'quick-tunnel') {
    let hasCloudflared = false;
    try {
      const whichCf = spawnSync('which', ['cloudflared'], { encoding: 'utf8' });
      if (whichCf.status === 0 && whichCf.stdout?.trim()) {
        hasCloudflared = true;
      } else if (fs.existsSync('/usr/local/bin/cloudflared')) {
        hasCloudflared = true;
      }
    } catch {
      if (fs.existsSync('/usr/local/bin/cloudflared')) {
        hasCloudflared = true;
      }
    }

    if (hasCloudflared) {
      log('Cloudflared detected. Spawning background Quick Tunnel...');
      const logsDir = path.join(brainDir, 'logs');
      if (!opts.dryRun) {
        fs.mkdirSync(logsDir, { recursive: true });
      }
      const cfLogPath = path.join(logsDir, 'cloudflared.log');
      
      if (!opts.dryRun) {
        try {
          if (fs.existsSync(cfLogPath)) {
            fs.unlinkSync(cfLogPath);
          }
        } catch {}
        
        const logStream = fs.openSync(cfLogPath, 'w');
        let port = 3000;
        try {
          const { default: cfg } = await import('../core/config.mjs');
          if (cfg.port) port = cfg.port;
        } catch {}

        const cfProcess = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${port}`], {
          detached: true,
          stdio: ['ignore', logStream, logStream]
        });

        const cfPidPath = path.join(logsDir, 'cloudflared.pid');
        fs.writeFileSync(cfPidPath, String(cfProcess.pid), 'utf8');

        cfProcess.unref();

        log('Waiting for Cloudflare Quick Tunnel URL allocation...');
        let tunnelUrl = '';
        for (let attempt = 0; attempt < 20; attempt++) {
          await new Promise(resolve => setTimeout(resolve, 500));
          if (fs.existsSync(cfLogPath)) {
            const logs = fs.readFileSync(cfLogPath, 'utf8');
            const match = logs.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
            if (match) {
              tunnelUrl = match[0];
              break;
            }
          }
        }

        if (tunnelUrl) {
          logOk(`Cloudflare Quick Tunnel Active: ${tunnelUrl}`);
          
          const configDir = path.join(brainDir, 'config');
          const configFile = path.join(configDir, 'wizard-config.json');
          fs.mkdirSync(configDir, { recursive: true });
          
          let current = {};
          if (fs.existsSync(configFile)) {
            try {
              current = JSON.parse(fs.readFileSync(configFile, 'utf8') || '{}');
            } catch {}
          }
          current['cfg-domain'] = tunnelUrl.replace('https://', '');
          current['cfg-api-url'] = tunnelUrl;
          current['cfg-dash-url'] = `${tunnelUrl}/`;
          current['cfg-health-url'] = `${tunnelUrl}/health`;
          
          fs.writeFileSync(configFile, JSON.stringify(current, null, 2), { encoding: 'utf8', mode: 0o600 });
          logOk('Registered Quick Tunnel URL in wizard-config.json!');
          dashboardUrl = `${tunnelUrl}/`;
        } else {
          logWarn('Could not extract Cloudflare Quick Tunnel URL. Falling back to local configuration.');
        }
      }
    }
  }

  // Resolve dashboard URL based on deployMode preference
  if (!dashboardUrl) {
    if ((deployMode === 'custom-domain' || deployMode === 'named-tunnel') && domain) {
      dashboardUrl = `https://${domain}/`;
    } else if (opts.brain) {
      dashboardUrl = opts.brain;
    } else if (process.env.TR_BRAIN) {
      dashboardUrl = process.env.TR_BRAIN;
    } else {
      const wizardConfigPath = path.join(brainDir, 'config', 'wizard-config.json');
      if (fs.existsSync(wizardConfigPath)) {
        try {
          const wizardCfg = JSON.parse(fs.readFileSync(wizardConfigPath, 'utf8'));
          if (wizardCfg['cfg-dash-url']) {
            dashboardUrl = wizardCfg['cfg-dash-url'];
          } else if (wizardCfg['cfg-api-url']) {
            dashboardUrl = wizardCfg['cfg-api-url'];
          }
        } catch {}
      }
    }
  }

  if (!dashboardUrl) {
    const brainJsonPath = path.join(brainDir, 'config', 'brain.json');
    if (fs.existsSync(brainJsonPath)) {
      try {
        const brainCfg = JSON.parse(fs.readFileSync(brainJsonPath, 'utf8'));
        if (brainCfg.url) {
          dashboardUrl = brainCfg.url;
        }
      } catch {}
    }
  }

  if (!dashboardUrl) {
    try {
      const { default: cfg } = await import('../core/config.mjs');
      const displayHost = cfg.host === '127.0.0.1' || cfg.host === '0.0.0.0' ? 'localhost' : cfg.host;
      dashboardUrl = `http://${displayHost}:${cfg.port}/`;
    } catch {
      dashboardUrl = 'http://localhost:3000/';
    }
  }

  // Normalize dashboardUrl
  if (dashboardUrl && !dashboardUrl.endsWith('/')) {
    dashboardUrl += '/';
  }

  // ── Register project brain in global project registry ──
  if (isProject) {
    try {
      const registryDir = path.join(globalBrainDir, 'config');
      fs.mkdirSync(registryDir, { recursive: true });
      const registryPath = path.join(registryDir, 'project-registry.json');
      let registry = [];
      if (fs.existsSync(registryPath)) {
        try { registry = JSON.parse(fs.readFileSync(registryPath, 'utf8')); } catch { registry = []; }
      }
      const projectName = path.basename(cwd);
      const existingIdx = registry.findIndex(p => p.path === cwd);
      const entry = {
        name: projectName,
        path: cwd,
        brainDir: brainDir,
        registered_at: new Date().toISOString(),
        last_compiled: new Date().toISOString(),
      };
      if (existingIdx >= 0) {
        registry[existingIdx] = { ...registry[existingIdx], ...entry };
      } else {
        registry.push(entry);
      }
      fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2));
      logOk(`Registered project "${projectName}" in global brain registry`);
    } catch (err) {
      logWarn(`Failed to register project: ${err.message}`);
    }
  }

  console.error(`
  ✅ Total Recall initialized! (${layerLabel} brain)
  ${passwordMessage}

  Your ${isProject ? 'project' : 'global'} brain is ready at:
    ${brainDir}

  IDE instruction files have been updated with the Total Recall memory block.
  Existing content in GEMINI.md, .cursorrules, CLAUDE.md etc. was preserved.

  🖥️  Dashboard UI:
     ${dashboardUrl}

  Next steps:
    1. Run \`npx total-recall compile\` any time to rebuild the memory surface.
    2. Use \`npx total-recall remember <category> "..."\ to add memories.
    3. Run \`npx total-recall daemon start\` to enable the background Dream Cycle.${isProject ? '\n    4. Your project brain is registered in the global brain\'s project registry.' : ''}
`);

  // Automatically open the Dashboard UI in the user's browser
  log("Launching Dashboard UI Walkthrough in your browser...");
  const startCmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  exec(`${startCmd} "${dashboardUrl}"`, (err) => {
    // Silently ignore browser opening failures
  });
}
