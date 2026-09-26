import fs from 'node:fs';
import path from 'node:path';
import { resolveBrainLayer } from '../core/config.mjs';

function printHelp() {
  console.log(`
  total-recall command — Manage custom composable CLI commands

  Usage:
    total-recall command create <name> "<code>" [--global]   Create a new custom CLI command
    total-recall command read <name> [--global]              Read the code of a custom CLI command
    total-recall command update <name> "<code>" [--global]   Update an existing custom CLI command
    total-recall command remove <name> [--global]            Remove a custom CLI command
    total-recall command list [--global]                     List custom CLI commands

  Examples:
    npx total-recall command create hello "console.log('Hello from the brain!');"
    npx total-recall command create my-tool "console.log(args);" --global
    npx total-recall command read hello
    npx total-recall command list
`);
}

function resolveTargetDir(isGlobal) {
  if (isGlobal) {
    try {
      const gBrain = resolveBrainLayer('global');
      return path.join(gBrain.agentDir, 'commands');
    } catch {
      return path.join(process.env.HOME || '/root', '.agent', 'commands');
    }
  }

  try {
    const pBrain = resolveBrainLayer('project');
    return path.join(pBrain.agentDir, 'commands');
  } catch {
    try {
      const gBrain = resolveBrainLayer('global');
      return path.join(gBrain.agentDir, 'commands');
    } catch {
      return path.join(process.env.HOME || '/root', '.agent', 'commands');
    }
  }
}

export async function run(argv = []) {
  const args = Array.isArray(argv) ? argv.slice(3) : [];
  return commandCmd(args);
}

export default async function commandCmd(rawArgs = []) {
  const isGlobal = rawArgs.includes('--global') || rawArgs.includes('-g');
  const cleanArgs = rawArgs.filter(a => a !== '--global' && a !== '-g');

  const action = cleanArgs[0];
  const name = cleanArgs[1];

  if (!action || action === '--help' || action === '-h') {
    printHelp();
    return;
  }

  if (!name && action !== 'list') {
    console.error(`Error: Missing command name.`);
    console.error(`Usage: total-recall command ${action} <name> [--global]`);
    process.exit(1);
  }

  const commandsDir = resolveTargetDir(isGlobal);

  if (action === 'create') {
    const code = cleanArgs[2];
    if (!code) {
      console.error(`Error: Missing code snippet for the command.`);
      console.error(`Usage: total-recall command create <name> "<code>" [--global]`);
      process.exit(1);
    }

    if (!fs.existsSync(commandsDir)) {
      fs.mkdirSync(commandsDir, { recursive: true });
    }

    const commandPath = path.join(commandsDir, `${name}.mjs`);
    
    // Wrap code in an exported run/default function for composable CLI execution
    const fileContent = `// Auto-generated custom CLI command: ${name}
export async function run(argv = []) {
  const args = Array.isArray(argv) ? argv.slice(3) : [];
  ${code}
}
export default async function (args = []) {
  ${code}
}
`;

    fs.writeFileSync(commandPath, fileContent, 'utf8');
    console.log(`\x1b[32m✔ Successfully created custom command: \x1b[1mnpx total-recall ${name}\x1b[0m`);
    console.log(`  Saved to: ${commandPath}`);
  } else if (action === 'read') {
    const commandPath = path.join(commandsDir, `${name}.mjs`);
    if (fs.existsSync(commandPath)) {
      console.log(fs.readFileSync(commandPath, 'utf8'));
    } else {
      console.error(`Error: Custom command '${name}' does not exist in ${commandsDir}.`);
      process.exit(1);
    }
  } else if (action === 'update') {
    const code = cleanArgs[2];
    if (!code) {
      console.error(`Error: Missing code snippet for the command.`);
      console.error(`Usage: total-recall command update <name> "<code>" [--global]`);
      process.exit(1);
    }

    const commandPath = path.join(commandsDir, `${name}.mjs`);
    if (!fs.existsSync(commandPath)) {
      console.error(`Error: Custom command '${name}' does not exist in ${commandsDir}.`);
      process.exit(1);
    }

    const fileContent = `// Auto-generated custom CLI command: ${name}
export async function run(argv = []) {
  const args = Array.isArray(argv) ? argv.slice(3) : [];
  ${code}
}
export default async function (args = []) {
  ${code}
}
`;

    fs.writeFileSync(commandPath, fileContent, 'utf8');
    console.log(`\x1b[32m✔ Successfully updated custom command: \x1b[1m${name}\x1b[0m`);
    console.log(`  Saved to: ${commandPath}`);
  } else if (action === 'list') {
    const targets = isGlobal 
      ? [{ label: 'Global', dir: resolveTargetDir(true) }]
      : [
          { label: 'Project', dir: resolveTargetDir(false) },
          { label: 'Global', dir: resolveTargetDir(true) }
        ];

    let foundAny = false;
    for (const t of targets) {
      if (fs.existsSync(t.dir)) {
        const files = fs.readdirSync(t.dir).filter(f => f.endsWith('.mjs'));
        if (files.length > 0) {
          foundAny = true;
          console.log(`\x1b[1m${t.label} CLI commands (${t.dir}):\x1b[0m`);
          files.forEach(f => {
            console.log(`  - \x1b[36m${f.replace('.mjs', '')}\x1b[0m (npx total-recall ${f.replace('.mjs', '')})`);
          });
        }
      }
    }
    if (!foundAny) {
      console.log('No custom commands found.');
    }
  } else if (action === 'remove') {
    const commandPath = path.join(commandsDir, `${name}.mjs`);
    if (fs.existsSync(commandPath)) {
      fs.unlinkSync(commandPath);
      console.log(`\x1b[32m✔ Successfully removed custom command: \x1b[1m${name}\x1b[0m`);
    } else {
      console.error(`Error: Custom command '${name}' does not exist.`);
      process.exit(1);
    }
  } else {
    console.error(`Unknown action: ${action}`);
    printHelp();
    process.exit(1);
  }
}
