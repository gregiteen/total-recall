/** Exact source identity shared by release snapshots and the pre-push gate. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hash = createHash('sha256');
const files = [];
function walk(relative) {
  const full = path.join(root, relative);
  if (!fs.existsSync(full)) return;
  const stat = fs.lstatSync(full);
  if (stat.isSymbolicLink()) throw new Error(`Source symlink cannot certify a release: ${relative}`);
  if (stat.isDirectory()) {
    for (const name of fs.readdirSync(full).sort()) {
      if (['node_modules', 'dist', '.git', 'reports', '.DS_Store'].includes(name)) continue;
      walk(path.join(relative, name));
    }
  } else files.push(relative);
}
for (const entry of ['bin', 'src', 'scripts', 'templates', 'scaffold', 'fixtures', 'extension', 'models', 'ssss-registry.lock.json', 'frontend/src', 'frontend/package.json', 'frontend/package-lock.json', 'frontend/index.html', 'frontend/vite.config.ts', 'frontend/tsconfig.json', 'frontend/tsconfig.app.json', 'frontend/tsconfig.node.json', 'package.json', 'package-lock.json', 'vitest.config.ts', 'route-manifest.json', 'metadata.plugin.schema.json', 'README.md']) walk(entry);
for (const file of files.sort()) hash.update(file.replaceAll(path.sep, '/') + '\0').update(fs.readFileSync(path.join(root, file))).update('\0');
console.log(`source_sha256=${hash.digest('hex')}`);
