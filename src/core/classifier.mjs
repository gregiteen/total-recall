/**
 * classifier.mjs — Prompt Pre-Classifier (Total Recall Phase 19)
 *
 * Deterministic regex-based classification of user prompts to route
 * them to the appropriate instruction subgraph.
 */

const BUDGETS = {
  emergency: 300,
  answer: 500,
  execute: 2500,
  discuss: 1500
};

const EMERGENCY_MARKERS = /\b(STOP|WRONG|BROKEN|WTF|SHIT|FUCK|HELP)\b/i;
const QUESTION_WORDS = /^(what|how|why|when|where|who|which|is|are|can|could|should|would|do|does|did|will|may|might)/i;
const IMPERATIVE_VERBS = /^(fix|build|implement|add|remove|create|update|delete|run|make|do|apply|setup|configure|start|stop|restart|test|debug|refactor|deploy|push|pull|commit|git|npm|node|python|bash|sh|cat|grep|find|ls|cd|mkdir|rm|cp|mv)/i;
const SLASH_COMMANDS = /^\//;

/**
 * Classifies a user prompt into one of four modes: emergency, answer, execute, or discuss.
 * 
 * @param {string} text - The raw user prompt.
 * @param {object} context - Contextual information, e.g., { recentModes: [] }.
 * @returns {object} { mode: string, budget: number, confidence: number }
 */
export function classifyPrompt(text, context = {}) {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();
  
  let isEmergency = false;
  let isAnswer = false;
  let isExecute = false;

  // 1. Detect EMERGENCY
  const allCaps = trimmed.length >= 10 && trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed);
  const frustration = EMERGENCY_MARKERS.test(trimmed);
  const zzCommand = /\bZZ\b/.test(trimmed);
  const multiplePunctuation = /[!?]{2,}/.test(trimmed);

  if (allCaps || frustration || zzCommand || multiplePunctuation) {
    isEmergency = true;
  }

  // 2. Detect ANSWER (Questions)
  const endsInQuestion = trimmed.endsWith('?');
  const startsWithQuestionWord = QUESTION_WORDS.test(trimmed);
  
  if (endsInQuestion || startsWithQuestionWord) {
    isAnswer = true;
  }

  // 3. Detect EXECUTE (Directives)
  const startsWithImperative = IMPERATIVE_VERBS.test(trimmed);
  const isSlashCommand = SLASH_COMMANDS.test(trimmed);
  const containsExecutionWords = /\b(run|execute|make|do|build|fix)\b/i.test(trimmed);

  if (startsWithImperative || isSlashCommand || containsExecutionWords) {
    isExecute = true;
  }

  // 4. Resolve DISCUSS / MIXED
  let mode = 'discuss';
  
  if (isEmergency) {
    mode = 'emergency';
  } else if (isAnswer && isExecute) {
    mode = 'discuss';
  } else if (isAnswer) {
    mode = 'answer';
  } else if (isExecute) {
    mode = 'execute';
  }

  // 5. Context Awareness for Ambiguity
  // If we are in discuss/mixed mode and have recent modes, try to lean towards the established mode
  if (mode === 'discuss' && context.recentModes && context.recentModes.length > 0) {
    const lastMode = context.recentModes[context.recentModes.length - 1];
    // Only influence if it's one of the primary modes
    if (['answer', 'execute'].includes(lastMode)) {
      // Heuristic: keep the same mode if still plausible
      if (lastMode === 'answer' && isAnswer) mode = 'answer';
      if (lastMode === 'execute' && isExecute) mode = 'execute';
    }
  }

  // Final fallback to discuss if nothing else matched
  if (!isEmergency && !isAnswer && !isExecute) {
    mode = 'discuss';
  }

  return {
    mode,
    budget: BUDGETS[mode],
    confidence: isEmergency ? 1.0 : (isAnswer ^ isExecute ? 0.9 : 0.7)
  };
}
