import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

const digest = value => crypto.createHash('sha256').update(value).digest('hex');

export function validateConfig(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Configuration must be an object');
  if (typeof input.node !== 'string' || !input.node.trim()) throw new Error('Select a mesh node');
  if (typeof input.autoApply !== 'boolean') throw new Error('autoApply must be explicitly true or false');
  if (!Number.isInteger(input.maxTokens) || input.maxTokens < 100 || input.maxTokens > 10000) throw new Error('maxTokens must be 100..10000');
  if (!Array.isArray(input.roots) || !input.roots.length) throw new Error('Authorize at least one skill root');
  const roots = input.roots.map(root => {
    if (!root || !path.isAbsolute(root.path || '')) throw new Error('Skill root must be an absolute path on the selected node');
    if (!['global', 'repository'].includes(root.scope)) throw new Error('Root scope must be global or repository');
    const physical = fs.realpathSync(root.path);
    if (!fs.statSync(physical).isDirectory()) throw new Error('Skill root must be a directory');
    if (physical.split(path.sep).some(part => ['node_modules', 'memory-vault', 'memory-derived', '.git'].includes(part))) throw new Error('Unauthorized skill root');
    if (root.scope === 'global') return { path: physical, scope: 'global' };
    if (!path.isAbsolute(root.repoRoot || '')) throw new Error('Repository root must be explicit');
    const repoRoot = fs.realpathSync(root.repoRoot);
    if (!physical.startsWith(repoRoot + path.sep)) throw new Error('Skill root must belong to its repository');
    return { path: physical, scope: 'repository', repoRoot };
  });
  return { node: input.node.trim(), autoApply: input.autoApply, maxTokens: input.maxTokens, roots };
}

// Include supporting references: a changed requirement invalidates the cached audit.
export function packageHash(dir) {
  const entries = [];
  function visit(folder) {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith('.') || ['node_modules', 'memory-vault', 'memory-derived'].includes(entry.name)) continue;
      const target = path.join(folder, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Skill package contains a symlink; review required');
      if (entry.isDirectory()) visit(target);
      else if (entry.isFile()) entries.push([path.relative(dir, target), digest(fs.readFileSync(target))]);
    }
  }
  visit(dir);
  return digest(JSON.stringify(entries));
}

export async function inspect(config, previous, api, { apply = false } = {}) {
  const configHash = digest(JSON.stringify(config));
  const cached = previous?.configHash === configHash && previous?.applied === apply ? previous.packages || {} : {};
  const packages = {}, results = [];
  for (const root of config.roots) {
    const options = { maxTokens: config.maxTokens, apply, ...(root.scope === 'global' ? { globalRoot: root.path } : { repoRoot: root.repoRoot }) };
    for (const dir of api.skillDirectories(root.path)) {
      try {
        const before = packageHash(dir);
        if (cached[dir]?.hash === before) {
          packages[dir] = cached[dir];
          results.push({ ...cached[dir].result, cached: true });
          continue;
        }
        const result = api.optimizeSkills([dir], options)[0];
        results.push(result);
        packages[dir] = { hash: packageHash(dir), result: result.status === 'applied' ? { ...result, status: 'current', reason: 'previously-applied', saved: 0 } : result };
      } catch (err) { results.push({ path: dir, status: 'error', reason: err.message }); }
    }
  }
  return { at: new Date().toISOString(), configHash, applied: apply, packages, results,
    counts: results.reduce((counts, result) => ({ ...counts, [result.status]: (counts[result.status] || 0) + 1 }), {}) };
}

export async function run(argv) {
  const packageRoot = process.env.TR_PACKAGE_ROOT;
  if (!packageRoot) throw new Error('Run through total-recall skill-manager');
  const load = module => import(pathToFileURL(path.join(packageRoot, 'src/core', module)).href);
  const [{ getPlugin }, store, mesh, optimizer, { taskRunsOnNode }] = await Promise.all([
    load('plugin-loader.mjs'), load('plugin-store.mjs'), load('mesh.mjs'), load('skill-optimizer.mjs'), load('plugin-tasks.mjs')
  ]);
  const plugin = getPlugin('skill-manager');
  if (!plugin?.valid) throw new Error('Install a valid skill-manager plugin first');
  const command = argv[3] || 'status';
  let record = store.readPluginRecord(plugin);
  if (command === 'configure') {
    if (argv.length !== 5) throw new Error('Usage: skill-manager configure <JSON file on selected node>');
    const config = validateConfig(JSON.parse(fs.readFileSync(argv[4], 'utf8')));
    if (!taskRunsOnNode({ command: 'optimize', placement: 'selected-node' }, { task_nodes: { optimize: config.node } }, mesh.getMeshSelf())) {
      throw new Error('Configure on the selected node using mesh exec <node>; no remote paths are guessed');
    }
    await store.patchPluginRecord(plugin, { optimizer_config: config, task_nodes: { ...record?.task_nodes, optimize: config.node } });
    console.log(JSON.stringify({ configured: true, ...config }));
    return;
  }
  if (command === 'status') {
    console.log(JSON.stringify({ configured: !!record?.optimizer_config, node: record?.task_nodes?.optimize || null,
      config: record?.optimizer_config || null, lastReport: record?.optimizer_report || null }));
    return;
  }
  if (!['audit', 'optimize'].includes(command)) throw new Error('Unknown skill-manager command');
  if (!record?.optimizer_config) throw new Error('Configure authorized roots and a selected node first');
  if (!taskRunsOnNode({ command: 'optimize', placement: 'selected-node' }, record, mesh.getMeshSelf())) throw new Error('This is not the selected mesh node');
  const config = validateConfig(record.optimizer_config);
  const report = await inspect(config, record.optimizer_report, optimizer, { apply: command === 'optimize' && config.autoApply });
  await store.patchPluginRecord(plugin, { optimizer_report: report });
  console.log(JSON.stringify(report));
  if (report.counts.error) process.exitCode = 1;
  else if (report.counts.review) process.exitCode = 2;
}
