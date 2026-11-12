import { authGitEnv } from './auth.mjs';

const machineEmail = /@(?:localhost|[^@\s]+\.(?:local|lan|home|internal))$|@[^@.\s]+$/i;

export function checkCommit(ctx) {
  for (const key of ['user.name', 'user.email']) {
    const row = ctx.git(['config', '--get', key]);
    if (row.status !== 0 || !row.stdout?.trim()) return `${key} is not configured or cannot be read`;
    if (key === 'user.email' && machineEmail.test(row.stdout.trim())) return 'user.email names a machine';
  }
  // Check the effective identity too. Environment variables can override config.
  for (const role of ['AUTHOR', 'COMMITTER']) {
    const identity = ctx.git(['var', `GIT_${role}_IDENT`]);
    if (identity.status !== 0) return `Cannot read the ${role.toLowerCase()} identity`;
    const match = identity.stdout?.match(/^(.+) <([^<>]+)> \d+ [+-]\d+\s*$/);
    if (!match || !match[1].trim()) return `Missing ${role.toLowerCase()} identity`;
    if (machineEmail.test(match[2])) return `${role.toLowerCase()} email names a machine`;
  }
  const head = ctx.git(['symbolic-ref', '-q', 'HEAD']);
  if (head.status === 1) return 'Refusing to commit on a detached HEAD';
  if (head.status !== 0) return 'Cannot read HEAD';
  const conflicts = ctx.git(['ls-files', '--unmerged', '-z']);
  if (conflicts.status !== 0) return 'Cannot read unresolved conflicts';
  if (conflicts.stdout) return 'Refusing to commit with unresolved conflicts';
}

export const operations = {
  commit: {
    summary: 'Check identity, conflicts and HEAD, then run git commit',
    usage: 'commit [git commit arguments]',
    async run(args, ctx) {
      try {
        const reason = checkCommit(ctx);
        if (reason) { console.error(`Commit refused: ${reason}`); return 1; }
        const env = await authGitEnv(ctx);
        // Keep the editor, stdin, hooks and Git output attached to the terminal.
        const result = ctx.git(['commit', ...args], { env, stdio: 'inherit' });
        if (result.error || result.signal) return 1;
        return result.status ?? 1;
      } catch {
        console.error('Commit refused: credential helper configuration is unavailable');
        return 1;
      }
    },
  },
};
