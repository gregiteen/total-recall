import { parseArgs } from 'node:util';
import { auditUiChunkCoverage, getUiChunk, searchUiChunks, uiChunkRegistryPath, validateUiChunkFile } from '../../core/ui-chunks.mjs';
import { chooseUiChunk } from '../../core/ui-chunk-choice.mjs';

const help = [
  'Usage: total-recall plugin chunks [query] [--plugin ID] [--surface page|left|right|bottom] [--limit N] [--decision] [--json]',
  '       total-recall plugin chunks get <plugin:id> [--surface SURFACE] [--json]',
  '       total-recall plugin chunks validate <file> [--plugin-dir DIR] [--json]',
  '       total-recall plugin chunks registry',
  '       total-recall plugin chunks coverage [--plugin ID] [--json]',
  '',
  'Use --decision with a concise, non-sensitive query to request a ranked choice through the configured Decision plugin.',
  'Search and validation run locally by default. Decision requests send only the query and up to 20 eligible metadata records.',
].join('\n');

export async function runPluginChunks(args) {
  const asJson = args.includes('--json');
  try {
    const { values, positionals } = parseArgs({
      args,
      allowPositionals: true,
      options: {
        json: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
        decision: { type: 'boolean' },
        surface: { type: 'string' },
        plugin: { type: 'string' },
        limit: { type: 'string' },
        'plugin-dir': { type: 'string' },
      },
    });
    if (values.help) return console.log(help);

    const [verb, target, ...extra] = positionals;
    if (verb === 'coverage') {
      if (target || values.decision || values.surface || values.limit || values['plugin-dir']) throw new Error(help);
      const plugins = auditUiChunkCoverage({ plugin: values.plugin });
      if (values.plugin && !plugins.length) throw new Error('Plugin is not installed.');
      if (asJson) return console.log(JSON.stringify({ ok: true, plugins }));
      for (const item of plugins) {
        const bound = item.operations.total - item.operations.missing.length;
        console.log(`${item.plugin}: ${item.pageBlocks} page blocks, ${bound}/${item.operations.total} operations, ${item.dataBindings.length} data bindings, design ${item.design || 'missing'}${item.partial ? ' (partial audit)' : ''}`);
      }
      return;
    }
    if (verb === 'registry') {
      if (target || values.decision || values.surface || values.plugin || values.limit || values['plugin-dir']) throw new Error(help);
      return console.log(asJson ? JSON.stringify({ ok: true, file: uiChunkRegistryPath }) : uiChunkRegistryPath);
    }
    if (verb === 'validate') {
      if (!target || extra.length || values.decision || values.surface || values.plugin || values.limit) throw new Error(help);
      const chunk = validateUiChunkFile(target, { pluginDir: values['plugin-dir'] });
      return console.log(asJson ? JSON.stringify({ ok: true, chunk }) : 'Validated ' + chunk.key);
    }
    if (values['plugin-dir']) throw new Error('--plugin-dir is only available with validate.');
    if (verb === 'get') {
      if (!target || extra.length || values.decision || values.plugin || values.limit) throw new Error(help);
      const [plugin, id, ...rest] = target.split(':');
      if (!plugin || !id || rest.length) throw new Error('Specify a chunk as plugin:id.');
      const chunk = getUiChunk(plugin, id, { surface: values.surface });
      if (!chunk) throw new Error('UI chunk unavailable.');
      return console.log(asJson ? JSON.stringify({ ok: true, chunk }) : chunk.html);
    }

    const query = positionals.join(' ').trim();
    const limit = values.limit === undefined ? undefined : Number(values.limit);
    if (values.decision && !query) throw new Error('--decision requires an explicit query.');
    const result = searchUiChunks({ plugin: values.plugin, surface: values.surface, query, limit });
    if (values.decision) result.selection = await chooseUiChunk(result.chunks, query, values.surface);
    if (asJson) return console.log(JSON.stringify({ ok: true, ...result }));
    for (const chunk of result.chunks) console.log(chunk.key + '  ' + chunk.title + '  [' + chunk.surfaces.join(', ') + ']');
    if (!result.chunks.length) console.log('No eligible UI chunks.');
    for (const issue of result.diagnostics) {
      console.error(issue.plugin + (issue.id ? ':' + issue.id : '') + '  ' + issue.message);
    }
    if (result.selection) {
      const { key, source, reason } = result.selection;
      console.log('Selection (' + source + '): ' + (key ?? 'none') + (reason ? ' (' + reason + ')' : ''));
    }
  } catch (error) {
    process.exitCode = 1;
    if (asJson) console.log(JSON.stringify({ ok: false, error: error.message }));
    else console.error(error.message);
  }
}
