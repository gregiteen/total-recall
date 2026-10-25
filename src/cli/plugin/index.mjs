import { listPlugins } from './list.mjs';
import { installPlugin } from './install.mjs';
import { removePlugin, sharePlugin } from './remove.mjs';
import { listAvailable, listPeers, searchPlugins } from './search.mjs';
import { createPlugin } from './create.mjs';
import { vendorPlugin, listProjectBricks } from './vendor.mjs';
import { manageProjectPluginCopies } from './copies.mjs';
import { managePluginLicense } from './monetization.mjs';
import { getPlugin, getPluginMonetization } from '../../core/plugin-loader.mjs';
import { describePlugin } from '../../core/plugin-store.mjs';
import { buildPluginCatalog } from '../../core/plugin-catalog.mjs';
import { setPluginActive } from '../../core/plugin-activation.mjs';

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
  library [--plugin ID]      Installed CLI operation library (--json for agents)
  refresh                   Rebuild installed command inventories and instruction surfaces
  copies [dir] [--apply]    Audit this repository's leftover copies of the shared default
                            plugins; --apply removes only the ones identical to the shared install
  on <id> / off <id>         Enable/disable host execution for this repository alone
                              --all-repos   Change the shared setting for every repository
                              --clear       Drop this repository's override; follow the shared setting
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
                              --replace     Replace an install, retain previous source and restore on failure
                              --global, -g  Install for every project on this machine
  update [--check] [--json]  Reinstall every plugin whose git repo, mesh peer or source
                            directory moved ahead (--check only reports; also runs hourly
                            in 'update --automatic')
   share <id>                Offer an installed plugin by direct link and mesh
  unshare <id>              Stop offering it
  remove <id>               Uninstall (--global for the machine-wide copy)
  license <id> [cmd]        Check or activate plugin license (status, activate, verify)
  info <id>                 Manifest, provenance, hash and task history
  vendor <source> [dir]     Add a plugin to this project as a brick (default bricks/<id>); the
                            project then owns the code. <source>: bundled id, git URL or path.
                            --with-requires also adds missing bundled required bricks
  bricks [--json]           List this project's bricks and whether each was modified locally
  create <id>               Create a new empty plugin
                              --name <name>         Human-readable plugin name
                              --description <desc>  What it is for
                              --use-case <use>      Use case it serves (repeatable)
                              --category <cat>      Declare an SSSS memory category
                              --with-cli            Generate CLI command handler
                              --with-generator      Generate context generator
                              --with-ui             Generate token-driven panel element
                              --with-task           Declare a selected-node scheduled task
                              --task-command <cmd>  Task CLI subcommand (requires --with-task)
                              --task-schedule <cron> Five-field local-time schedule
                              --task-intent <text>   Human description of the task
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
  if (command === 'refresh') {
    const { recompileAfterPluginMutation } = await import('../../core/plugin-store.mjs');
    const result = await recompileAfterPluginMutation(process.cwd(), rest.includes('--global'));
    const { setupInstalledPlugins } = await import('../../core/plugin-setup.mjs');
    const setup = result.ok ? await setupInstalledPlugins() : {ok:false,results:[]};
    console.log(JSON.stringify({...result,setup,ok:result.ok && setup.ok}));
    if (!result.ok || !setup.ok) process.exitCode = 1;
    return;
  }
  if (command === 'on' || command === 'off') {
    const id = rest.find(argument => !argument.startsWith('-'));
    if (!id) throw new Error(`Usage: total-recall plugin ${command} <id> [--all-repos|--clear]`);
    const flags = rest.filter(argument => argument.startsWith('-'));
    const unknown = flags.find(flag => !['--all-repos', '--clear', '--json'].includes(flag));
    if (unknown) throw new Error(`Unsupported plugin ${command} option: ${unknown}`);
    if (flags.includes('--all-repos') && flags.includes('--clear')) throw new Error('Choose --all-repos or --clear, not both');
    if (flags.includes('--clear')) {
      if (command === 'off') throw new Error('--clear removes a repository override; use it with on, not off');
      const cleared = await setPluginActive(id, true, { clear: true });
      const activation = cleared.activation || {};
      console.log(flags.includes('--json') ? JSON.stringify(cleared)
        : `♻️  ${id} follows the shared setting again in this repository (${activation.state || 'unknown'})`);
      if (!cleared.compilation.ok) process.exitCode = 1;
      return;
    }
    const result = await setPluginActive(id, command === 'on', { scope: flags.includes('--all-repos') ? 'shared' : 'project' });
    const activation = result.activation || {};
    if (flags.includes('--json')) console.log(JSON.stringify(result));
    else console.log(`${command === 'on' ? '✅' : '⛔'} ${id} ${command === 'on' ? 'enabled' : 'disabled'} for ${result.scope === 'shared' ? 'every repository' : 'this repository'} (${activation.state || 'unknown'})`);
    if (!result.compilation.ok) process.exitCode = 1;
    return;
  }

  if (command === 'card' || command === 'card-face' || command === 'skin') {
    await managePluginCard(rest);
    return;
  }

  if (rest.includes('--help') || rest.includes('-h')) {
    printHelp();
    return;
  }

  if (command === 'copies' || command === 'duplicates') {
    await manageProjectPluginCopies(rest);
    return;
  }

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

  if (command === 'bricks') {
    listProjectBricks(rest);
    return;
  }

  if (command === 'vendor' || command === 'add-brick') {
    await vendorPlugin(rest);
    return;
  }

  if (!command || command === 'list') {
    await listPlugins(rest);
    return;
  }

  if (command === 'library') {
    const catalog = buildPluginCatalog(process.cwd());
    const index = rest.indexOf('--plugin');
    if (index >= 0) {
      const id = rest[index + 1];
      if (!id || !catalog.plugins.some(plugin => plugin.id === id)) throw new Error('Selected plugin is not installed');
      catalog.plugins = catalog.plugins.filter(plugin => plugin.id === id);
      catalog.commands = catalog.commands.filter(entry => entry.plugin === id);
    }
    if (rest.includes('--json')) console.log(JSON.stringify(catalog));
    else for (const entry of catalog.commands) console.log(`${entry.command} [${entry.effect || 'undeclared effect'}] — ${entry.description}`);
    return;
  }

  if (command === 'install' || command === 'add') {
    await installPlugin(rest);
    return;
  }

  if (command === 'update' || command === 'upgrade') {
    const { updateInstalledPlugins } = await import('../../core/plugin-updates.mjs');
    const { recompileAfterPluginMutation } = await import('../../core/plugin-store.mjs');
    // Only the shared plugin folder is maintained; repos switch shared plugins on and off.
    const report = await updateInstalledPlugins({ roots: [(await import('node:os')).homedir()], dryRun: rest.includes('--check') });
    if (report.updated > 0) await recompileAfterPluginMutation(process.cwd(), true);
    if (rest.includes('--json')) console.log(JSON.stringify(report, null, 2));
    else {
      const mark = { updated: '⬆️ ', current: '✅', behind: '⏳', failed: '❌', linked: '🔗', pinned: '📌', package: '📦', unmanaged: '⚠️ ' };
      for (const row of report.results) console.log(`${mark[row.status] || '•'} ${row.id || row.root} ${row.status}${row.version ? ` v${row.version}` : ''}${row.error ? ` — ${row.error}` : ''}`);
      console.log(`\n${report.updated} updated, ${report.failed} failed, ${report.unmanaged} with no install source`);
    }
    if (report.failed) process.exitCode = 1;
    return;
  }

  if (command === 'remove' || command === 'rm' || command === 'uninstall') {
    await removePlugin(rest);
    return;
  }

  if (command === 'license' || command === 'lic' || command === 'monetize') {
    await managePluginLicense(rest);
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
    for (const w of d.warnings || []) console.log(`   ⚠️  ${w}`);

    if (plugin.manifest?.monetization) {
      const mon = getPluginMonetization(plugin);
      console.log(`   Monetization: Model: ${mon.model} (${mon.priceFormatted})`);
      if (mon.license_key_secret) console.log(`   License Secret: ${mon.license_key_secret}`);
      if (mon.checkout_url) console.log(`   Checkout:    ${mon.checkout_url}`);
    }

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
