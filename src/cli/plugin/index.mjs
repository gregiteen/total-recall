import { listPlugins } from './list.mjs';
import { installPlugin } from './install.mjs';
import { removePlugin } from './remove.mjs';
import { searchCatalog } from './search.mjs';
import { getPlugin } from '../../core/plugin-loader.mjs';

function printHelp() {
  console.log(`
🔌 Total Recall — Plugin Management System

Usage:
  npx total-recall plugin <command> [options]

Commands:
  search [query]            Search plugin catalog (--json for pipelines)
  catalog                   Browse the full catalog
  list                      List all installed plugins (project & global)
  install <path|git-url>    Install or link a plugin
                              --link, -l    Symlink local directory instead of copying
                              --global, -g  Install to ~/.agent/plugins/
  remove <id>               Uninstall or unlink an installed plugin
  info <id>                 Inspect detailed manifest for an installed plugin

Examples:
  npx total-recall plugin list
  npx total-recall plugin install ./path/to/my-plugin --link
  npx total-recall plugin install https://github.com/org/scientific-frontiers.git
  npx total-recall plugin info scientific-frontiers
  npx total-recall plugin remove scientific-frontiers
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

  if (command === 'search' || command === 'catalog' || command === 'find') {
    await searchCatalog(rest);
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
    const id = rest[0];
    if (!id) {
      console.error('❌ Error: Missing plugin ID. Usage: total-recall plugin info <id>');
      process.exit(1);
    }
    const plugin = getPlugin(id, process.cwd());
    if (!plugin) {
      console.error(`❌ Plugin '${id}' not found.`);
      process.exit(1);
    }

    console.log(`\n🔌 Plugin: ${plugin.manifest.name || plugin.id}`);
    console.log(`   ID:          ${plugin.id}`);
    console.log(`   Version:     v${plugin.manifest.version || '0.0.0'}`);
    console.log(`   Description: ${plugin.manifest.description || '—'}`);
    console.log(`   Directory:   ${plugin.dir}`);
    console.log(`   Valid:       ${plugin.valid ? '✅ Yes' : '❌ No'}`);

    if (plugin.manifest.cli?.command) {
      console.log(`   CLI Command: total-recall ${plugin.manifest.cli.command}`);
    }

    const cats = plugin.manifest.ssss_schemas?.categories || [];
    if (cats.length > 0) {
      console.log(`   SSSS Categories:`);
      for (const c of cats) {
        console.log(`     - ${c.name} (${c.node_type || 'memory'}): ${c.description || ''}`);
      }
    }

    const tasks = plugin.manifest.tasks || [];
    if (tasks.length > 0) {
      console.log(`   Background Tasks:`);
      for (const t of tasks) {
        console.log(`     - [${t.schedule}] ${t.intent}`);
      }
    }

    const hooks = plugin.manifest.hooks || {};
    if (Object.keys(hooks).length > 0) {
      console.log(`   Lifecycle Hooks:`);
      for (const [h, script] of Object.entries(hooks)) {
        console.log(`     - ${h}: ${script}`);
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
