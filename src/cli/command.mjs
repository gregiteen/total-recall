import fs from 'node:fs';
import path from 'node:path';
import { resolveBrainLayer } from '../core/config.mjs';

function printHelp() {
  console.log(`
  total-recall command — Manage project-local custom CLI commands

  Usage:
    total-recall command create <name> "<code>"   Create a new custom CLI command
    total-recall command remove <name>            Remove a custom CLI command

  Examples:
    npx total-recall command create hello "console.log('Hello from the brain!');"
    npx total-recall command remove hello
`);
}

export default async function commandCmd(args) {
  const action = args[0];
  const name = args[1];

  if (!action || action === '--help' || action === '-h') {
    printHelp();
    return;
  }

  if (!name) {
    console.error(`Error: Missing command name.`);
    console.error(`Usage: total-recall command ${action} <name>`);
    process.exit(1);
  }

  // Ensure this is run in a project
  let projectBrain;
  try {
    projectBrain = resolveBrainLayer('project');
  } catch (err) {
    console.error(`Error: You must be inside a Total Recall project to manage custom commands.`);
    console.error(err.message);
    process.exit(1);
  }

  const commandsDir = path.join(projectBrain.agentDir, 'commands');

  if (action === 'create') {
    const code = args[2];
    if (!code) {
      console.error(`Error: Missing code snippet for the command.`);
      console.error(`Usage: total-recall command create <name> "<code>"`);
      process.exit(1);
    }

    if (!fs.existsSync(commandsDir)) {
      fs.mkdirSync(commandsDir, { recursive: true });
    }

    const commandPath = path.join(commandsDir, `${name}.mjs`);
    
    // Wrap code in a default exported function for CLI execution
    const fileContent = `// Auto-generated custom CLI command: ${name}
export default async function run(args) {
  ${code}
}
`;

    fs.writeFileSync(commandPath, fileContent, 'utf8');
    console.log(`\x1b[32m✔ Successfully created custom command: \x1b[1mnpx total-recall ${name}\x1b[0m`);
    console.log(`  Saved to: ${commandPath}`);
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
