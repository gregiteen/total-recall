/** One CLI discovery view: installed plugin operations plus owned composed commands. */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { commandList } from './command.mjs';
import { getCommandTargets } from './resolve.mjs';

export async function buildCliLibrary({ projectRoot = process.cwd(), packageRoot = process.env.TR_PACKAGE_ROOT, loadCatalog } = {}) {
  if (!loadCatalog) {
    if (!packageRoot || !path.isAbsolute(packageRoot)) throw new Error('Verified Total Recall host package context required for CLI library');
    const root = fs.realpathSync(packageRoot);
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    if (pkg.name !== 'total-recall-brain') throw new Error('Selected host is not a Total Recall package');
    const module = await import(pathToFileURL(path.join(root, 'src/core/plugin-catalog.mjs')).href);
    loadCatalog = module.buildPluginCatalog;
  }
  const catalog = await loadCatalog(projectRoot);
  const composedCommands = commandList(getCommandTargets({ cwd: projectRoot })).map(item => ({
    name: item.name, scope: item.scope, description: item.description || '', risk: item.risk || null,
    command: `total-recall ${item.name}`,
  }));
  return { ...catalog, composedCommands, evidence: 'Declared local capabilities; provider readiness requires execution verification' };
}
