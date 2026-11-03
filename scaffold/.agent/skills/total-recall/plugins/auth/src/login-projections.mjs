/**
 * Tool logins derived from stored secrets.
 *
 * A secret that reaches a node (see secrets-sync.mjs) is only useful to people and
 * agents there once the tool that uses it is signed in. This signs `gh` in from
 * `github_token`, and wires git to it, so a token rotated once lands on every machine
 * without anyone logging in by hand. Nothing here prints or logs the token.
 */
import { execFile } from 'node:child_process';

const TIMEOUT_MS = 20_000;

/** Run a command, optionally feeding stdin; never rejects. */
export function defaultRun(cmd, args, input) {
  return new Promise((resolve) => {
    const child = execFile(cmd, args, { timeout: TIMEOUT_MS, env: { ...process.env, GH_PROMPT_DISABLED: '1', GH_NO_UPDATE_NOTIFIER: '1' } }, (error, stdout, stderr) => {
      resolve({ ok: !error, code: error?.code ?? 0, stdout: String(stdout || ''), stderr: String(stderr || '') });
    });
    child.stdin?.end(input === undefined ? undefined : String(input));
  });
}

const firstLine = (text) => String(text || '').split('\n').map((l) => l.trim()).find(Boolean) || 'unknown error';

/**
 * Sign `gh` in with `token` when it is not already, then point git at it.
 * @returns {{ status: 'no-token'|'gh-missing'|'current'|'logged-in'|'failed', error?: string }}
 */
export async function projectGithubLogin({ token, run = defaultRun } = {}) {
  const wanted = String(token || '').trim();
  if (!wanted) return { status: 'no-token' };

  const current = await run('gh', ['auth', 'token']);
  if (current.code === 'ENOENT') return { status: 'gh-missing' };
  if (current.ok && current.stdout.trim() === wanted) return { status: 'current' };

  const login = await run('gh', ['auth', 'login', '--hostname', 'github.com', '--git-protocol', 'https', '--with-token'], wanted);
  if (!login.ok) return { status: 'failed', error: firstLine(login.stderr).replaceAll(wanted, '***') };

  await run('gh', ['auth', 'setup-git', '--hostname', 'github.com']);
  return { status: 'logged-in' };
}
