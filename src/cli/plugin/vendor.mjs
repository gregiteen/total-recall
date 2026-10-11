import { vendorPlugin as vendor, listBricks } from '../../core/plugin-vendor.mjs';

export async function vendorPlugin(args = []) {
  const positional = args.filter((a) => !a.startsWith('-'));
  const [source, dest] = positional;
  if (!source) {
    console.error('❌ Error: Missing plugin source.');
    console.error('   Usage: total-recall plugin vendor <bundled-id | git-url | path> [directory]');
    console.error('   Adds the plugin to this project as a brick (default: bricks/<id>), recorded in tr-bricks.json.');
    console.error('   The project then owns the code and does not depend on the plugin or Total Recall at runtime.\n');
    process.exit(1);
  }
  try {
    const result = await vendor(source, dest, { projectRoot: process.cwd() });
    console.log(`\n✅ Added brick '${result.id}' v${result.version} (${result.files} files) at ${result.dest}`);
    console.log(`   sha256: ${result.sha256}`);
    const deps = Object.entries(result.dependencies).map(([k, v]) => `${k}@${v}`);
    if (deps.length) console.log(`   Dependencies to add to your project: ${deps.join(', ')}`);
    console.log('   Add its tests to your gates. Run `total-recall plugin bricks` to list bricks.\n');
  } catch (err) {
    console.error(`❌ ${err.message}`);
    process.exit(1);
  }
}

export function listProjectBricks(args = []) {
  const bricks = listBricks(process.cwd());
  if (args.includes('--json')) {
    console.log(JSON.stringify(bricks, null, 2));
    return;
  }
  if (!bricks.length) {
    console.log('No bricks in this project. Add one with: total-recall plugin vendor <id>');
    return;
  }
  for (const b of bricks) console.log(`${b.id}\tv${b.version}\t${b.dir}\t${b.status}`);
}
