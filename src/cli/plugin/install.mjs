import { installPlugin as install } from '../../core/plugin-store.mjs';

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
    console.log(`   sha256:   ${result.sha256}\n`);
  } catch (err) {
    console.error(`❌ ${err.message}`);
    process.exit(1);
  }
}
