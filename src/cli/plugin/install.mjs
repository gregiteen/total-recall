import { installPlugin as install } from '../../core/plugin-distribution.mjs';
import { syncPluginCommands } from '../command.mjs';

export async function installPlugin(args = []) {
  const isGlobal = args.includes('--global') || args.includes('-g');
  const isLink = args.includes('--link') || args.includes('-l');
  const source = args.find(a => !a.startsWith('-'));

  if (!source) {
    console.error('❌ Error: Missing plugin source.');
    console.error('   Usage: total-recall plugin install <bundled-id | share-link | peer:<host>/<id> | git-url | path> [--link] [--global]\n');
    process.exit(1);
  }

  try {
    const result = await install(source, { projectRoot: process.cwd(), global: isGlobal, link: isLink });
    const from = result.source.kind === 'peer' ? `peer ${result.source.peer_hostname}` : result.source.kind;
    console.log(`\n✅ Installed '${result.plugin.name}' (id: ${result.plugin.id}, v${result.plugin.version}) from ${from}`);
    console.log(`   Location: ${result.plugin.dir}`);
    console.log(`   sha256:   ${result.sha256}`);
    if (result.dependencies?.installed) {
      console.log(`   Dependencies: installed ${result.dependencies.packages.length} package(s)`);
    } else if (result.dependencies?.reason && !['no package.json', 'no dependencies declared'].includes(result.dependencies.reason)) {
      console.log(`   Dependencies: NOT installed (${result.dependencies.reason})`);
    }
    const cmds = syncPluginCommands(result.plugin.dir, { global: isGlobal });
    if (cmds.created.length) console.log(`   Commands: ${cmds.created.map((c) => `total-recall ${c}`).join(', ')}`);
    for (const c of cmds.skipped) console.log(`   Skipped command '${c.name}': ${c.reason}`);
    console.log('');
    if (result.compilation?.ok === false) {
      console.error(`Plugin installed, but inventory/surface compilation failed: ${result.compilation.error}. Run total-recall compile.`);
      process.exitCode = 1;
      return;
    }
    const { autoCompileSurfaces } = await import('../../core/auto-compile.mjs');
    // Compile the layer the plugin actually landed in. `scope` is not enough on
    // its own: from a directory with no project brain, projectPluginsDir(cwd)
    // resolves to the global plugins dir, so a plugin installed into the global
    // brain still reports scope 'project'. Ask the resolver whether a project
    // brain exists at all, and otherwise fall back to the global layer — the one
    // that was really written. Assuming 'project' compiled nothing and printed
    // "Auto-compile failed: No project brain found" after a successful install.
    const { resolveBrainDir } = await import('../agent-dir.mjs');
    let targetLayer = 'global';
    try { resolveBrainDir('project'); targetLayer = 'project'; } catch { targetLayer = 'global'; }
    if (!await autoCompileSurfaces({ layer: targetLayer, semantic: false, force: true })) process.exitCode = 1;
  } catch (err) {
    console.error(`❌ ${err.message}`);
    process.exit(1);
  }
}
