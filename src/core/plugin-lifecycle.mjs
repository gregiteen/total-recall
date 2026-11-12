import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { FileLeaseStore } from '@ssss/cli/leases';
import { globalPluginsDir, projectPluginsDir } from './plugin-loader.mjs';

/** Use only real directories below the repository, including any archive parents. */
function directory(root, names, create = false) {
  let target = root;
  for (const name of names) {
    target = path.join(target, name);
    let stat = fs.lstatSync(target, { throwIfNoEntry: false });
    if (!stat && create) {
      try { fs.mkdirSync(target, { mode: 0o700 }); }
      catch (error) { if (error.code !== 'EEXIST') throw error; }
      stat = fs.lstatSync(target);
    }
    if (!stat) return null;
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Plugin lifecycle paths must be real directories.');
  }
  return target;
}

export async function withRepositoryPluginLifecycle(projectRoot, id, change) {
  if (!projectRoot) return change(null);
  if (!/^[a-z][a-z0-9-]{1,63}$/.test(id)) throw new Error('Invalid plugin identity');
  const root = fs.realpathSync(projectRoot);
  const brainPath = path.dirname(projectPluginsDir(root));
  const shared = path.dirname(globalPluginsDir());
  if (brainPath === path.resolve(shared) ||
      (fs.existsSync(brainPath) && fs.existsSync(shared) && fs.realpathSync(brainPath) === fs.realpathSync(shared))) {
    return change(null);
  }
  const brain = directory(root, path.relative(root, brainPath).split(path.sep), true);
  const store = new FileLeaseStore(directory(brain, ['config', 'plugin-activation-leases'], true));
  const lease = await store.acquire({ workspace_id: 'plugin-activation', target: id, principal_id: 'total-recall', operation_id: crypto.randomUUID() }, 120_000);
  try {
    return await change(brain);
  } finally {
    await store.release(lease);
  }
}

/** Move the complete local runtime directory without copying or traversing its contents. */
export function moveRepositoryPluginState(brain, id, direction) {
  if (!brain) return { ok: true, state: 'none' };
  const live = ['plugin-state'];
  const archive = ['config', 'plugin-state-archive'];
  const restoring = direction === 'restore';
  const source = directory(brain, [...(restoring ? archive : live), id]);
  const destination = restoring ? live : archive;
  const existing = directory(brain, [...destination, id]);
  if (source && existing) throw new Error('Active and archived plugin state both exist. Both copies were preserved.');
  if (!source) return { ok: true, state: !restoring && existing ? 'already-archived' : 'none' };
  const parent = directory(brain, destination, true);
  fs.renameSync(source, path.join(parent, id));
  return { ok: true, state: restoring ? 'restored' : 'archived' };
}
