/**
 * Which harness may run a requested model. Shape, operator policy and harness support come first
 * (worker.mjs, so a remote destination enforces them too). Then the AI Models plugin, which owns the
 * shared model catalog, decides when it answers `ai-models validate`. When it cannot answer, this
 * machine's synced harness model lists decide; a harness without a list is accepted as unverified.
 */
import { execFileSync } from 'node:child_process';
import { modelRefusal } from './worker.mjs';
import { getModelCatalog, normalizeModelName } from './model-catalog.mjs';

/** Ask the AI Models owner. Null means it gave no verdict (not installed, not implemented, or unreadable). */
export function queryAiModels(harness, model, { bin = process.env.TOTAL_RECALL_BIN || 'total-recall' } = {}) {
  let output;
  try {
    output = execFileSync(bin, ['ai-models', 'validate', '--harness', harness, '--model', model, '--json'], { encoding: 'utf8', timeout: 20000, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (error) {
    // A refusal may exit nonzero with its verdict on stdout.
    output = String(error.stdout || '');
  }
  const line = output.trim().split('\n').filter(Boolean).at(-1);
  try {
    const answer = JSON.parse(line);
    if (!answer || typeof answer.ok !== 'boolean') return null;
    // An error reply (an older ai-models without `validate` answers invalid_arguments) is the command
    // failing, not a verdict on the model; reading it as one would refuse every model.
    if (answer.error != null || answer.code != null) return null;
    return answer;
  } catch { return null; }
}

/** One validator per decision: after the owner fails to answer once, it is not asked again. */
export function createModelValidator({ aiModels = queryAiModels, catalog = getModelCatalog, local = true } = {}) {
  let ownerAnswers = true, listed;
  return (harness, model) => {
    const refusal = modelRefusal(harness, model);
    if (refusal) return { ok: false, harness, model, source: 'policy', reason: refusal };
    if (ownerAnswers) {
      const answer = aiModels(harness, model);
      if (answer) return { ok: answer.ok, harness, model, source: 'ai-models', ...(answer.ok ? {} : { reason: answer.reason || `AI Models does not list ${model} for ${harness}` }) };
      ownerAnswers = false;
    }
    // Another node's catalog is not this one's: its destination validates against its own.
    if (!local) return { ok: true, harness, model, source: 'unverified', note: 'The destination node validates the model before launch.' };
    listed ??= catalog().harnessModels || {};
    const models = listed[harness];
    if (Array.isArray(models) && models.length) {
      const key = normalizeModelName(model);
      if (models.some(row => row.id === model || normalizeModelName(row.id) === key)) return { ok: true, harness, model, source: 'catalog' };
      return { ok: false, harness, model, source: 'catalog', reason: `${harness} does not list ${model}. Listed: ${models.slice(0, 12).map(row => row.id).join(', ')}` };
    }
    return { ok: true, harness, model, source: 'unverified', note: `No model list for ${harness}; only a completed run proves ${model} works there.` };
  };
}

/** Split a pool by whether each harness can run the model. */
export function filterPoolByModel(pool, model, validate) {
  const checks = pool.ready.map(harness => validate(harness.id, model));
  return {
    pool: { ...pool, ready: pool.ready.filter((_, index) => checks[index].ok),
      excluded: [...pool.excluded, ...checks.filter(check => !check.ok).map(check => ({ harness: check.harness, reason: check.reason, failureKind: 'model' }))] },
    selection: { model, compatible: checks.filter(check => check.ok).map(check => check.harness), checks },
  };
}
