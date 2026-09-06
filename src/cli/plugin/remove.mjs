import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export async function removePlugin(args = []) {
  const isGlobal = args.includes('--global') || args.includes('-g');
  const cleanArgs = args.filter(a => a !== '--global' && a !== '-g');

  const id = cleanArgs[0];

  if (!id) {
    console.error('❌ Error: Missing plugin ID to remove.');
    console.error('   Usage: total-recall plugin remove <id> [--global]\n');
    process.exit(1);
  }

  const searchDirs = isGlobal
    ? [path.join(os.homedir(), '.agent', 'plugins')]
    : [
        path.join(process.cwd(), '.agent', 'plugins'),
        path.join(os.homedir(), '.agent', 'plugins')
      ];

  let targetPath = null;
  for (const dir of searchDirs) {
    const candidate = path.join(dir, id);
    if (fs.existsSync(candidate)) {
      targetPath = candidate;
      break;
    }
  }

  if (!targetPath) {
    console.error(`❌ Plugin '${id}' was not found in installed plugin directories.`);
    process.exit(1);
  }

  try {
    const stat = fs.lstatSync(targetPath);
    if (stat.isSymbolicLink()) {
      fs.unlinkSync(targetPath);
      console.log(`\n✅ Unlinked plugin '${id}' from ${targetPath}\n`);
    } else {
      fs.rmSync(targetPath, { recursive: true, force: true });
      console.log(`\n✅ Removed plugin '${id}' from ${targetPath}\n`);
    }
  } catch (err) {
    console.error(`❌ Failed to remove plugin '${id}': ${err.message}`);
    process.exit(1);
  }
}
