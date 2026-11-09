import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { git, tr, operation, output } from '../lib/context.mjs';

function changeRows(ctx, head) {
  let rows;
  if (ctx.env.GIT_PLUGIN_CHANGE_LOG) {
    const text = fs.readFileSync(ctx.env.GIT_PLUGIN_CHANGE_LOG, 'utf8');
    rows = text.trim().startsWith('[') ? JSON.parse(text) : text.split('\n').filter(Boolean).map(row => JSON.parse(row));
  } else {
    const result = tr(ctx, ['recall', 'file-change agent session records', '--project', '--local', '--format', 'json']);
    if (result.status !== 0 || result.error) return [];
    try { rows = JSON.parse(result.stdout); } catch { return []; }
  }
  if (!Array.isArray(rows)) throw new Error('File-change records must be an array or JSONL');
  const root = git(ctx, ['rev-parse', '--show-toplevel']).trim();
  const since = Number(git(ctx, ['show', '-s', '--format=%ct', head]).trim()) * 1000;
  return rows.flatMap(row => {
    let data = row;
    if (row.type === 'session' && typeof row.body === 'string') {
      try { data = { ...row, ...JSON.parse(row.body) }; } catch { return []; }
    }
    return (data.changes || [data]).map(change => ({ ...data, ...change, session: change.session || data.session || data.session_id, file: change.file || change.path }));
  }).filter(row => row.file && row.session &&
    (row.repository || row.cwd) && fs.existsSync(row.repository || row.cwd) && fs.realpathSync(row.repository || row.cwd) === fs.realpathSync(root) &&
    (row.base === head || (!row.base && Date.parse(row.timestamp) >= since)))
    .map(row => ({ ...row, file: path.relative(root, path.resolve(root, row.file)), start: Number(row.startLine ?? row.start_line), end: Number(row.endLine ?? row.end_line ?? row.startLine ?? row.start_line) }));
}
function dirtyFiles(ctx) {
  return [...new Set([...git(ctx, ['diff', 'HEAD', '--name-only', '-z', '--no-renames']).split('\0'), ...git(ctx, ['ls-files', '--others', '--exclude-standard', '-z']).split('\0')].filter(Boolean))];
}
const overlap = (a, b) => Number.isInteger(a.start) && Number.isInteger(a.end) && Number.isInteger(b.start) && Number.isInteger(b.end) && a.start <= b.end && b.start <= a.end;
function fingerprint(root, file) {
  const target = path.join(root, file);
  const stat = fs.lstatSync(target, { throwIfNoEntry: false });
  if (!stat) return 'deleted';
  if (!stat.isFile() && !stat.isSymbolicLink()) throw new Error('Submodule and directory changes need manual grouping');
  return `${stat.mode}:${crypto.createHash('sha256').update(stat.isSymbolicLink() ? fs.readlinkSync(target) : fs.readFileSync(target)).digest('hex')}`;
}

export const operations = {
  group: operation('Group dirty changes by the session that wrote them', 'group [--apply] [--json]', async (args, ctx) => {
    if (args.some(arg => arg !== '--apply') || args.length > 1) throw new Error('Use group [--apply]');
    if (git(ctx, ['diff', '--name-only', '--diff-filter=U', '-z'])) throw new Error('Resolve conflicts before grouping');
    const head = git(ctx, ['rev-parse', '--verify', 'HEAD']).trim();
    const root = git(ctx, ['rev-parse', '--show-toplevel']).trim();
    const sourceGit = ctx.git;
    ctx = { ...ctx, cwd: root, git: (args, options) => sourceGit(args, { ...options, cwd: root }) };
    const files = dirtyFiles(ctx);
    const fingerprints = new Map(files.map(file => [file, fingerprint(root, file)]));
    const records = changeRows(ctx, head);
    const warnings = [];
    for (let i = 0; i < records.length; i++) for (const other of records.slice(i + 1)) {
      const row = records[i];
      if (row.file === other.file && row.session !== other.session && overlap(row, other)) warnings.push(`${row.file}:${Math.max(row.start, other.start)}-${Math.min(row.end, other.end)}: sessions ${row.session} and ${other.session} touch the same lines`);
    }
    const groups = new Map();
    const add = (session, unit, reason = null) => {
      const group = groups.get(session) || { session, files: [], units: [], reasons: [] };
      if (!group.files.includes(unit.file)) group.files.push(unit.file);
      if (reason && !group.reasons.includes(reason)) group.reasons.push(reason);
      group.units.push(unit); groups.set(session, group);
    };
    for (const file of files) {
      const changes = records.filter(row => row.file === file);
      const sessions = [...new Set(changes.map(row => row.session))];
      const patch = git(ctx, ['diff', 'HEAD', '--no-ext-diff', '--no-textconv', '--no-renames', '--binary', '--unified=0', '--', file]);
      if (sessions.length <= 1) { add(sessions[0] || 'unknown', { file, whole: true }, sessions.length ? null : 'No current session record identifies this change'); continue; }
      const first = patch.indexOf('@@ ');
      if (first < 0 || patch.includes('GIT binary patch')) { add('unknown', { file, whole: true }, 'Multiple sessions wrote this file. The changes have no separate text hunks'); continue; }
      const header = patch.slice(0, first);
      const chunks = patch.slice(first).split(/(?=^@@ )/m).filter(Boolean);
      for (const chunk of chunks) {
        const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@([^\n]*)\n/.exec(chunk);
        if (!match) throw new Error('Cannot parse a changed hunk');
        const oldStart = Number(match[1]), oldCount = Number(match[2] ?? 1), start = Number(match[3]), count = Number(match[4] ?? 1);
        const owners = [...new Set(changes.filter(row => overlap(row, { start, end: start + Math.max(count, 1) - 1 })).map(row => row.session))];
        add(owners.length === 1 ? owners[0] : 'unknown', { file, header, oldStart, oldCount, start, count, suffix: match[5], body: chunk.slice(match[0].length) }, owners.length === 1 ? null : 'A hunk has missing or shared session attribution');
      }
    }
    const publicGroups = [...groups.values()].map(({ units, ...row }) => ({ ...row, hunks: units.length }));
    if (args.includes('--apply')) {
      if (warnings.length || [...groups.values()].some(row => row.session === 'unknown' && row.reasons.some(reason => !reason.startsWith('No current')))) throw new Error(`Shared changes need manual grouping. ${warnings.join('; ')}`);
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'git-group-'));
      const applied = [];
      const completed = [];
      const initialIndex = git(ctx, ['write-tree']).trim();
      try {
        for (const group of groups.values()) {
          const env = { ...ctx.env, GIT_INDEX_FILE: path.join(tmp, 'index'), CLAUDE_SESSION_ID: group.session, CODEX_SESSION_ID: group.session };
          git(ctx, ['read-tree', 'HEAD'], { env });
          for (const unit of group.units) {
            if (fingerprint(root, unit.file) !== fingerprints.get(unit.file)) throw new Error(`File ${unit.file} changed during grouping. Completed groups: ${completed.join(', ') || 'none'}`);
            if (unit.whole) git(ctx, ['add', '--all', '--', unit.file], { env });
            else {
              const before = applied.filter(row => row.file === unit.file && row.oldStart < unit.oldStart).reduce((sum, row) => sum + row.count - row.oldCount, 0);
              const patch = `${unit.header}@@ -${unit.oldStart + before},${unit.oldCount} +${unit.oldStart + before + (unit.oldCount === 0 ? 1 : 0) - (unit.count === 0 ? 1 : 0)},${unit.count} @@${unit.suffix}\n${unit.body}`;
              git(ctx, ['apply', '--cached', '--unidiff-zero', '--recount', '-'], { env, input: patch });
              applied.push(unit);
            }
          }
          const message = `Update ${group.files.join(', ')}\n\nAgent-Session: ${group.session}\n`;
          const result = tr({ ...ctx, env }, ['git', 'commit', '--file=-'], { input: message });
          if (result.status !== 0 || result.error) throw new Error(`Session ${group.session} could not commit. Completed groups: ${completed.join(', ') || 'none'}`);
          completed.push(group.session);
        }
      } finally {
        // Synchronize the real index with completed commits. Keep worktree content.
        if (completed.length && git(ctx, ['write-tree']).trim() === initialIndex) git(ctx, ['read-tree', 'HEAD']);
        else if (completed.length) warnings.push('The index changed during grouping. The index was left intact.');
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    }
    output(ctx, { ok: true, groups: publicGroups, warnings, applied: args.includes('--apply') }, [...publicGroups.map(row => `${row.session}: ${row.files.join(', ')}${row.reasons.length ? ` (${row.reasons.join('; ')})` : ''}`), ...warnings.map(row => `Warning: ${row}`)].join('\n') || 'The tree is clean.');
    return 0;
  }),
};
