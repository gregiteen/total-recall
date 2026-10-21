/** Rebuild host projections after an owned command mutation. */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const MUTATIONS = new Set(['create', 'update', 'remove', 'rollback', 'promote']);

export async function compileCommandMutation(args, { projectRoot = process.cwd(), packageRoot = process.env.TR_PACKAGE_ROOT, compile } = {}) {
  if (!compile) {
    if (!packageRoot || !path.isAbsolute(packageRoot)) throw new Error('Verified Total Recall host package context required for automatic compilation');
    const root = fs.realpathSync(packageRoot);
    if (JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).name !== 'total-recall-brain') throw new Error('Selected host is not a Total Recall package');
    const host = await import(pathToFileURL(path.join(root, 'src/core/plugin-store.mjs')).href);
    compile = host.recompileAfterPluginMutation;
  }
  const result = await compile(projectRoot, args.includes('--global') || args.includes('--group'));
  if (!result?.ok) throw new Error(`Command changed but automatic compilation failed: ${result?.error || 'compiler returned no success'}; run total-recall compile`);
  return result;
}
