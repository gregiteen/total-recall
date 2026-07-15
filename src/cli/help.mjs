/**
 * total-recall help
 *
 * Interactive local offline help system.
 * Queries local specifications, SSSS layout, and command reference files.
 *
 * Usage:
 *   npx total-recall help <command|topic>
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..', '..');

export default async function run(argv) {
  const args = argv || [];
  const topic = args[0] ? args[0].toLowerCase() : null;
  const isJson = args.includes('--json') || args.includes('-j');

  const cliRefPath = path.join(ROOT, 'docs', 'reference', 'cli-reference.md');
  const ssssPath = path.join(ROOT, 'docs', 'SSSS.md');
  const archPath = path.join(ROOT, 'docs', 'ARCHITECTURE.md');

  if (!fs.existsSync(cliRefPath)) {
    console.error('  ❌ Error: Total Recall CLI reference docs not found.');
    process.exit(1);
  }

  const cliRefContent = fs.readFileSync(cliRefPath, 'utf8');

  if (!topic) {
    if (isJson) {
      console.log(JSON.stringify({
        description: "Total Recall Total Recall System Help System",
        command_documentation_path: cliRefPath,
        available_sections: ["architecture", "ssss", "commands"]
      }, null, 2));
      return;
    }
    // Print general guide with gorgeous formatting
    printGeneralHelp();
    return;
  }

  // Handle Architecture or SSSS topics
  if (topic === 'architecture' || topic === 'arch') {
    if (fs.existsSync(archPath)) {
      const archContent = fs.readFileSync(archPath, 'utf8');
      if (isJson) {
        console.log(JSON.stringify({ topic: 'architecture', content: archContent }, null, 2));
      } else {
        console.log(`\n\x1b[35m=== TOTAL RECALL ARCHITECTURE ===\x1b[0m\n`);
        console.log(archContent.slice(0, 3500) + '\n... (truncated for length)');
      }
      return;
    }
  }

  if (topic === 'ssss') {
    if (fs.existsSync(ssssPath)) {
      const ssssContent = fs.readFileSync(ssssPath, 'utf8');
      if (isJson) {
        console.log(JSON.stringify({ topic: 'ssss', content: ssssContent }, null, 2));
      } else {
        console.log(`\n\x1b[36m=== STRUCTURED SEMANTIC SYNTAX SYSTEM (SSSS) ===\x1b[0m\n`);
        console.log(ssssContent.slice(0, 3500) + '\n... (truncated for length)');
      }
      return;
    }
  }

  // Handle Config, Settings, or Environment topics
  if (topic === 'config' || topic === 'settings' || topic === 'environment' || topic === 'env') {
    const configSectionIdx = cliRefContent.indexOf('## Configuration & Environment Variables Reference');
    if (configSectionIdx !== -1) {
      const configContent = cliRefContent.slice(configSectionIdx);
      if (isJson) {
        console.log(JSON.stringify({ topic: 'config', content: configContent }, null, 2));
      } else {
        console.log(`\n\x1b[33m=== TOTAL RECALL CONFIGURATION & SETTINGS ===\x1b[0m\n`);
        console.log(configContent.trim());
        console.log('\n' + '─'.repeat(60) + '\n');
      }
      return;
    }
  }

  // Parse command-specific help from cli-reference.md
  // Header pattern: ### `command` or ### command
  const sections = cliRefContent.split(/\n(?=### )/);
  let matchedSection = null;

  for (const section of sections) {
    const lines = section.trim().split('\n');
    const header = lines[0] || '';
    // Extract command name from e.g. "### `connect`" or "### connect"
    const cmdMatch = header.match(/###\s+`?([a-zA-Z0-9_-]+)`?/);
    if (cmdMatch && cmdMatch[1].toLowerCase() === topic) {
      matchedSection = section;
      break;
    }
  }

  if (matchedSection) {
    if (isJson) {
      console.log(JSON.stringify({
        topic,
        documentation: matchedSection
      }, null, 2));
    } else {
      console.log(`\n\x1b[32m=== Help: total-recall ${topic} ===\x1b[0m\n`);
      // Beautify header-less lines
      const displayContent = matchedSection
        .replace(/^###\s+.*$/m, '')
        .trim();
      console.log(displayContent);
      console.log('\n' + '─'.repeat(60) + '\n');
    }
  } else {
    console.error(`  ❌ Error: No help section found for topic or command: "${topic}"`);
    console.error(`  Run 'npx total-recall help' to see the complete list of commands.`);
    process.exit(1);
  }
}

function printGeneralHelp() {
  console.log(`
  \x1b[1m\x1b[35m┌─────────────────────────────────────────────────────────┐\x1b[0m
  \x1b[1m\x1b[35m│  Total Recall Interactive Help System                   │\x1b[0m
  \x1b[1m\x1b[35m│  query local system documentation and architecture      │\x1b[0m
  \x1b[1m\x1b[35m└─────────────────────────────────────────────────────────┘\x1b[0m

  \x1b[1mUsage:\x1b[0m
    npx total-recall help <command>       Get detailed help on a specific subcommand
    npx total-recall help architecture    View total-recall system & directory architecture
    npx total-recall help ssss            View SSSS formatting & semantics rules
    npx total-recall help settings        View comprehensive configuration & environment settings

  \x1b[1mExamples:\x1b[0m
    npx total-recall help connect
    npx total-recall help settings
    npx total-recall help architecture

  \x1b[1mCore Memory Operations:\x1b[0m
    \x1b[33mremember\x1b[0m, \x1b[33mrecall\x1b[0m, \x1b[33mforget\x1b[0m, \x1b[33mbrain\x1b[0m, \x1b[33mmap\x1b[0m

  \x1b[1mCompilation & System Rules:\x1b[0m
    \x1b[33mcompile\x1b[0m, \x1b[33mrebuild\x1b[0m, \x1b[33mconnect\x1b[0m, \x1b[33mskill\x1b[0m, \x1b[33mimport-rules\x1b[0m

  \x1b[1mAgentic & Chat Operations:\x1b[0m
    \x1b[33mchat\x1b[0m, \x1b[33mcollab\x1b[0m, \x1b[33mcommand\x1b[0m, \x1b[33mresearch\x1b[0m, \x1b[33mdream\x1b[0m, \x1b[33mtask\x1b[0m, \x1b[33mshare\x1b[0m, \x1b[33mfriction\x1b[0m

  \x1b[1mData Ingestion & Portability:\x1b[0m
    \x1b[33mingest\x1b[0m, \x1b[33mexport\x1b[0m, \x1b[33mbackup\x1b[0m, \x1b[33mrestore\x1b[0m, \x1b[33msnapshot\x1b[0m, \x1b[33msync\x1b[0m, \x1b[33mmigrate\x1b[0m

  \x1b[1mSystem Lifecycle & Services:\x1b[0m
    \x1b[33minit\x1b[0m, \x1b[33msetup\x1b[0m, \x1b[33mstart\x1b[0m, \x1b[33mdaemon\x1b[0m, \x1b[33mstatus\x1b[0m, \x1b[33mrelay\x1b[0m, \x1b[33mdeploy\x1b[0m, \x1b[33mdeploy-ui\x1b[0m, \x1b[33muninstall\x1b[0m, \x1b[33mupgrade\x1b[0m

  \x1b[1mSecurity & Maintenance:\x1b[0m
    \x1b[33mdoctor\x1b[0m, \x1b[33mlint\x1b[0m, \x1b[33mconfig\x1b[0m, \x1b[33mkey\x1b[0m, \x1b[33msecret\x1b[0m, \x1b[33mgenerate-pat\x1b[0m, \x1b[33mhash-password\x1b[0m, \x1b[33mreset-password\x1b[0m
`);
}
