import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { getBothBrains, resolveBrainDir, getGlobalAgentDir } from './agent-dir.mjs';

function printHelp() {  console.log(`
  total-recall brain — Manage brain layers, contexts, and registrations

  Usage: total-recall brain <command> [options]

  Commands:
    list                       List global and all registered project brains, on/off (default)
    on <brain>                 Switch a brain on  (name, repo path, brain path, or "global")
    off <brain>                Switch a brain off — recall stops reading it
    status                     Show active context resolution paths and loaded layers
    register <project-path>    Track any project path (full brain + registry)
    unregister <project-path>  Remove a project directory path from the registry
    ensure <project-path>      Ensure a full project brain layout + register
    import <vault-dir> --to <project-path> [--dry-run]
                               Import every memory node from another vault directory
                               (an archive or a retired brain) into that project's
                               brain through validated writes; existing slugs are kept

  Any repo works — pass absolute or relative paths you choose. No product defaults.

  Examples:
    npx total-recall brain register .
    npx total-recall brain register /path/to/any-app
    npx total-recall brain ensure ~/code/my-lib
    npx total-recall brain list
    npx total-recall brain off hermes-agent
    npx total-recall brain on global
    npx total-recall brain unregister /path/to/project
    npx total-recall brain import ~/Archive/old-brain/memory-vault --to ~/code/my-lib

  Skill multi-repo sync: registered projects + TR_SYNC_REPOS + skill track/--repo
  `);
}

export default async function brain(args) {
  const subcommand = args[0] || 'list';

  if (subcommand === '--help' || subcommand === '-h') {
    printHelp();
    return;
  }
  const globalAgentDir = getGlobalAgentDir();
  const globalBrainDir = path.join(globalAgentDir, 'skills', 'total-recall');
  const registryPath = path.join(globalBrainDir, 'config', 'project-registry.json');
  switch (subcommand.toLowerCase()) {
    case 'list':
      await handleList(registryPath, globalBrainDir);
      break;
    case 'status':
      await handleStatus();
      break;
    case 'register':
      await handleRegister(registryPath, args.slice(1));
      break;
    case 'unregister':
      await handleUnregister(registryPath, args.slice(1));
      break;
    case 'ensure':
      await handleEnsure(args.slice(1), globalBrainDir);
      break;
    case 'import':
      await handleImport(args.slice(1));
      break;
    case 'on':
    case 'off':
      await handleToggle(subcommand.toLowerCase() === 'on', args.slice(1), globalBrainDir);
      break;
    default:
      console.error(`  ⚠️  Unknown brain command: "${subcommand}". Run total-recall brain --help for details.`);
      process.exit(1);
  }
}

async function handleToggle(enabled, targetArgs, globalBrainDir) {
  const query = targetArgs.find((a) => !a.startsWith('-'));
  const verb = enabled ? 'on' : 'off';
  if (!query) {
    console.error(`  ⚠️  Usage: npx total-recall brain ${verb} <name | repo path | brain path | global>`);
    process.exit(1);
  }
  const { listLocalBrains, findLocalBrain, setBrainEnabled } = await import('../core/brain-registry.mjs');
  const brains = listLocalBrains({ globalBrainDir, activeProject: getBothBrains().project });
  const target = findLocalBrain(brains, query);
  if (!target) {
    console.error(`  ⚠️  No single brain matches "${query}". Known: ${brains.map((b) => b.name).join(', ')}`);
    process.exit(1);
  }
  setBrainEnabled(target.brainDir, enabled, { globalBrainDir });
  console.log(`  ✅ ${target.name} is now ${verb.toUpperCase()} (${target.brainDir})`);
  if (!enabled) console.log('     recall skips it until: npx total-recall brain on ' + target.name);
}

async function handleEnsure(targetArgs, globalBrainDir) {
  const targetPath = targetArgs[0];
  if (!targetPath) {
    console.error('  ⚠️  Usage: npx total-recall brain ensure <project-path>');
    process.exit(1);
  }
  const { ensureFullProjectBrain, inspectProjectBrain } = await import('../core/project-brain.mjs');
  const abs = path.resolve(targetPath);
  if (!fs.existsSync(abs)) {
    console.error(`  ⚠️  Not found: ${abs}`);
    process.exit(1);
  }
  const result = ensureFullProjectBrain(abs, {
    globalBrainDir,
    tags: ['project-brain', 'full-brain'],
  });
  const health = inspectProjectBrain(abs);
  const { ensureProjectGitignore } = await import('./init.mjs');
  const ignored = ensureProjectGitignore(abs);
  console.log(`\n  ✅ Full project brain ready`);
  console.log(`     Repo:  ${result.repoRoot}`);
  console.log(`     Brain: ${result.brainDir}`);
  console.log(`     complete=${health.complete} full_brain=${health.full_brain}`);
  console.log(`     directories created +${result.dirs_created}`);
  if (ignored.length) console.log(`     .gitignore +${ignored.length} brain-state exclusions`);
  console.log('');
}



async function handleList(registryPath, globalBrainDir) {
  const brains = getBothBrains();
  const activeProjectDir = brains.project ? brains.project.brainDir : null;
  const { isBrainEnabled, readBrainToggles } = await import('../core/brain-registry.mjs');
  const toggles = readBrainToggles(globalBrainDir);
  const state = (dir) => (isBrainEnabled(dir, { toggles }) ? ' [ON]' : ' ⏸ [OFF]');

  console.log('\n  🧠 Active Total Recall Brain Registry:\n');

  // Print Global Brain
  let globalCount = 0;
  const globalVault = path.join(globalBrainDir, 'memory-vault');
  if (fs.existsSync(globalVault)) {
    globalCount = countMdFiles(globalVault);
  }
  const isGlobalActive = !activeProjectDir;
  const activeGlobalMarker = isGlobalActive ? ' ⭐️ [ACTIVE]' : '';
  console.log(`  🌐 Global Brain${state(globalBrainDir)}${activeGlobalMarker}`);
  console.log(`     ├── Path:  ${globalBrainDir}`);
  console.log(`     └── Nodes: ${globalCount} compiled SSSS memory nodes`);
  console.log('');

  // Print Project Brains
  if (fs.existsSync(registryPath)) {
    try {
      const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
      if (registry.length === 0) {
        console.log('  📁 No registered project brains yet. Run `total-recall brain register .` to track one.');
        return;
      }

      console.log(`  📁 Registered Project Brains (${registry.length}):`);
      for (const project of registry) {
        const isActive = activeProjectDir && path.resolve(activeProjectDir) === path.resolve(project.brainDir);
        const marker = isActive ? ' ⭐️ [ACTIVE]' : '';
        const exists = fs.existsSync(project.brainDir);
        const existsLabel = exists ? '' : ' ⚠️ [NOT FOUND]';
        const projectVault = path.join(project.brainDir, 'memory-vault');
        const nodeCount = exists ? countMdFiles(projectVault) : 0;

        console.log(`     ├── 📄 ${project.name}${state(project.brainDir)}${marker}${existsLabel}`);
        console.log(`     │   ├── Root:  ${project.path}`);
        console.log(`     │   ├── Brain: ${project.brainDir}`);
        console.log(`     │   └── Nodes: ${nodeCount} memory nodes`);
      }
    } catch (err) {
      console.error(`  ⚠️  Failed to read project registry: ${err.message}`);
    }
  } else {
    console.log('  📁 No registered project brains yet. Run `total-recall brain register .` to track one.');
  }
  console.log('');
}

async function handleStatus() {
  const brains = getBothBrains();

  console.log('\n  🧠 Active Brain Context Status:\n');
  
  console.log(`  Current Working Dir: ${process.cwd()}`);
  
  if (brains.global) {
    console.log(`  🌐 Global Layer:`);
    console.log(`     ├── Resolved Path:  ${brains.global.brainDir}`);
    console.log(`     └── Status:         Initialized & Available`);
  } else {
    console.log(`  🌐 Global Layer:       ⚠️  Not Resolved`);
  }
  if (brains.project) {
    console.log(`  📁 Project Layer:`);
    console.log(`     ├── Resolved Path:  ${brains.project.brainDir}`);
    console.log(`     ├── Project Root:   ${path.dirname(brains.project.agentDir)}`);
    console.log(`     └── Status:         ACTIVE (Cascades over Global)`);
  } else {
    console.log(`  📁 Project Layer:       None Detected (Context defaults fully to Global)`);
  }
  console.log('');
}

async function handleRegister(registryPath, targetArgs) {
  const targetPath = targetArgs[0];
  if (!targetPath) {
    console.error('  ⚠️  Missing project path. Usage: npx total-recall brain register <any-project-path>');
    console.error('     Works with any repo you choose (absolute or relative).');
    process.exit(1);
  }

  const absoluteRoot = path.resolve(
    targetPath.startsWith('~/')
      ? path.join(os.homedir(), targetPath.slice(2))
      : targetPath === '~'
        ? os.homedir()
        : targetPath,
  );
  if (!fs.existsSync(absoluteRoot) || !fs.statSync(absoluteRoot).isDirectory()) {
    console.error(`  ⚠️  Directory not found: "${absoluteRoot}"`);
    process.exit(1);
  }

  // Full project brain for any user repo (vault, sessions, registry, …)
  try {
    const { ensureFullProjectBrain } = await import('../core/project-brain.mjs');
    const globalBrainDir = path.join(getGlobalAgentDir(), 'skills', 'total-recall');
    ensureFullProjectBrain(absoluteRoot, {
      name: path.basename(absoluteRoot),
      tags: ['user-repo', 'full-brain', 'project-brain'],
      globalBrainDir,
      register: true,
    });
    console.log(`  ✅ Full project brain ready at ${path.join(absoluteRoot, '.agent', 'skills', 'total-recall')}`);
    // A registered repo carries a brain whose config holds a live PAT; keep it
    // out of git the same way `init --project` does.
    const { ensureProjectGitignore } = await import('./init.mjs');
    const ignored = ensureProjectGitignore(absoluteRoot);
    if (ignored.length) console.log(`  ✅ .gitignore +${ignored.length} brain-state exclusions`);
  } catch (err) {
    console.error(`  ⚠️  Could not fully provision brain layout: ${err.message}`);
    process.exitCode = 1;
    return;
  }

  const brainDir = path.join(absoluteRoot, '.agent', 'skills', 'total-recall');
  const name = path.basename(absoluteRoot);

  // Ensure registry folder exists
  fs.mkdirSync(path.dirname(registryPath), { recursive: true });

  let registry = [];
  if (fs.existsSync(registryPath)) {
    try {
      registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    } catch {
      registry = [];
    }
  }

  // Check if already exists
  const existingIndex = registry.findIndex(p => path.resolve(p.path) === absoluteRoot);
  const nowStr = new Date().toISOString();

  if (existingIndex !== -1) {
    registry[existingIndex].brainDir = brainDir;
    registry[existingIndex].name = name;
  } else {
    registry.push({
      name,
      path: absoluteRoot,
      brainDir,
      registered_at: nowStr
    });
  }

  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2), 'utf8');
  console.log(`  ✅ Successfully registered project brain: "${name}"`);
  console.log(`     ├── Root:  ${absoluteRoot}`);
  console.log(`     └── Brain: ${brainDir}`);
}

async function handleUnregister(registryPath, targetArgs) {
  const targetPath = targetArgs[0];
  if (!targetPath) {
    console.error('  ⚠️  Missing project path. Usage: npx total-recall brain unregister <project-path>');
    process.exit(1);
  }

  const absoluteRoot = path.resolve(targetPath);
  if (!fs.existsSync(registryPath)) {
    console.log('  ℹ️  No project registry exists yet.');
    return;
  }

  let registry = [];
  try {
    registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  } catch {
    console.error('  ⚠️  Failed to read project registry.');
    process.exit(1);
  }

  const beforeLen = registry.length;
  registry = registry.filter(p => path.resolve(p.path) !== absoluteRoot);

  if (registry.length === beforeLen) {
    console.log(`  ℹ️  Path not registered: "${absoluteRoot}"`);
    return;
  }

  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2), 'utf8');
  console.log(`  ✅ Successfully unregistered project: "${absoluteRoot}"`);
}

/**
 * Import memory nodes from a vault directory into a project's brain.
 *
 * The source is read, never written: an archived brain, or the vault of a brain
 * being retired. Every node goes through the validated SSSS write path at the
 * same vault-relative path, so the target's event log records each one. A slug
 * the target already holds is left alone, which makes a rerun safe.
 */
async function handleImport(targetArgs) {
  const toIdx = targetArgs.indexOf('--to');
  const source = targetArgs.find((a, i) => !a.startsWith('-') && i !== toIdx + 1);
  const target = toIdx !== -1 ? targetArgs[toIdx + 1] : null;
  const dryRun = targetArgs.includes('--dry-run');
  if (!source || !target) {
    console.error('  ⚠️  Usage: npx total-recall brain import <vault-dir> --to <project-path> [--dry-run]');
    process.exit(1);
  }
  const sourceDir = path.resolve(source);
  const projectRoot = path.resolve(target);
  if (!fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) {
    console.error(`  ⚠️  Source vault not found: ${sourceDir}`);
    process.exit(1);
  }
  const vaultDir = path.join(projectRoot, '.agent', 'skills', 'total-recall', 'memory-vault');
  if (!fs.existsSync(vaultDir)) {
    console.error(`  ⚠️  No project brain at ${projectRoot}. Run: npx total-recall brain register ${projectRoot}`);
    process.exit(1);
  }
  if (path.resolve(sourceDir) === path.resolve(vaultDir)) {
    console.error('  ⚠️  Source and target are the same vault.');
    process.exit(1);
  }
  const { loadNodes } = await import('../core/vault.mjs');
  const { writeNodeValidatedAsync } = await import('../core/validated-write.mjs');
  const existing = new Set(loadNodes(vaultDir).map(n => n.slug));
  let imported = 0, skipped = 0;
  const failed = [];
  for (const node of loadNodes(sourceDir)) {
    if (existing.has(node.slug)) { skipped++; continue; }
    const rel = path.relative(sourceDir, node._filePath).split(path.sep).join('/');
    if (dryRun) { imported++; continue; }
    const { _filePath, _filepath, ...clean } = node;
    const result = await writeNodeValidatedAsync(clean, vaultDir, { path: rel });
    if (result.success) { imported++; existing.add(node.slug); }
    else failed.push(`${rel}: ${result.validation?.errors?.join('; ') || result.error}`);
  }
  const verb = dryRun ? 'Would import' : 'Imported';
  console.log(`  ${failed.length ? '⚠️ ' : '✅'} ${verb} ${imported} node(s) into ${vaultDir}; ${skipped} already present`);
  for (const line of failed) console.error(`     ✗ ${line}`);
  if (failed.length) process.exitCode = 1;
}

function countMdFiles(dir) {
  if (!fs.existsSync(dir)) return 0;
  let count = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      count += countMdFiles(path.join(dir, entry.name));
    } else if (entry.name.endsWith('.md')) {
      count++;
    }
  }
  return count;
}
