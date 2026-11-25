import fs from 'node:fs';

const text = value => typeof value === 'string' ? value : Array.isArray(value)
  ? value.map(block => block.text || (block.type === 'tool_result' ? text(block.content) : JSON.stringify(block))).join('\n')
  : value == null ? '' : JSON.stringify(value);

// Harness-injected user text: hook output, slash-command output, interruption notes,
// Codex environment/instruction blocks and automatic goal checks. Kept as context, never a turn.
const SYSTEM_BLOCK = /<system-reminder>[\s\S]*?<\/system-reminder>/g;
const NOT_A_PROMPT = /^(<command-name>|<command-message>|<command-args>|<local-command-stdout>|<local-command-stderr>|<local-command-caveat>|<environment_context>|<user_instructions>|<permissions|<turn_aborted>|<user_shell_command>|<task-notification>|<side-sessions-event>|<ci-monitor-event>|# AGENTS\.md instructions|\[Request interrupted|Check the goal against what you did|Launching skill:|Base directory for this skill:|This session is being continued from a previous conversation|The user doesn't want to proceed with this tool use|Caveat: The messages below were generated)/;

/** True when user-role text is something the person typed, not text a harness injected. */
export function isHumanPrompt(content) {
  const remainder = String(content || '').replace(SYSTEM_BLOCK, '').trim();
  return Boolean(remainder) && !NOT_A_PROMPT.test(remainder);
}

/**
 * The role an entry has in a review. The session watcher uses it too, so a saved session
 * and its native transcript count the same turns.
 */
export function transcriptRole(row, message, content) {
  const role = message.role === 'human' || (!message.role && row.role === 'human') ? 'user' : message.role || row.role;
  // Claude tool results have role user, but do not start a user turn.
  // Claude marks tool output with toolUseResult even when it is stored as text.
  if (row.toolUseResult !== undefined || (Array.isArray(message.content) &&
      message.content.every(block => block.type === 'tool_result' || block.type === 'tool_reference'))) return 'tool';
  // Request blobs and harness events annotate the conversation.
  if (role === 'user' && row.message && typeof row.type === 'string' && !['user', 'assistant'].includes(row.type)) return 'context';
  // Meta rows, compaction summaries and injected text are evidence, not a turn.
  if (role === 'user' && (row.isMeta === true || row.isCompactSummary === true || !isHumanPrompt(content))) return 'context';
  return role;
}

/** Normalize native hook transcripts and the session-ingest format. Keep tool evidence. */
export function readLessonEntries(file) {
  const records = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).flatMap(line => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
  // Codex records messages both as event notifications and as response items.
  const hasResponseMessages = records.some(row => row.type === 'response_item' && row.payload?.type === 'message');
  return records.flatMap(row => {
    // Claude rows carry a type; only user and assistant rows are the conversation.
    // Others (api-request-blob, attachment, system) repeat or annotate it.
    if (row.message && typeof row.type === 'string' && !['user', 'assistant'].includes(row.type)) return [];
    let message = row.message || row;
    if (row.type === 'response_item') {
      message = row.payload || {};
      if (message.type === 'function_call' || message.type === 'function_call_output') {
        return [{ role: 'tool', content: text(message), ts: row.timestamp }];
      }
      if (message.type !== 'message') return [];
    } else if (row.type === 'event_msg') {
      if (hasResponseMessages) return [];
      const payload = row.payload || {};
      if (!['user_message', 'agent_message'].includes(payload.type)) return [];
      message = { role: payload.type === 'user_message' ? 'user' : 'assistant', content: payload.message };
    }
    const sourceRole = message.role || row.role;
    if (!['user', 'human', 'assistant', 'tool', 'context'].includes(sourceRole)) return [];
    const content = [text(message.content ?? message.text), ...(message.tool_calls ? [JSON.stringify(message.tool_calls)] : [])].filter(Boolean).join('\n');
    if (!content.trim()) return [];
    const role = transcriptRole(row, message, content);
    return [{ role, content, ts: row.ts || row.timestamp, ...(row.cwd ? { cwd: row.cwd } : {}) }];
  });
}

export function countLessonTurns(entries) {
  return entries.filter(entry => entry.role === 'user').length;
}

export function selectLessonTurns(entries, { fromTurn = 1, toTurn = Infinity } = {}) {
  if (!Number.isInteger(fromTurn) || fromTurn < 1 || !(toTurn === Infinity || Number.isInteger(toTurn)) || toTurn < fromTurn) {
    throw new Error('Lesson turn range must be positive and ordered');
  }
  let turn = 0;
  return entries.filter(entry => {
    if (entry.role === 'user') turn++;
    return turn >= fromTurn && turn <= toTurn;
  });
}
