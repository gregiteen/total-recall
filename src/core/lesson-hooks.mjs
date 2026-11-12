import fs from 'node:fs';
import path from 'node:path';
import { parseDocument } from 'yaml';
import { atomicWrite } from './vault.mjs';

const managed = hook => String(hook?.command || '').includes('total-recall lessons ');
const command = (harness, end = false) => `total-recall lessons ${end ? 'session-end' : 'tick'} --harness ${harness} --global`;

/** Extend the existing installer's selected settings file. Preserve unrelated hooks. */
export function installLessonHooks(row, { dryRun = false, remove = false } = {}) {
  const { harness, settings } = row;
  if (!settings || ['not-present', 'failed', 'unsupported'].includes(row.status)) return { status: 'session-ingest' };
  if (harness === 'hermes') {
    const text = fs.existsSync(settings) ? fs.readFileSync(settings, 'utf8') : '';
    const doc = parseDocument(text || '{}');
    if (doc.errors.length) throw new Error(`Invalid Hermes hook settings: ${doc.errors[0].message}`);
    for (const [event, end] of [['post_llm_call', false], ['on_session_finalize', true]]) {
      const old = doc.getIn(['hooks', event])?.toJSON() || [];
      if (!Array.isArray(old)) throw new Error(`Hermes ${event} hooks must be a list`);
      const hooks = old.filter(hook => !managed(hook));
      if (!remove) hooks.push({ command: command(harness, end), timeout: 10 });
      doc.setIn(['hooks', event], hooks);
    }
    if (!dryRun) atomicWrite(settings, String(doc));
    return { status: remove ? 'removed' : dryRun ? 'would-install' : 'installed', settings };
  }
  if (harness === 'pi') {
    const file = path.join(path.dirname(settings), 'total-recall-lessons.ts');
    if (!dryRun) {
      if (remove) fs.rmSync(file, { force: true });
      else atomicWrite(file, PI_LESSONS_EXTENSION);
    }
    return { status: remove ? 'removed' : dryRun ? 'would-install' : 'installed', settings: file };
  }
  const events = harness === 'cursor' ? [['stop', false], ['sessionEnd', true]]
    : ['claude', 'codex', 'dsh', 'agy'].includes(harness) ? [['Stop', false], ['SessionEnd', true]] : null;
  if (!events || !settings.endsWith('.json')) return { status: 'session-ingest', note: 'Native lesson hook requires the harness owner; use session-end ingest.' };
  const text = fs.existsSync(settings) ? fs.readFileSync(settings, 'utf8') : '{}';
  const config = JSON.parse(text);
  const hooks = harness === 'agy' ? (config['total-recall-lessons'] ||= {}) : (config.hooks ||= {});
  for (const [event, end] of events) {
    const old = hooks[event] || [];
    if (!Array.isArray(old)) throw new Error(`${harness} ${event} hooks must be a list`);
    // Remove only our command even when a group contains another owner's hook.
    hooks[event] = old.flatMap(group => {
      if (Array.isArray(group.hooks)) {
        const kept = group.hooks.filter(hook => !managed(hook));
        return kept.length ? [{ ...group, hooks: kept }] : [];
      }
      return managed(group) ? [] : [group];
    });
    if (!remove) hooks[event].push(harness === 'cursor' ? { command: command(harness, end), timeout: 10 }
      : { hooks: [{ type: 'command', command: command(harness, end), timeout: 10 }] });
  }
  if (!dryRun) atomicWrite(settings, JSON.stringify(config, null, 2) + '\n');
  return { status: remove ? 'removed' : dryRun ? 'would-install' : 'installed', settings };
}

export const PI_LESSONS_EXTENSION = `import { spawn } from 'node:child_process';
export default function (pi) {
  const review = (event, ctx) => new Promise((resolve) => {
    const entries = ctx.sessionManager.getBranch().filter(e => e.type === 'message').map(e => e.message);
    const child = spawn('total-recall', ['lessons', event, '--harness', 'pi', '--global'], { stdio: ['pipe', 'ignore', 'pipe'] });
    child.on('error', error => { console.error('Total Recall lessons:', error.message); resolve(); });
    child.stderr.on('data', data => console.error(String(data)));
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify({ session_id: ctx.sessionManager.getSessionId(), entries }));
    const timer = setTimeout(() => child.kill('SIGKILL'), 10000);
    child.on('close', () => { clearTimeout(timer); resolve(); });
  });
  pi.on('agent_end', (_event, ctx) => review('tick', ctx));
  pi.on('session_shutdown', (_event, ctx) => review('session-end', ctx));
}
`;
