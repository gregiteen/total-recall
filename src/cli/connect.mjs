import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveAgentDir } from './agent-dir.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Resolve templates dir relative to this file (src/cli/ → ../../templates/)
const TEMPLATES_DIR = path.resolve(__dirname, '..', '..', 'templates');

const CLIENTS = {
  cursor: {
    label: 'Cursor',
    mode: 'file',
    target: path.join('.cursor', 'rules', 'total-recall.mdc'),
    render: instructions => [
      '---',
      'description: "Total Recall — Auto-generated behavioral memory surface."',
      'globs:',
      'alwaysApply: true',
      '---',
      '',
      instructions
    ].join('\n')
  },
  'claude-code': {
    label: 'Claude Code',
    mode: 'symlink',
    target: 'CLAUDE.md'
  },
  codex: {
    label: 'Codex',
    mode: 'symlink',
    target: 'AGENTS.md'
  },
  antigravity: {
    label: 'Antigravity',
    mode: 'symlink',
    target: 'AGENTS.md'
  },
  gemini: {
    label: 'Gemini',
    mode: 'symlink',
    target: 'GEMINI.md'
  },
  windsurf: {
    label: 'Windsurf',
    mode: 'file',
    target: path.join('.windsurf', 'rules', 'total-recall.md'),
    render: instructions => instructions
  },
  aider: {
    label: 'Aider',
    mode: 'file',
    target: '.aider.rules.md',
    render: instructions => instructions,
    after: [
      'Add this to .aider.conf.yml:',
      '',
      'read:',
      '  - .aider.rules.md'
    ].join('\n')
  },
  ultrachat: {
    label: 'UltraChat',
    mode: 'api'
    // No file projection: UltraChat connects via the OpenAI-compatible API.
    // The compiled INSTRUCTIONS.md is injected per-request by the server.
    // See docs/guides/ultrachat.md for session sync via /api/sessions/*.
  },
  obsidian: {
    label: 'Obsidian',
    mode: 'vault',
    // Symlinks ~/.agent/memory-vault/ into the Obsidian vault as "Total Recall/"
    // Obsidian indexes all SSSS nodes natively — graph view, backlinks, search.
    folderName: 'Total Recall'
  },
  mcp: {
    label: 'MCP Client',
    mode: 'mcp'
  },
  generic: {
    label: 'Generic OpenAI-Compatible Client',
    mode: 'api'
  }
};

function parseArgs(args) {
  const opts = {
    client: args[0] && !args[0].startsWith('--') ? args[0] : null,
    brain: null,
    token: null,
    vault: null,
    force: false,
    json: false,
    help: false
  };

  for (let i = opts.client ? 1 : 0; i < args.length; i++) {
    switch (args[i]) {
      case '--brain': opts.brain = args[++i]; break;
      case '--token': opts.token = args[++i]; break;
      case '--vault': opts.vault = args[++i]; break;
      case '--force': opts.force = true; break;
      case '--json': opts.json = true; break;
      case '--help':
      case '-h':
        opts.help = true;
        break;
    }
  }

  return opts;
}

function printHelp() {
  console.log(`
  total-recall connect — Configure an IDE or external system

  Usage: total-recall connect <client> [options]

  Clients:
    cursor
    claude-code
    codex
    antigravity
    gemini
    windsurf
    aider
    ultrachat
    obsidian
    mcp
    generic

  Options:
    --brain <url>      Brain base URL for API/MCP clients
    --token <token>    Bearer PAT for generated snippets
    --vault <path>     Obsidian vault path (auto-detected on macOS if omitted)
    --force            Overwrite generated target files
    --json             Emit machine-readable connection details
    --help, -h         Show this help
`);
}

function readInstructions(cwd, agentDir) {
  const candidates = [
    path.join(cwd, 'INSTRUCTIONS.md'),
    path.join(agentDir, 'INSTRUCTIONS.md')
  ];
  const found = candidates.find(file => fs.existsSync(file));
  if (!found) return null;
  return fs.readFileSync(found, 'utf8');
}

function ensureBrainConfig(agentDir, opts) {
  if (!opts.brain) return null;
  const configDir = path.join(agentDir, 'config');
  fs.mkdirSync(configDir, { recursive: true });
  const config = { url: opts.brain };
  if (opts.token) config.token = opts.token;
  const filePath = path.join(configDir, 'brain.json');
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2));
  return filePath;
}

function registerClient(agentDir, clientName, preset, projectionPath) {
  const configDir = path.join(agentDir, 'config');
  fs.mkdirSync(configDir, { recursive: true });
  const registryPath = path.join(configDir, 'clients.json');
  let registry = { clients: {} };
  if (fs.existsSync(registryPath)) {
    try { registry = JSON.parse(fs.readFileSync(registryPath, 'utf8')); }
    catch { /* corrupt file — start fresh */ }
  }
  registry.clients ??= {};
  registry.clients[clientName] = {
    label: preset.label,
    mode: preset.mode,
    projectionPath: projectionPath || null,
    connectedAt: new Date().toISOString()
  };
  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2), 'utf8');
}

function writeFileProjection(cwd, preset, instructions, opts) {
  const targetPath = path.join(cwd, preset.target);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const existed = fs.existsSync(targetPath);
  if (fs.existsSync(targetPath) && !opts.force) {
    return { targetPath, action: 'exists' };
  }
  const content = preset.render(instructions);
  fs.writeFileSync(targetPath, content, 'utf8');
  return { targetPath, action: existed ? 'written' : 'created' };
}

function writeSymlinkProjection(cwd, preset, opts) {
  const instructionsPath = path.join(cwd, 'INSTRUCTIONS.md');
  if (!fs.existsSync(instructionsPath)) {
    throw new Error(`Cannot create ${preset.target}: ${instructionsPath} does not exist. Run npx total-recall init or compile first.`);
  }

  const targetPath = path.join(cwd, preset.target);
  if (fs.existsSync(targetPath)) {
    if (!opts.force) return { targetPath, action: 'exists' };
    fs.rmSync(targetPath, { force: true, recursive: true });
  }
  fs.symlinkSync('INSTRUCTIONS.md', targetPath);
  return { targetPath, action: 'symlinked' };
}

function apiDetails(opts) {
  const base = (opts.brain || 'http://127.0.0.1:3000').replace(/\/$/, '');
  return {
    base_url: base,
    chat_completions_url: `${base}/v1/chat/completions`,
    models_url: `${base}/v1/models`,
    mcp_url: `${base}/mcp`,
    ssss_manifest_url: `${base}/api/ssss`,
    discovery_url: `${base}/.well-known/total-recall.json`,
    authorization_header: opts.token ? `Authorization: Bearer ${opts.token}` : 'Authorization: Bearer <PAT>'
  };
}

function detectObsidianVault() {
  // macOS: Obsidian stores vault paths in its app support config
  const obsidianConfig = path.join(
    os.homedir(), 'Library', 'Application Support', 'obsidian', 'obsidian.json'
  );
  if (fs.existsSync(obsidianConfig)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(obsidianConfig, 'utf8'));
      const vaults = Object.values(cfg.vaults || {});
      // Prefer the most recently opened vault
      const sorted = vaults.sort((a, b) => (b.ts || 0) - (a.ts || 0));
      if (sorted.length > 0 && sorted[0].path) return sorted[0].path;
    } catch { /* ignore parse errors */ }
  }
  // Linux: check common locations
  const xdgConfig = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  const linuxConfig = path.join(xdgConfig, 'obsidian', 'obsidian.json');
  if (fs.existsSync(linuxConfig)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(linuxConfig, 'utf8'));
      const vaults = Object.values(cfg.vaults || {});
      const sorted = vaults.sort((a, b) => (b.ts || 0) - (a.ts || 0));
      if (sorted.length > 0 && sorted[0].path) return sorted[0].path;
    } catch { /* ignore */ }
  }
  return null;
}

function writeVaultProjection(agentDir, preset, opts) {
  const vaultPath = opts.vault || detectObsidianVault();
  if (!vaultPath) {
    throw new Error(
      'Could not detect an Obsidian vault. Pass --vault <path> to specify one.\n' +
      '  e.g. total-recall connect obsidian --vault ~/Documents/MyVault'
    );
  }
  if (!fs.existsSync(vaultPath)) {
    throw new Error(`Obsidian vault not found: ${vaultPath}`);
  }

  const memoryVault = path.join(agentDir, 'memory-vault');
  if (!fs.existsSync(memoryVault)) {
    throw new Error(`Memory vault not found: ${memoryVault}. Run "total-recall init" first.`);
  }

  const linkPath = path.join(vaultPath, preset.folderName);
  const linkExists = fs.existsSync(linkPath) ||
    (() => { try { return fs.lstatSync(linkPath) && true; } catch { return false; } })();
  if (linkExists) {
    if (!opts.force) return { targetPath: linkPath, vaultPath, action: 'exists' };
    fs.rmSync(linkPath, { force: true, recursive: true });
  }
  fs.symlinkSync(memoryVault, linkPath);

  // Install Dataview query dashboard files into memory-vault/queries/
  // These are TR-native markdown files; Dataview renders them in Obsidian.
  const queriesTemplateDir = path.join(TEMPLATES_DIR, 'obsidian-queries');
  const queriesDestDir = path.join(memoryVault, 'queries');
  if (fs.existsSync(queriesTemplateDir)) {
    fs.mkdirSync(queriesDestDir, { recursive: true });
    for (const file of fs.readdirSync(queriesTemplateDir)) {
      const dest = path.join(queriesDestDir, file);
      if (!fs.existsSync(dest)) {
        fs.copyFileSync(path.join(queriesTemplateDir, file), dest);
      }
    }
  }

  return { targetPath: linkPath, vaultPath, action: 'symlinked' };
}

function printApiSnippet(client, details) {
  console.log(`\n  ${client.label} connection details\n`);
  console.log(`  Discovery: ${details.discovery_url}`);
  console.log(`  Models:    ${details.models_url}`);
  console.log(`  Chat:      ${details.chat_completions_url}`);
  console.log(`  MCP:       ${details.mcp_url}`);
  console.log(`  SSSS:      ${details.ssss_manifest_url}`);
  console.log(`  Auth:      ${details.authorization_header}`);
  console.log('\n  OpenAI-compatible config:');
  console.log(`    baseURL: ${details.base_url}/v1`);
  console.log('    model:   total-recall/gemma4');
}

export default async function connect(args) {
  const opts = parseArgs(args);
  if (opts.help || !opts.client) {
    printHelp();
    return;
  }

  const preset = CLIENTS[opts.client];
  if (!preset) {
    console.error(`Unknown client: ${opts.client}`);
    console.error(`Supported clients: ${Object.keys(CLIENTS).join(', ')}`);
    process.exit(1);
  }

  const cwd = process.cwd();
  const agentDir = process.env.AGENT_DIR || resolveAgentDir();
  const brainConfigPath = ensureBrainConfig(agentDir, opts);
  const details = apiDetails(opts);
  const result = {
    client: opts.client,
    label: preset.label,
    mode: preset.mode,
    brain_config_path: brainConfigPath,
    api: details,
    projection: null,
    notes: []
  };

  if (preset.mode === 'file') {
    const instructions = readInstructions(cwd, agentDir);
    if (!instructions) {
      throw new Error('No INSTRUCTIONS.md found. Run npx total-recall init or compile before connecting file-based IDEs.');
    }
    result.projection = writeFileProjection(cwd, preset, instructions, opts);
  } else if (preset.mode === 'symlink') {
    result.projection = writeSymlinkProjection(cwd, preset, opts);
  } else if (preset.mode === 'vault') {
    result.projection = writeVaultProjection(agentDir, preset, opts);
    result.notes.push([
      `  Vault linked: ${result.projection.vaultPath}/${preset.folderName}/`,
      `  → ${path.join(agentDir, 'memory-vault')}`,
      '',
      `  Open Obsidian and look for the "${preset.folderName}" folder.`,
      '  All SSSS memory nodes are visible in Graph View, Search, and Backlinks.',
      '',
      '  To back up via Obsidian Sync or iCloud, enable sync in Obsidian — the',
      `  symlinked folder will be included automatically.`
    ].join('\n'));
  }

  if (preset.after) result.notes.push(preset.after);

  // Record this client in the registry so `status` can report freshness
  registerClient(agentDir, opts.client, preset, result.projection?.targetPath || null);

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`\n  Total Recall connected: ${preset.label}`);
  if (result.projection) {
    const action = result.projection.action;
    const target = result.projection.targetPath;
    const display = preset.mode === 'vault' ? target : path.relative(cwd, target);
    console.log(`  Projection: ${action} ${display}`);
  }
  if (brainConfigPath) {
    console.log(`  Brain config: ${brainConfigPath}`);
  }
  if (preset.mode !== 'vault') {
    printApiSnippet(preset, details);
  }
  for (const note of result.notes) {
    console.log(`\n${note}`);
  }
  console.log();
}
