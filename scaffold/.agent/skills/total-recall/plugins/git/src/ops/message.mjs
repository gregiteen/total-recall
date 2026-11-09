import { git, activePlan, session, operation, output } from '../lib/context.mjs';

export const operations = {
  message: operation('Draft a commit message from staged changes and project intent', 'message [--json]', async (args, ctx) => {
    if (args.length) throw new Error('message takes no arguments');
    const files = git(ctx, ['diff', '--cached', '--name-only', '-z']).split('\0').filter(Boolean);
    if (!files.length) throw new Error('Nothing is staged');
    const diff = git(ctx, ['diff', '--cached', '--no-ext-diff', '--no-textconv', '--stat']);
    const plan = activePlan(ctx);
    const log = plan.actionLog.split('\n').filter(Boolean);
    const relevant = plan.items.filter(item => {
      const ids = item.match(/\b(?:R\d+|P\d+\.\d+|[A-Z][A-Z0-9_]*-[A-Z]*\d[\w.-]*)\b/g) || [];
      return files.some(file => item.includes(file)) || log.some(row => files.some(file => row.includes(file)) && ids.some(id => new RegExp(`\\b${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(row)));
    });
    const items = relevant.length ? relevant : plan.items.filter(item => item.startsWith('- [ ]'));
    const subject = relevant[0]?.replace(/^- \[[ xX]\]\s*/, '').slice(0, 72) || `Update ${files.length === 1 ? files[0] : `${files.length} files`}`;
    const author = git(ctx, ['var', 'GIT_AUTHOR_IDENT']).replace(/>.*$/s, '>').trim();
    const draft = [subject, '', 'Staged changes:', diff.trimEnd(), '', ...(items.length ? ['Tracker context:', ...items, ''] : []), ...(log.length ? ['Action Log:', ...log.filter(row => files.some(file => row.includes(file))).slice(-5), ''] : []), `Agent-Session: ${session(ctx.env) || 'unknown'}`, `Co-authored-by: ${author}`].join('\n');
    output(ctx, { ok: true, draft, files, tracker: plan.tracker, plan: plan.plan, planItems: items, actionLog: plan.actionLog }, draft);
    return 0;
  }),
};
