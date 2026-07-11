import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { resolveAgentDir, resolveBrainDir, parseLayerFlag } from './agent-dir.mjs';
import {
  registerSkill,
  listRegistered,
  listInstalls,
  deploySkill,
  skillStatus,
  syncLocalSkillsToRegistry,
  unregisterSkill,
  resolveRegistryPath,
  syncAllSkillsTwoWay,
  syncSkillTwoWay,
  discoverAllSkills,
  pushAllSkills,
  pullAllSkills,
  loadKnownRepoRoots,
  parseSyncReposEnv,
  trackRepo,
  normalizeRepoPaths,
} from '../core/skills-registry.mjs';

// Helper to resolve agent directories dynamically
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../');

export function resolveSkillScriptPath(scriptName, { agentDir = resolveAgentDir(), root = ROOT } = {}) {
  // skill-deploy module (TR_CORE_FOCUS); keep legacy nested-skill paths for old brains.
  const candidates = [
    path.join(agentDir, 'skills', 'total-recall', 'modules', 'skill-deploy', 'scripts', scriptName),
    path.join(root, 'scaffold', '.agent', 'skills', 'total-recall', 'modules', 'skill-deploy', 'scripts', scriptName),
    path.join(agentDir, 'skills', 'total-recall', 'skills', 'tr-skill', 'scripts', scriptName),
    path.join(agentDir, 'skills', 'total-recall', 'skills', 'skill', 'scripts', scriptName),
    path.join(root, 'scaffold', '.agent', 'skills', 'total-recall', 'skills', 'tr-skill', 'scripts', scriptName),
    path.join(root, 'scaffold', '.agent', 'skills', 'total-recall', 'skills', 'skill', 'scripts', scriptName),
  ];
  const found = candidates.find(candidate => fs.existsSync(candidate));
  if (!found) {
    throw new Error(`Could not find bundled skill helper "${scriptName}". Checked: ${candidates.join(', ')}`);
  }
  return found;
}

async function importSkillScript(scriptName, options) {
  return import(pathToFileURL(resolveSkillScriptPath(scriptName, options)).href);
}

function printHelp() {
  console.log(`
  total-recall skill — Skills registry, install, and cross-repo deploy

  Usage: total-recall skill <command> [options]

  Install / local:
    find <query>          Search skills.sh registry (sorted by installs)
    install <package>     Download skill, security scan, compile, auto-register (alias: load, add)
    create <name>         Scaffold a new skill folder (alias: new)
    edit <name>           Open local SKILL.md in $EDITOR
    scan <name>           Security audit on installed skill dir
    list                  List local brain skills with SKILL.md (alias: ls)
    remove <name>         Delete skill from brain skills dir (alias: rm)

  Registry / deploy / multi-repo sync (TR_CORE_FOCUS):
    register <path|name>  Add skill to global skills-registry (from path or local name)
    registry              List catalog entries in skills-registry/index.yaml
    deploy <id>           Copy skill into a repo (.agent/skills/<id>/) and record install map
    status [id]           Registry + install map + drift (omit id = summary)
    sync-registry         Register all local brain skills into the catalog
    unregister <id>       Remove catalog entry (does not delete repo copies)
    track <path>          Track any repo (full project brain + registry) for skill sync
    discover              Scan tracked / --repo / cwd repos for skills
    sync [id]             Two-way sync skill(s) across those repos
    push                  One-way: catalog/source → all installs
    pull                  One-way: prefer installs → source → fan-out

  deploy options:
    --repo <path>         Target repository root (default: cwd)
    --adapt               Rewrite description with openwiki + package.json stack signals
    --force               Replace existing destination

  discover / sync options (any user repos — no hardcoded paths):
    --repo <path>         Include this repo (repeatable). Works with absolute or relative paths
    --register            Permanently track --repo paths (project registry + full brain)
    --ensure-brains       Ensure full TR brain layout on all known roots
    --prefer newest|registry|install   Sync winner policy (default: newest)
    --dry-run             Show actions without writing
    --include-core        Also sync total-recall core skill (off by default)
    --skip-discover       Do not re-scan repos before sync

  How any repo is included:
    1. npx total-recall skill track /path/to/any-repo
       (or: brain register /path && brain ensure /path)
    2. One-shot: skill discover --repo /path --register
    3. Env: TR_SYNC_REPOS="/path/a:/path/b"
    4. cwd is auto-included when it looks like a project

  Options:
    --global              Target the global brain (~/.agent)
    --project             Target the current repo's project brain
    --help, -h            Show this help menu

  Examples:
    npx total-recall skill track .
    npx total-recall skill track /path/to/my-app
    npx total-recall skill discover --repo /path/to/app1 --repo /path/to/app2 --register
    npx total-recall skill sync --repo /path/to/app1 --repo /path/to/app2
    npx total-recall skill deploy my-skill --repo /path/to/my-app --adapt
    npx total-recall skill sync --prefer newest
`);
}

/** Collect all --repo <path> values from argv */
function parseRepoFlags(args) {
  const repos = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--repo' && args[i + 1]) {
      repos.push(args[++i]);
    }
  }
  return repos;
}

function parseFlagValue(args, flag) {
  const i = args.indexOf(flag);
  if (i === -1) return null;
  return args[i + 1] || null;
}

export default async function skillCli(args) {
  const { layer, remainingArgs } = parseLayerFlag(args);
  if (remainingArgs.length === 0 || remainingArgs.includes('--help') || remainingArgs.includes('-h')) {
    printHelp();
    return;
  }

  let agentDir;
  let brainDir;
  try {
    agentDir = resolveAgentDir(layer);
    brainDir = resolveBrainDir(layer);
  } catch (err) {
    console.error(`❌ ${err.message}`);
    process.exit(1);
  }
  const skillsDir = path.join(agentDir, 'skills');
  const command = remainingArgs[0];

  if (command === 'find') {
    const query = remainingArgs[1];
    if (!query) {
      console.error('❌ You must provide a search query.');
      console.error('Usage: npx total-recall skill find <query>');
      process.exit(1);
    }

    try {
      const { searchAndSort } = await importSkillScript('find-skills.mjs', { agentDir });
      const results = searchAndSort(query);
      
      if (results.length === 0) {
        console.log('\nℹ️  No matching skills found on skills.sh.');
        return;
      }

      console.log('\n✨ --- SKILLS.SH REGISTRY SEARCH RESULTS (Sorted by Installs) --- ✨\n');
      
      const nameHeader = 'SKILL PACKAGE';
      const installsHeader = 'INSTALLS';
      const urlHeader = 'REGISTRY URL';
      
      let maxNameLen = nameHeader.length;
      let maxInstallsLen = installsHeader.length;

      for (const r of results) {
        if (r.name.length > maxNameLen) maxNameLen = r.name.length;
        if (r.installsStr.length > maxInstallsLen) maxInstallsLen = r.installsStr.length;
      }

      const divider = '-'.repeat(maxNameLen + maxInstallsLen + 35);
      console.log(divider);
      console.log(
        `${nameHeader.padEnd(maxNameLen)}   | ${installsHeader.padEnd(maxInstallsLen)}   | ${urlHeader}`
      );
      console.log(divider);

      for (const r of results) {
        console.log(
          `${r.name.padEnd(maxNameLen)}   | ${r.installsStr.padEnd(maxInstallsLen)}   | ${r.url}`
        );
      }

      console.log(divider);
      console.log(`💡 Tip: To install any skill, run: npx total-recall skill install <package-name>\n`);
    } catch (err) {
      console.error('❌ Error executing search:', err.message);
      process.exit(1);
    }
  } 
  
  else if (command === 'install' || command === 'add' || command === 'load') {
    const pkg = remainingArgs[1];
    if (!pkg) {
      console.error('❌ You must provide a skill package to load.');
      console.error('Usage: npx total-recall skill load <owner/repo@skill>');
      process.exit(1);
    }

    try {
      const { installSkill, inferSkillName, installedSkillCandidates } = await importSkillScript('install-skill.mjs', { agentDir });
      const res = installSkill(pkg, { cwd: process.cwd(), agentDir });
      if (!res.success) {
        process.exit(1);
      }
      // Auto-register installed skill into global catalog when discoverable
      try {
        const candidates = installedSkillCandidates(pkg, { cwd: process.cwd(), agentDir }).filter((p) =>
          fs.existsSync(path.join(p, 'SKILL.md')),
        );
        const name = inferSkillName(pkg);
        const hit = candidates[0] || (name && fs.existsSync(path.join(skillsDir, name, 'SKILL.md'))
          ? path.join(skillsDir, name)
          : null);
        if (hit) {
          const entry = registerSkill(brainDir, hit, {
            source: pkg,
            source_type: 'registry',
          });
          console.log(`📇 Registered in catalog: ${entry.id} → ${resolveRegistryPath(brainDir)}`);
        }
      } catch (regErr) {
        console.warn(`⚠️  Installed but registry update skipped: ${regErr.message}`);
      }
    } catch (err) {
      console.error('❌ Loading skill failed:', err.message);
      process.exit(1);
    }
  } 
  
  else if (command === 'scan') {
    const target = remainingArgs[1];
    if (!target) {
      console.error('❌ You must specify a local skill directory to scan.');
      console.error('Usage: npx total-recall skill scan <skill-name>');
      process.exit(1);
    }

    const targetDir = path.resolve(skillsDir, target);

    try {
      const { runScan } = await importSkillScript('scan-skill.mjs', { agentDir });
      const result = runScan(targetDir);
      process.exit(result.success ? 0 : 1);
    } catch (err) {
      console.error('❌ Audit execution failed:', err.message);
      process.exit(1);
    }
  } 
  
  else if (command === 'list' || command === 'ls') {
    if (!fs.existsSync(skillsDir)) {
      console.log('No skills registry directory initialized yet.');
      return;
    }

    // Only list packages with SKILL.md (real agent skills). Skip modules/, etc.
    const dirs = fs.readdirSync(skillsDir).filter((d) => {
      const skillPath = path.join(skillsDir, d);
      if (!fs.statSync(skillPath).isDirectory()) return false;
      return fs.existsSync(path.join(skillPath, 'SKILL.md'));
    });

    if (dirs.length === 0) {
      console.log('No installed skills found in the active brain.');
      return;
    }

    console.log('\n📦 Installed Skills (SKILL.md present):');
    console.log('------------------------------------------------------------');
    for (const d of dirs) {
      const note = d === 'total-recall' ? ' [TR core skill]' : '';
      console.log(` • ${d.padEnd(20)}${note}`);
    }
    console.log('------------------------------------------------------------\n');
  } 
  
  else if (command === 'remove' || command === 'rm') {
    const target = remainingArgs[1];
    if (!target) {
      console.error('❌ You must specify a skill name to remove.');
      console.error('Usage: npx total-recall skill remove <skill-name>');
      process.exit(1);
    }

    const targetDir = path.join(skillsDir, target);
    if (!fs.existsSync(targetDir)) {
      console.error(`❌ Skill "${target}" not found at ${targetDir}`);
      process.exit(1);
    }

    console.log(`🗑️  Removing skill "${target}"...`);
    fs.rmSync(targetDir, { recursive: true, force: true });
    console.log('✅ Skill files deleted successfully.');

    // Hot-recompile shims to strip the removed rules
    console.log('🔄 Hot-recompiling active shims to reflect changes...');
    const child = spawnSync('npx', ['total-recall', 'compile'], { 
      encoding: 'utf8',
      cwd: process.cwd(),
      env: { ...process.env, AGENT_DIR: agentDir },
    });

    if (child.error || child.status !== 0) {
      console.warn('⚠️  Shim hot-recompilation returned warning.');
    } else {
      console.log('🚀 Hot-recompilation successful. Skill is fully offline.');
    }
  } 
  
  else if (command === 'create' || command === 'new') {
    const target = remainingArgs[1];
    if (!target) {
      console.error('❌ You must specify a skill name to create.');
      console.error('Usage: npx total-recall skill create <skill-name>');
      process.exit(1);
    }

    if (!/^[a-z][a-z0-9-]{1,63}$/.test(target)) {
      console.error('❌ Invalid skill name. Must be lowercase kebab-case (e.g. my-awesome-skill).');
      process.exit(1);
    }

    const newSkillDir = path.join(skillsDir, target);
    if (fs.existsSync(newSkillDir)) {
      console.error(`❌ Skill directory already exists: ${newSkillDir}`);
      process.exit(1);
    }

    console.log(`📁 Scaffolding skill folder structure for "${target}"...`);
    fs.mkdirSync(newSkillDir, { recursive: true });
    
    const folders = ['scripts', 'references', 'evals', 'subagents'];
    for (const f of folders) {
      fs.mkdirSync(path.join(newSkillDir, f), { recursive: true });
      fs.writeFileSync(path.join(newSkillDir, f, '.gitkeep'), '', 'utf8');
    }

    // Write template SKILL.md
    const skillMdContent = `---
type: skill
name: ${target}
description: "Use this skill when [TRIGGER CONDITION]. MANDATORY: You MUST read the full SKILL.md file before executing."
schema_version: 2
---

# ${target.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')} Skill

Provide a high-level explanation of the skill's capabilities and context.

## Core Directives

1. Step-by-step procedural instruction
2. Concrete action rule
3. Pitfalls to avoid

## References

* Core specifications or API documentation
`;
    fs.writeFileSync(path.join(newSkillDir, 'SKILL.md'), skillMdContent, 'utf8');

    // Write template evals.json
    const evalsJsonContent = [
      {
        "name": "frontmatter-has-name",
        "assertion": "SKILL.md YAML frontmatter contains a 'name' field",
        "severity": "error"
      },
      {
        "name": "description-is-trigger-optimized",
        "assertion": "description field starts with 'Use this skill when'",
        "severity": "warning"
      },
      {
        "name": "no-empty-directories",
        "assertion": "All required directories contain at least one non-.gitkeep file",
        "severity": "error"
      }
    ];
    fs.writeFileSync(path.join(newSkillDir, 'evals', 'evals.json'), JSON.stringify(evalsJsonContent, null, 2), 'utf8');

    console.log(`✨ Skill "${target}" successfully created and SSSS-scaffolded!`);
    console.log(`📍 Path: ${newSkillDir}`);
    console.log(`💡 Next steps: edit the SKILL.md and add your automation scripts!`);
  }

  else if (command === 'edit') {
    const target = remainingArgs[1];
    if (!target) {
      console.error('❌ You must specify a skill name to edit.');
      console.error('Usage: npx total-recall skill edit <skill-name>');
      process.exit(1);
    }

    const skillPath = path.join(skillsDir, target, 'SKILL.md');
    if (!fs.existsSync(skillPath)) {
      console.error(`❌ Skill "${target}" not found at ${skillPath}`);
      process.exit(1);
    }

    const editor = process.env.EDITOR || 'vi';
    console.log(`📝 Opening skill "${target}" in ${editor}...`);
    const { spawnSync: ss } = await import('node:child_process');
    const child = ss(editor, [skillPath], { stdio: 'inherit' });
    process.exit(child.status || 0);
  }

  // ─── Registry / deploy ──────────────────────────────────────────────────────

  else if (command === 'register') {
    const target = remainingArgs[1];
    if (!target) {
      console.error('❌ Usage: total-recall skill register <path-or-local-name>');
      process.exit(1);
    }
    try {
      let skillPath = path.resolve(target);
      if (!fs.existsSync(path.join(skillPath, 'SKILL.md'))) {
        skillPath = path.join(skillsDir, target);
      }
      const entry = registerSkill(brainDir, skillPath, {
        source: target,
        source_type: fs.existsSync(path.resolve(target)) ? 'path' : 'local',
      });
      console.log(`\n  ✅ Registered: ${entry.id}`);
      console.log(`     version=${entry.version} hash=${entry.content_hash}`);
      console.log(`     catalog: ${resolveRegistryPath(brainDir)}\n`);
    } catch (err) {
      console.error(`❌ ${err.message}`);
      process.exit(1);
    }
  }

  else if (command === 'registry') {
    const entries = listRegistered(brainDir);
    if (!entries.length) {
      console.log(`\n  Catalog empty. Register with: total-recall skill register <path>`);
      console.log(`  Path: ${resolveRegistryPath(brainDir)}\n`);
      return;
    }
    console.log(`\n  📇 Skills catalog (${entries.length}) — ${resolveRegistryPath(brainDir)}\n`);
    for (const e of entries) {
      console.log(`  • ${e.id.padEnd(24)} v${e.version}  hash=${e.content_hash || '-'}`);
      if (e.description) console.log(`      ${String(e.description).slice(0, 90)}`);
    }
    console.log('');
  }

  else if (command === 'deploy') {
    const skillId = remainingArgs[1];
    if (!skillId) {
      console.error('❌ Usage: total-recall skill deploy <id-or-path> [--repo <path>] [--adapt] [--force]');
      process.exit(1);
    }
    const repo = parseFlagValue(remainingArgs, '--repo') || process.cwd();
    const adapt = remainingArgs.includes('--adapt');
    const force = remainingArgs.includes('--force');
    try {
      const result = deploySkill(brainDir, skillId, {
        repo,
        agentSkillsDir: skillsDir,
        adapt,
        force,
      });
      console.log(`\n  ✅ Deployed: ${result.skillId}`);
      console.log(`     → ${result.destDir}`);
      console.log(`     hash=${result.install.content_hash} adapted=${result.adapt.adapted}`);
      console.log(`     Install map updated in ${resolveRegistryPath(brainDir)}\n`);
    } catch (err) {
      console.error(`❌ Deploy failed: ${err.message}`);
      process.exit(1);
    }
  }

  else if (command === 'status') {
    const skillId = remainingArgs[1];
    if (!skillId) {
      const catalog = listRegistered(brainDir);
      const installs = listInstalls(brainDir);
      console.log(`\n  Registry: ${resolveRegistryPath(brainDir)}`);
      console.log(`  Catalog skills: ${catalog.length}`);
      console.log(`  Install map entries: ${installs.length}`);
      if (installs.length) {
        console.log('\n  Installs:');
        for (const i of installs) {
          console.log(`    • ${i.skill_id} → ${i.path}`);
        }
      }
      console.log('');
      return;
    }
    try {
      const st = skillStatus(brainDir, skillId);
      console.log(`\n  Skill: ${skillId}`);
      console.log(`  Registered: ${st.registered}`);
      if (st.entry) {
        console.log(`  Version: ${st.entry.version}  hash=${st.entry.content_hash}`);
        console.log(`  Source: ${st.entry.source_path || st.entry.source}`);
      }
      console.log(`  Installs: ${st.install_count}  drift=${st.any_drift ? 'YES' : 'no'}`);
      for (const inst of st.installs) {
        console.log(
          `    • ${inst.path}\n      exists=${inst.exists} live=${inst.live_hash || '-'} drift=${inst.drift}`,
        );
      }
      console.log('');
    } catch (err) {
      console.error(`❌ ${err.message}`);
      process.exit(1);
    }
  }

  else if (command === 'sync-registry') {
    const result = syncLocalSkillsToRegistry(brainDir, skillsDir);
    console.log(`\n  ✅ Synced ${result.registered.length} skill(s) into catalog`);
    if (result.registered.length) {
      console.log(`     ${result.registered.join(', ')}`);
    }
    console.log(`     ${resolveRegistryPath(brainDir)}\n`);
  }

  else if (command === 'unregister') {
    const skillId = remainingArgs[1];
    if (!skillId) {
      console.error('❌ Usage: total-recall skill unregister <id>');
      process.exit(1);
    }
    const result = unregisterSkill(brainDir, skillId);
    if (!result.success) {
      console.error(`❌ ${result.error}`);
      process.exit(1);
    }
    console.log(`  ✅ Unregistered catalog entry: ${skillId}`);
  }

  else if (command === 'track') {
    const target = remainingArgs[1];
    if (!target || target.startsWith('--')) {
      console.error('❌ Usage: total-recall skill track <any-repo-path>');
      console.error('   Example: total-recall skill track .');
      console.error('            total-recall skill track /path/to/my-app');
      process.exit(1);
    }
    try {
      const result = trackRepo(brainDir, target);
      console.log(`\n  ✅ Tracking repo as full Total Recall project brain`);
      console.log(`     Repo:  ${result.repoRoot}`);
      console.log(`     Brain: ${result.brainDir}`);
      console.log(`     Skills sync will include this path on discover/sync.\n`);
    } catch (err) {
      console.error(`❌ ${err.message}`);
      process.exit(1);
    }
  }

  else if (command === 'discover') {
    const includeCore = remainingArgs.includes('--include-core');
    const ensureBrains = remainingArgs.includes('--ensure-brains');
    const registerExtra = remainingArgs.includes('--register');
    const extraRepos = parseRepoFlags(remainingArgs);
    const result = discoverAllSkills(brainDir, {
      includeCore,
      ensureBrains,
      extraRepos,
      registerExtra,
    });
    const roots = loadKnownRepoRoots(brainDir, { extraRepos });
    const envRoots = parseSyncReposEnv();
    console.log(`\n  🔍 Discover complete`);
    console.log(`     Repos scanned: ${result.repos}`);
    if (roots.length) {
      for (const r of roots) console.log(`       • ${r}`);
    }
    console.log(`     Skills found:  ${result.discovered}`);
    console.log(`     Registered:    ${result.registered.length}`);
    console.log(`     Install rows:  +${result.installs_added}`);
    if (result.registered.length) {
      console.log(`     IDs: ${result.registered.slice(0, 20).join(', ')}${result.registered.length > 20 ? '…' : ''}`);
    }
    if (envRoots.length) console.log(`     TR_SYNC_REPOS: ${envRoots.join(', ')}`);
    if (extraRepos.length) {
      console.log(
        `     --repo: ${normalizeRepoPaths(extraRepos).join(', ')}${registerExtra ? ' [tracked permanently]' : ' [one-shot]'}`,
      );
    }
    if (!roots.length) {
      console.log(`     Tip: total-recall skill track .   # any repo you want`);
    }
    console.log('');
  }

  else if (command === 'sync' || command === 'push' || command === 'pull') {
    const skillId = remainingArgs[1] && !remainingArgs[1].startsWith('--') ? remainingArgs[1] : null;
    const dryRun = remainingArgs.includes('--dry-run');
    const includeCore = remainingArgs.includes('--include-core');
    const skipDiscover = remainingArgs.includes('--skip-discover');
    const ensureBrains = remainingArgs.includes('--ensure-brains');
    const registerExtra = remainingArgs.includes('--register');
    const extraRepos = parseRepoFlags(remainingArgs);
    let prefer = parseFlagValue(remainingArgs, '--prefer') || 'newest';
    if (command === 'push') prefer = 'registry';
    if (command === 'pull') prefer = 'install';

    const syncOpts = {
      prefer,
      dryRun,
      includeCore,
      skipDiscover,
      ensureBrains,
      extraRepos,
      registerExtra,
    };

    console.log(`\n  🔄 Skill ${command} (prefer=${prefer}${dryRun ? ', dry-run' : ''})…\n`);

    if (skillId) {
      if (!skipDiscover) {
        discoverAllSkills(brainDir, {
          includeCore,
          extraRepos,
          registerExtra,
          ensureBrains,
        });
      }
      const r = syncSkillTwoWay(brainDir, skillId, {
        prefer,
        dryRun,
        includeCore,
      });
      if (r.skipped) {
        console.log(`  ⏭  ${skillId}: ${r.reason}`);
      } else if (r.in_sync) {
        console.log(`  ✅ ${skillId}: already in sync (${r.locations} copies, hash=${r.hash})`);
      } else {
        console.log(`  🏆 Winner: ${r.winner?.path} (${r.winner?.role})`);
        for (const a of r.actions || []) {
          console.log(`     ${dryRun ? 'would copy' : 'copied'} → ${a.to}`);
        }
        if (!(r.actions || []).length) console.log(`  ✅ ${skillId}: no copies needed`);
      }
      console.log('');
      return;
    }

    const report =
      command === 'push'
        ? pushAllSkills(brainDir, syncOpts)
        : command === 'pull'
          ? pullAllSkills(brainDir, syncOpts)
          : syncAllSkillsTwoWay(brainDir, syncOpts);

    if (report.roots?.length) {
      console.log(`  Roots (${report.roots.length}):`);
      for (const r of report.roots) console.log(`    • ${r}`);
    }
    console.log(`  Repos scanned:   ${report.discovery?.repos ?? '?'}`);
    console.log(`  Discovered:      ${report.discovery?.discovered ?? 0}`);
    console.log(`  Skills checked:  ${report.skills}`);
    console.log(`  Already synced:  ${report.already_in_sync}`);
    console.log(`  Updated:         ${report.updated}`);
    console.log(`  File copies:     ${report.copies}`);
    if (report.results) {
      for (const r of report.results) {
        if (r.skipped && r.reason === 'core') continue;
        if (r.in_sync) continue;
        if (r.actions?.length) {
          console.log(`\n  • ${r.skillId} ← ${r.winner?.role || '?'} ${r.winner?.path || ''}`);
          for (const a of r.actions) {
            console.log(`      ${dryRun ? 'would →' : '→'} ${a.to}`);
          }
        } else if (r.skipped) {
          console.log(`  ⏭  ${r.skillId}: ${r.reason}`);
        }
      }
    }
    console.log(
      dryRun
        ? '\n  Dry-run only. Re-run without --dry-run to apply.\n'
        : '\n  ✅ Sync finished. Check: npx total-recall skill status\n',
    );
  }

  else {
    console.error(`❌ Unknown skill command: ${command}`);
    printHelp();
    process.exit(1);
  }
}
