/**
 * action-predictor — ask Jev which action to take next, instead of loading the
 * whole CLI surface into a generative model's context.
 *
 * The shape of the problem: Total Recall exposes 352 commands, 7 composed
 * commands and 34 plugins. A generative model asked "what should I do next?"
 * needs that catalog in its prompt, which is exactly the context cost the
 * capsule work exists to reduce. A decision model does not generate prose — it
 * reads state plus a map of named questions and returns TYPED answers with
 * calibrated probabilities. So the catalog becomes the option set of a `choice`
 * question, and the answer is one verb plus a confidence.
 *
 * Cost shape: a probe measured ~$0.000012-0.000022 per decision with the pinned
 * Jev build, against ~10,000 tokens of capsule on every call.
 *
 * Two rules this module holds to:
 *   1. Narrowing happens in code. A decision model given 352 options answers
 *      worse than one given the 20 that survived retrieval, and the retrieval
 *      layer is deterministic and free. Jev chooses from a shortlist, it does
 *      not search the catalog.
 *   2. A low-confidence answer is not an action. The confidence is returned so
 *      the caller can gate on it and fall back, never silently act.
 */
import { queryCliSemanticIndex } from './cli-semantic-index.mjs';

/** How many candidates retrieval hands to the decision model. */
export const DEFAULT_SHORTLIST = 20;
/** Below this, the caller should treat the prediction as advice only. */
export const DEFAULT_MIN_CONFIDENCE = 0.5;

/**
 * Build the typed question set for "what next?".
 *
 * `choice.criteria` maps option name to description, which is where the model's
 * routing signal lives — a bare list of verb names gives it almost nothing.
 */
export function buildActionQuestions(candidates, { intent, allowNone = true } = {}) {
  const criteria = {};
  for (const c of candidates) {
    // The usage form is what a caller would actually run, so it is what the
    // model should see; the description disambiguates near-identical verbs.
    const label = c.usage || c.verb || c.id;
    const description = [c.name, c.description].filter(Boolean).join(' — ');
    criteria[label] = description ? `${description}` : `${label}`;
  }
  if (allowNone) criteria.none = 'No single command fits; the next step is not a CLI verb.';

  const questions = {
    next_action: {
      type: 'choice',
      instructions: intent
        ? `Given this state and the operator's intent, which single command should run next? Intent: ${intent}`
        : 'Given this state, which single command should run next?',
      criteria,
    },
  };
  if (allowNone) {
    questions.actionable = {
      type: 'noul',
      instructions: 'Is there enough information in the state to choose a specific command confidently?',
    };
  }
  return questions;
}

/**
 * Retrieve the candidate verbs for an intent.
 *
 * Deterministic and local. The decision model never sees the full catalog.
 */
export async function shortlistActions(intent, { derivedDir = null, projectRoot = process.cwd(), limit = DEFAULT_SHORTLIST } = {}) {
  const hits = await queryCliSemanticIndex(intent || '', { derivedDir, projectRoot, limit, minScore: 0 });
  return hits.map(h => ({
    id: h.id,
    verb: h.verb,
    name: h.name,
    usage: h.usage,
    description: h.description,
    namespace: h.namespace,
    category: h.category,
    score: h.score,
  }));
}

/**
 * Predict the next action.
 *
 * `requestDecision` is injected so this is testable without a live provider and
 * so a caller can supply its own transport. Returns a plain result: the caller
 * decides what to do with it, and an abstention is a first-class outcome.
 */
export async function predictNextAction(intent, {
  state = {},
  derivedDir = null,
  projectRoot = process.cwd(),
  limit = DEFAULT_SHORTLIST,
  minConfidence = DEFAULT_MIN_CONFIDENCE,
  requestDecision,
  model,
  endpoint,
  timeoutMs,
  apiKey,
  allowNone = true,
} = {}) {
  const candidates = await shortlistActions(intent, { derivedDir, projectRoot, limit });
  if (!candidates.length) {
    return { ok: false, reason: 'no-candidates', intent, candidates: [] };
  }

  const byLabel = new Map(candidates.map(c => [c.usage || c.verb || c.id, c]));
  const questions = buildActionQuestions(candidates, { intent, allowNone });

  const decision = await requestDecision({
    apiKey, model, endpoint, timeoutMs,
    state,
    questions,
  });

  if (!decision) {
    return { ok: false, reason: 'no-decision', intent, candidates };
  }

  const chosenLabel = decision.choice('next_action', '');
  const confidence = decision.confidence('next_action');
  const actionable = allowNone ? decision.noul('actionable', false) : true;
  const chosen = byLabel.get(chosenLabel) || null;

  // An answer naming nothing, or an option that was never offered, is an
  // abstention — not a command to run.
  if (!chosen) {
    return {
      ok: true, abstained: true, reason: 'no-command-fits', intent, candidates,
      confidence, model: decision.modelVersion, cost: decision.cost, latencyMs: decision.latencyMs,
    };
  }
  if (confidence < minConfidence) {
    return {
      ok: true, abstained: true, reason: 'low-confidence', intent, candidates,
      candidate: chosen, confidence, minConfidence,
      model: decision.modelVersion, cost: decision.cost, latencyMs: decision.latencyMs,
    };
  }
  if (!actionable) {
    return {
      ok: true, abstained: true, reason: 'model-reports-insufficient-state', intent, candidates,
      candidate: chosen, confidence,
      model: decision.modelVersion, cost: decision.cost, latencyMs: decision.latencyMs,
    };
  }

  return {
    ok: true, abstained: false, intent,
    action: chosen,
    confidence,
    alternatives: candidates.filter(c => c !== chosen).slice(0, 5),
    model: decision.modelVersion,
    endpoint: decision.endpointUsed,
    cost: decision.cost,
    latencyMs: decision.latencyMs,
  };
}
