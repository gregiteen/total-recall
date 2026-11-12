import { randomUUID } from 'node:crypto';
import { helpOnly, invocation, repoId, stateStore } from './_support.mjs';

export async function guardPush(args, ctx) {
  const call = invocation(args, ctx);
  if (call.command !== 'push' || helpOnly(args)) return;
  const rewritten = [];
  let reason;
  let deletion = false;
  let force = false;
  let options = true;
  let remoteSeen = false;
  for (let i = 0; i < call.args.length; i += 1) {
    const a = call.args[i];
    if (options && ['--repo', '--receive-pack', '--exec', '--push-option', '-o'].includes(a)) {
      if (a === '--repo') remoteSeen = true;
      rewritten.push(a);
      if (call.args[i + 1] !== undefined) rewritten.push(call.args[++i]);
      continue;
    }
    if (options && a === '--reason') {
      if (reason !== undefined || !call.args[i + 1] || call.args[i + 1].startsWith('-')) return { refuse: 'Supply one --reason <text>' };
      reason = call.args[++i]; continue;
    }
    if (options && a.startsWith('--reason=')) {
      if (reason !== undefined) return { refuse: 'Supply one --reason <text>' };
      reason = a.slice(9); continue;
    }
    if (a === '--') options = false;
    if (a.startsWith('--repo=')) remoteSeen = true;
    if (options && ['--delete', '-d'].includes(a)) deletion = true;
    if (remoteSeen && /^\+?:[^:]+$/.test(a)) deletion = true;
    if (options && ['--force', '-f'].includes(a)) { force = true; continue; }
    if (options && /^-[fvdqnu]+$/.test(a)) {
      if (a.includes('f')) force = true;
      if (a.includes('d')) deletion = true;
      const remaining = a.slice(1).replaceAll('f', '');
      if (remaining) rewritten.push(`-${remaining}`);
      continue;
    }
    if (options && a === '--mirror') return { refuse: '--mirror can delete remote refs without a lease. Use explicit refs.' };
    if (remoteSeen && a.startsWith('+') && a.length > 1) { force = true; rewritten.push(a.slice(1)); }
    else rewritten.push(a);
    if (!a.startsWith('-') && !remoteSeen) remoteSeen = true;
  }
  if (deletion) {
    if (!reason?.trim()) return { refuse: 'Remote branch deletion requires --reason <text>' };
    try {
      const store = await stateStore(call.ctx);
      store.append({ id: randomUUID(), type: 'git.remote_delete', timestamp: new Date().toISOString(),
        repository: repoId(call.ctx), reason: reason.trim(), status: 'requested' });
    } catch { return { refuse: 'Cannot record the remote deletion reason' }; }
  }
  if (force && !rewritten.some(a => a === '--force-with-lease' || a.startsWith('--force-with-lease='))) rewritten.unshift('--force-with-lease');
  return { args: [...call.prefix, 'push', ...rewritten] };
}

export const guards = [{ name: 'force-push', before: guardPush }];
