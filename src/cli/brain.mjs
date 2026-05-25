import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { getBothBrains, resolveBrainDir, getGlobalAgentDir } from './agent-dir.mjs';

function printHelp() {  console.log(`
  total-recall brain — Manage brain layers, contexts, and registrations

  Usage: total-recall brain <command> [options]

  Commands:
    list                       List global and all registered project brains (default)
    status                     Show active context resolution paths and loaded layers
    register <project-path>    Register a project directory path in the registry
    unregister <project-path>  Remove a project directory path from the registry

  Examples:
    npx total-recall brain
    npx total-recall brain status
    npx total-recall brain register .
    npx total-recall brain unregister /path/to/project
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
    default:
      console.error(`  ⚠️  Unknown brain command: "${subcommand}". Run total-recall brain --help for details.`);
      process.exit(1);
  }
}

async function handleList(registryPath, globalBrainDir) {
  const brains = getBothBrains();
  const activeProjectDir = brains.project ? brains.project.brainDir : null;

  console.log('\n  🧠 Active Total Recall Brain Registry:\n');

  // Print Global Brain
  let globalCount = 0;
  const globalVault = path.join(globalBrainDir, 'memory-vault');
  if (fs.existsSync(globalVault)) {
    globalCount = countMdFiles(globalVault);
  }
  const isGlobalActive = !activeProjectDir;
  const activeGlobalMarker = isGlobalActive ? ' ⭐️ [ACTIVE]' : '';
  console.log(`  🌐 Global Brain${activeGlobalMarker}`);
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

        console.log(`     ├── 📄 ${project.name}${marker}${existsLabel}`);
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
    console.error('  ⚠️  Missing project path. Usage: npx total-recall brain register <project-path>');
    process.exit(1);
  }

  const absoluteRoot = path.resolve(targetPath);
  if (!fs.existsSync(absoluteRoot) || !fs.statSync(absoluteRoot).isDirectory()) {
    console.error(`  ⚠️  Directory not found: "${absoluteRoot}"`);
    process.exit(1);
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
