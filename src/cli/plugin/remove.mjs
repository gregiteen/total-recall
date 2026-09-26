import { uninstallPlugin, setPluginShared } from '../../core/plugin-store.mjs';
import { publicPluginShareUrl } from '../../core/plugin-public.mjs';

export async function removePlugin(args = []) {
  const isGlobal = args.includes('--global') || args.includes('-g');
  const id = args.find(a => !a.startsWith('-'));

  if (!id) {
    console.error('❌ Error: Missing plugin ID to remove.');
    console.error('   Usage: total-recall plugin remove <id> [--global]\n');
    process.exit(1);
  }

  try {
    const result = await uninstallPlugin(id, { projectRoot: process.cwd(), global: isGlobal ? true : undefined });
    console.log(`\n✅ Removed plugin '${id}' (${result.scope}) from ${result.dir}\n`);
  } catch (err) {
    console.error(`❌ ${err.message}`);
    process.exit(1);
  }
}

export async function sharePlugin(args = [], shared = true) {
  const id = args.find(a => !a.startsWith('-'));
  if (!id) {
    console.error(`❌ Error: Missing plugin ID. Usage: total-recall plugin ${shared ? 'share' : 'unshare'} <id>`);
    process.exit(1);
  }
  try {
    const plugin = await setPluginShared(id, shared, { projectRoot: process.cwd() });
    if (shared) {
      console.log(`\n✅ '${id}' is now shared (sha256 ${plugin.sha256?.slice(0, 16)}…).`);
      const url = publicPluginShareUrl(id, plugin.sha256);
      if (url) console.log(`   Send this link to another Total Recall user: ${url}`);
      else console.log('   Set TR_PUBLIC_BASE_URL to your public HTTPS origin to print a share link.');
      console.log('   Mesh peers can also install it with: npx total-recall plugin install peer:<this-node>/' + id + '\n');
    } else {
      console.log(`\n✅ '${id}' is no longer shared.\n`);
    }
  } catch (err) {
    console.error(`❌ ${err.message}`);
    process.exit(1);
  }
}
