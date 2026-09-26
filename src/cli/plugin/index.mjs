import { listPlugins } from './list.mjs';
import { installPlugin } from './install.mjs';
import { removePlugin, sharePlugin } from './remove.mjs';
import { listAvailable, listPeers, searchPlugins } from './search.mjs';
import { createPlugin } from './create.mjs';
import { getPlugin } from '../../core/plugin-loader.mjs';
import { describePlugin } from '../../core/plugin-store.mjs';

function printHelp() {
  console.log(`
🔌 Total Recall — Plugin Management System

Plugins customize Total Recall for a particular use: they add SSSS memory
categories, compiled context, CLI commands and scheduled tasks. They are shared
directly with other users using hash-pinned HTTPS links, or between your own
nodes over the mesh. There is no central catalog.

Usage:
  npx total-recall plugin <command> [options]

Commands:
  list                      Installed plugins (project & global) with source and sharing
  available [query]         Plugins bundled with this Total Recall package
  peers [query]             Plugins your mesh peers share (queried live)
  search <query>            Search bundled plugins and mesh peers
                              --use-case <use>  Only plugins declaring this use case
                              --json            Machine-readable output
  install <source>          Install a plugin. <source> is one of:
                              <id>                a bundled plugin
                              peer:<host>/<id>    a plugin shared by a mesh peer
                              <share-link>        a public HTTPS link with a SHA-256 pin
                              <git-url>           a git repository with plugin.json
                              <path>              a local directory
                              --link, -l    Symlink a local directory instead of copying
                              --global, -g  Install for every project on this machine
  share <id>                Offer an installed plugin by direct link and mesh
  unshare <id>              Stop offering it
  remove <id>               Uninstall (--global for the machine-wide copy)
  info <id>                 Manifest, provenance, hash and task history
  create <id>               Scaffold a new plugin
                              --name <name>         Human-readable plugin name
                              --description <desc>  What it is for
                              --use-case <use>      Use case it serves (repeatable)
                              --category <cat>      Declare an SSSS memory category
                              --with-cli            Generate CLI command handler
                              --with-generator      Generate context generator
                              --global, -g          Create machine-wide

Examples:
  npx total-recall plugin available --use-case software-development
  npx total-recall plugin install git-sentinel
  npx total-recall plugin share git-sentinel
  npx total-recall plugin peers
  npx total-recall plugin install peer:mac-mini/git-sentinel
  npx total-recall plugin create reading-list --use-case research --with-cli
`);
}

export async function run(argv = []) {
  let args = argv;
  if (Array.isArray(args) && args[0]?.endsWith('node')) {
    args = args.slice(2);
  }
  if (args[0] === 'plugin' || args[0] === 'plugins') {
    args = args.slice(1);
  }

  const command = args[0];
  const rest = args.slice(1);

  if (command === 'available' || command === 'bundled') {
    await listAvailable(rest);
    return;
  }

  if (command === 'peers' || command === 'mesh') {
    await listPeers(rest);
    return;
  }

  if (command === 'search' || command === 'find') {
    await searchPlugins(rest);
    return;
  }

  if (command === 'share' || command === 'unshare') {
    await sharePlugin(rest, command === 'share');
    return;
  }

  if (command === 'create' || command === 'new' || command === 'init' || command === 'scaffold') {
    await createPlugin(rest);
    return;
  }

  if (!command || command === 'list') {
    await listPlugins(rest);
    return;
  }

  if (command === 'install' || command === 'add') {
    await installPlugin(rest);
    return;
  }

  if (command === 'remove' || command === 'rm' || command === 'uninstall') {
    await removePlugin(rest);
    return;
  }

  if (command === 'info' || command === 'show') {
    const id = rest.find(a => !a.startsWith('-'));
    if (!id) {
      console.error('❌ Error: Missing plugin ID. Usage: total-recall plugin info <id>');
      process.exit(1);
    }
    const plugin = getPlugin(id, process.cwd());
    if (!plugin) {
      console.error(`❌ Plugin '${id}' is not installed. See: npx total-recall plugin available`);
      process.exit(1);
    }
    const d = describePlugin(plugin);
    if (rest.includes('--json')) {
      console.log(JSON.stringify({ ...d, manifest: plugin.manifest }, null, 2));
      return;
    }

    const src = d.source.kind === 'peer' ? `peer ${d.source.peer_hostname} (${d.source.ref})` : `${d.source.kind} (${d.source.ref})`;
    console.log(`\n🔌 Plugin: ${d.name}`);
    console.log(`   ID:          ${d.id}`);
    console.log(`   Version:     v${d.version}`);
    console.log(`   Description: ${d.description || '—'}`);
    if (d.use_cases.length) console.log(`   Use cases:   ${d.use_cases.join(', ')}`);
    console.log(`   Scope:       ${d.scope}${d.linked ? ' (symlinked)' : ''}`);
    console.log(`   Directory:   ${d.dir}`);
    console.log(`   Source:      ${src}`);
    console.log(`   Installed:   ${d.installed_at || 'unknown (no install record)'}`);
    console.log(`   sha256:      ${d.sha256 || '—'}${d.modified_since_install ? '  (changed since install)' : ''}`);
    console.log(`   Shared:      ${d.shared ? 'yes' : 'no'}`);
    if (d.share_url) console.log(`   Share link:  ${d.share_url}`);
    console.log(`   Valid:       ${d.valid ? '✅ Yes' : '❌ No'}`);
    for (const e of d.errors) console.log(`     - ${e}`);

    if (d.cli?.command) console.log(`   CLI Command: total-recall ${d.cli.command}`);
    if (d.categories.length > 0) {
      console.log(`   SSSS Categories:`);
      for (const c of d.categories) console.log(`     - ${c.name} (${c.node_type || 'memory'}): ${c.description || ''}`);
    }
    if (d.tasks.length > 0) {
      console.log(`   Scheduled Tasks:`);
      for (const t of d.tasks) {
        console.log(`     - [${t.schedule}] ${t.command} — ${t.intent} (last run: ${t.last_run || 'not yet'})`);
      }
    }
    console.log();
    return;
  }

  if (command === '--help' || command === '-h' || command === 'help') {
    printHelp();
    return;
  }

  console.error(`❌ Unknown plugin command: '${command}'`);
  printHelp();
  process.exit(1);
}

export default run;
