import { parseArgs } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import { auditUiChunkCoverage, getUiChunk, searchUiChunks, uiChunkRegistryPath, validateUiChunkFile } from '../../core/ui-chunks.mjs';
import { chooseUiChunk } from '../../core/ui-chunk-choice.mjs';
import { callApi } from '../api.mjs';

const help = [
  'Usage: total-recall plugin chunks [query] [--plugin ID] [--surface page|left|right|bottom] [--limit N] [--decision|--workspace] [--brain ID] [--json]',
  '       total-recall plugin chunks get <plugin:id> [--surface SURFACE] [--workspace] [--brain ID] [--json]',
  '       total-recall plugin chunks validate <file> [--plugin-dir DIR] [--json]',
  '       total-recall plugin chunks registry',
  '       total-recall plugin chunks coverage [--plugin ID] [--json]',
  '       total-recall plugin chunks add <id.md> --plugin ID [--brain ID] [--json]',
  '       total-recall plugin chunks page <id> --brain ID [--json]',
  '       total-recall plugin chunks page <id> <plugin:block>... --brain ID (--title TITLE | --revision VERSION) [--json]',
  '',
  'Use --decision with a concise, non-sensitive query to request a ranked choice through the configured Decision plugin.',
  'Search and validation run locally by default. Decision requests send only the query and up to 20 eligible metadata records.',
  'Agents use total-recall decision compose to publish a Jev-selected page.',
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
        workspace: { type: 'boolean' },
        brain: { type: 'string' },
        surface: { type: 'string' },
        plugin: { type: 'string' },
        limit: { type: 'string' },
        'plugin-dir': { type: 'string' },
        title: { type: 'string' },
        revision: { type: 'string' },
      },
    });
    if (values.help) return console.log(help);

    const [verb, target, ...extra] = positionals;
    if (verb === 'page') {
      const { brain, title, revision } = values;
      if (!target || !brain?.trim() || values.plugin || values.workspace || values.decision || values.surface || values.limit || values['plugin-dir']) throw new Error(help);
      const writing = extra.length > 0;
      const create = typeof title === 'string' && title.trim() && revision === undefined;
      const edit = typeof revision === 'string' && revision.trim() && title === undefined;
      if (writing ? !create && !edit : title !== undefined || revision !== undefined) throw new Error(help);
      const collection = '/api/workspace/pages';
      const detail = collection + '/' + encodeURIComponent(target);
      const response = !writing
        ? await callApi('GET', detail, { query: { brain } })
        : await callApi(edit ? 'PUT' : 'POST', edit ? detail : collection, {
          data: JSON.stringify({ id: target, brainId: brain, title, revision, keys: extra }),
        });
      if (!response.ok) throw new Error(response.body?.error || 'Could not access the saved page.');
      const page = response.body;
      if (asJson) return console.log(JSON.stringify({ ok: true, ...page }));
      console.log(page.path || `${page.title} (${page.version})`);
      for (const chunk of page.chunks) console.log(chunk.key);
      return;
    }
    if (values.title !== undefined || values.revision !== undefined) throw new Error(help);
    if (values.brain !== undefined && ((!values.workspace && verb !== 'add') || !values.brain.trim())) {
      throw new Error('--brain requires a registered brain ID and --workspace, or an add operation.');
    }
    if (values.workspace && (values.decision || ['add', 'coverage', 'registry', 'validate'].includes(verb))) throw new Error(help);
    if (verb === 'add') {
      if (!target || !values.plugin || extra.length || values.decision || values.surface || values.limit || values['plugin-dir'] || path.extname(target) !== '.md') throw new Error(help);
      const stat = fs.statSync(target);
      if (!stat.isFile() || stat.size > 64 * 1024) throw new Error('Choose a Markdown block no larger than 64 KiB.');
      const markdown = fs.readFileSync(target, 'utf8');
      const { ok, body } = await callApi('POST', '/api/ui-chunks/pool', {
        data: JSON.stringify({ plugin: values.plugin, id: path.basename(target, '.md'), markdown, brainId: values.brain }),
      });
      if (!ok) throw new Error(body?.error || 'The dashboard could not add the block.');
      return console.log(asJson ? JSON.stringify({ ok, ...body }) : 'Added ' + body.chunk.key);
    }
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
      const query = values.surface ? { surface: values.surface } : {};
      if (values.brain) query.brain = values.brain;
      const chunk = values.workspace
        ? (await callApi('GET', `/api/ui-chunks/${encodeURIComponent(plugin)}/${encodeURIComponent(id)}`, { query })).body?.chunk
        : getUiChunk(plugin, id, { surface: values.surface });
      if (!chunk) throw new Error('UI chunk unavailable.');
      return console.log(asJson ? JSON.stringify({ ok: true, chunk }) : chunk.html);
    }

    const query = positionals.join(' ').trim();
    const limit = values.limit === undefined ? undefined : Number(values.limit);
    if (values.decision && !query) throw new Error('--decision requires an explicit query.');
    let result;
    if (values.workspace) {
      const filters = Object.fromEntries(Object.entries({ plugin: values.plugin, surface: values.surface, q: query, limit, brain: values.brain }).filter(([, value]) => value !== undefined));
      const response = await callApi('GET', '/api/ui-chunks', { query: filters });
      if (!response.ok) throw new Error(response.body?.error || 'The dashboard could not read the workspace pool.');
      result = response.body;
    } else {
      result = searchUiChunks({ plugin: values.plugin, surface: values.surface, query, limit });
    }
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
