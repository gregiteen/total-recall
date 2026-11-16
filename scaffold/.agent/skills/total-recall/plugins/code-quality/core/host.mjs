/** Bind to the executing Total Recall host, including checker subprocesses. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function nativeHostRoot(entry = process.argv[1]) {
  try {
    const bin = fs.realpathSync(entry);
    return path.basename(bin) === 'total-recall.mjs' ? path.dirname(path.dirname(bin)) : null;
  } catch { return null; }
}

export function hostRoot(env = process.env, entry = process.argv[1]) {
  let root = env.TR_PACKAGE_ROOT || nativeHostRoot(entry);
  if (!root) {
    try {
      const module = fileURLToPath(import.meta.resolve('total-recall-brain/src/core/ensure-dependencies.mjs'));
      root = path.resolve(path.dirname(module), '../..');
    } catch { /* A standalone plugin must be bound to a host. */ }
  }
  try {
    if (!root || JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).name !== 'total-recall-brain') {
      throw new Error('not a Total Recall package');
    }
    return fs.realpathSync(root);
  } catch (error) {
    throw new Error(`Total Recall dependency owner unavailable: ${error.message}. Run through the total-recall CLI or set TR_PACKAGE_ROOT to its installed package.`);
  }
}

export async function dependencyOwner() {
  const root = hostRoot();
  try {
    const owner = await import(pathToFileURL(path.join(root, 'src/core/ensure-dependencies.mjs')).href);
    if (typeof owner.ensureDependencies !== 'function') throw new Error('ensureDependencies export is missing');
    return owner.ensureDependencies;
  } catch (error) {
    throw new Error(`Total Recall dependency owner unavailable at ${root}: ${error.message}`);
  }
}
