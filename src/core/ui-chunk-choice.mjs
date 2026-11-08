import { getPluginById } from './plugin-loader.mjs';
import { pluginActivation } from './plugin-state.mjs';

const decisionLimit = 20;

async function requestChoice(state, questions) {
  const plugin = getPluginById('decision');
  if (!plugin?.valid || !pluginActivation(plugin, { projectRoot: process.cwd() }).enabled ||
      !plugin.manifest.cli?.subcommands?.some(command => command.name === 'run')) return null;
  const { runPluginCommand } = await import('./plugin-runner.mjs');
  const run = await runPluginCommand(plugin, {
    subcommand: 'run',
    args: ['--state', JSON.stringify(state), '--questions', JSON.stringify(questions), '--json'],
    timeoutMs: 15_000,
  });
  if (!run.ok || run.truncated) return null;
  return JSON.parse(run.stdout);
}

export async function chooseUiChunk(chunks, query, surface, decide = requestChoice) {
  const result = await chooseBlocks(chunks, query, surface, ['selected_chunk'], decide);
  const { keys, ...selection } = result;
  return { ...selection, key: keys[0] ?? null };
}

export async function chooseUiComposition(chunks, query, decide = requestChoice) {
  return chooseBlocks(chunks, query, 'page', ['selected_chunk', 'supporting_chunk', 'reference_chunk'], decide);
}

const instructions = {
  selected_chunk: 'Choose the primary block that best accomplishes the requested intent.',
  supporting_chunk: 'Choose an additional block that helps accomplish the same task without repeating the primary block.',
  reference_chunk: 'Choose an optional readout or reference block that gives useful context for the task.',
};

async function chooseBlocks(chunks, query, surface, slots, decide) {
  const shortlist = chunks.slice(0, decisionLimit);
  if (!shortlist.length) return { source: 'lexical', keys: [], reason: 'no-matches' };
  const fallback = { source: 'lexical', keys: shortlist.slice(0, slots.length).map(chunk => chunk.key) };
  if (shortlist.length === 1) return { ...fallback, reason: 'single-match' };

  const criteria = Object.fromEntries(shortlist.map(chunk => {
    const description = [chunk.title, chunk.description, ...chunk.intents, ...(chunk.operations || []), ...(chunk.data || [])].join(' ').slice(0, 600);
    return [chunk.key, description];
  }));
  criteria.none = 'No eligible chunk fits this intent.';
  const questions = Object.fromEntries(slots.slice(0, shortlist.length).map(slot => [slot, {
    type: 'choice',
    instructions: `${instructions[slot]} Choose none when nothing fits.`,
    criteria,
  }]));
  let result;
  try {
    result = await decide({ intent: query, surface: surface ?? null }, questions);
  } catch {
    return { ...fallback, reason: 'decision-unavailable' };
  }
  if (result?.ok !== true) return { ...fallback, reason: 'decision-unavailable' };
  const eligible = new Set(shortlist.map(chunk => chunk.key));
  const primary = result.answers?.selected_chunk;
  if (!confident(primary)) return { source: 'decision', keys: [], reason: 'insufficient-confidence' };
  if (primary.choice === 'none') return { source: 'decision', keys: [], reason: 'no-fit', confidence: primary.confidence };
  if (!eligible.has(primary.choice)) return { source: 'decision', keys: [], reason: 'invalid-choice' };
  const keys = new Set([primary.choice]);
  for (const slot of Object.keys(questions).slice(1)) {
    const answer = result.answers?.[slot];
    if (confident(answer) && eligible.has(answer.choice)) keys.add(answer.choice);
  }
  return { source: 'decision', keys: [...keys], confidence: primary.confidence };
}

function confident(answer) {
  return answer?.act === true && Number.isFinite(answer.confidence) && answer.confidence >= 0.5 && answer.confidence <= 1;
}
