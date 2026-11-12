import fs from 'node:fs';

const text = value => typeof value === 'string' ? value : Array.isArray(value)
  ? value.map(block => block.text || (block.type === 'tool_result' ? text(block.content) : JSON.stringify(block))).join('\n')
  : value == null ? '' : JSON.stringify(value);

/** Normalize native hook transcripts and the session-ingest format. Keep tool evidence. */
export function readLessonEntries(file) {
  const records = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).flatMap(line => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
  // Codex records messages both as event notifications and as response items.
  const hasResponseMessages = records.some(row => row.type === 'response_item' && row.payload?.type === 'message');
  return records.flatMap(row => {
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
    let role = message.role || row.role;
    if (role === 'human') role = 'user';
    if (!['user', 'assistant', 'tool'].includes(role)) return [];
    const content = [text(message.content ?? message.text), ...(message.tool_calls ? [JSON.stringify(message.tool_calls)] : [])].filter(Boolean).join('\n');
    if (!content.trim()) return [];
    // Claude tool results have role user, but do not start a user turn.
    if (Array.isArray(message.content) && message.content.every(block => block.type === 'tool_result')) role = 'tool';
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
