import { parseArgs } from 'node:util';
import { getUiChunk, searchUiChunks, uiChunkRegistryPath, validateUiChunkFile } from '../../core/ui-chunks.mjs';
import { getPluginById } from '../../core/plugin-loader.mjs';
import { pluginActivation } from '../../core/plugin-state.mjs';

const decisionLimit = 20;
const help = [
  'Usage: total-recall plugin chunks [query] [--plugin ID] [--surface page|left|right|bottom] [--limit N] [--decision] [--json]',
  '       total-recall plugin chunks get <plugin:id> [--surface SURFACE] [--json]',
  '       total-recall plugin chunks validate <file> [--plugin-dir DIR] [--json]',
  '       total-recall plugin chunks registry',
  '',
  'Use --decision with a concise, non-sensitive query to request a ranked choice through the configured Decision plugin.',
  'Search and validation run locally by default. Decision requests send only the query and up to 20 eligible metadata records.',
].join('\n');

async function requestChoice(state, questions) {
  const plugin = getPluginById('decision');
  if (!plugin?.valid || !pluginActivation(plugin, { projectRoot: process.cwd() }).enabled ||
      !plugin.manifest.cli?.subcommands?.some(command => command.name === 'run')) return null;
  const { runPluginCommand } = await import('../../core/plugin-runner.mjs');
  const run = await runPluginCommand(plugin, {
    subcommand: 'run',
    args: ['--state', JSON.stringify(state), '--questions', JSON.stringify(questions), '--json'],
    timeoutMs: 15_000,
  });
  if (!run.ok || run.truncated) return null;
  return JSON.parse(run.stdout);
}

export async function chooseUiChunk(chunks, query, surface, decide = requestChoice) {
  const shortlist = chunks.slice(0, decisionLimit);
  if (!shortlist.length) return { source: 'lexical', key: null, reason: 'no-matches' };
  const fallback = { source: 'lexical', key: shortlist[0].key };
  if (shortlist.length === 1) return { ...fallback, reason: 'single-match' };

  const criteria = Object.fromEntries(shortlist.map(chunk => {
    const description = [chunk.title, chunk.description, ...chunk.intents].join(' ').slice(0, 600);
    return [chunk.key, description];
  }));
  criteria.none = 'No eligible chunk fits this intent.';
  let result;
  try {
    result = await decide({ intent: query, surface: surface ?? null }, {
      selected_chunk: {
        type: 'choice',
        instructions: 'Select the single eligible workspace chunk that best fits the intent and target surface. Choose none when nothing fits.',
        criteria,
      },
    });
  } catch {
    return { ...fallback, reason: 'decision-unavailable' };
  }
  if (result?.ok !== true) return { ...fallback, reason: 'decision-unavailable' };
  const answer = result.answers?.selected_chunk;
  if (!answer || answer.act !== true || !Number.isFinite(answer.confidence) ||
      answer.confidence < 0.5 || answer.confidence > 1) {
    return { source: 'decision', key: null, reason: 'insufficient-confidence' };
  }
  if (answer.choice === 'none') return { source: 'decision', key: null, reason: 'no-fit', confidence: answer.confidence };
  if (!shortlist.some(chunk => chunk.key === answer.choice)) {
    return { source: 'decision', key: null, reason: 'invalid-choice' };
  }
  return { source: 'decision', key: answer.choice, confidence: answer.confidence };
}

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
