import { git, commitContext, operation, output } from '../lib/context.mjs';

export const operations = {
  why: operation('Show the recorded intent for one line', 'why <file>:<line> [--json]', async (args, ctx) => {
    const match = args.length === 1 && /^(.*):([1-9]\d*)$/.exec(args[0]);
    if (!match || !match[1]) throw new Error('Supply one file:line');
    const [, file, line] = match;
    const blame = git(ctx, ['blame', '--line-porcelain', '-L', `${line},${line}`, 'HEAD', '--', file]);
    const sha = blame.match(/^([a-f0-9]{40,64})\s/m)?.[1];
    if (!sha) throw new Error('Blame did not return a commit');
    const context = await commitContext(ctx, sha);
    const result = { ok: true, file, line: Number(line), blame, ...context, reason: context.recorded ? null : 'No commit record. Only commit trailers are available.' };
    output(ctx, result, `${file}:${line} — ${sha}\n${context.message}\nSession: ${context.session || 'unknown'}\nTracker: ${context.trackerItems.join(', ') || 'unknown'}\nDecision: ${context.decisions.join('; ') || 'unknown'}\nRules: ${context.rules.join('; ') || 'unknown'}${result.reason ? `\n${result.reason}` : ''}`);
    return 0;
  }),
};
