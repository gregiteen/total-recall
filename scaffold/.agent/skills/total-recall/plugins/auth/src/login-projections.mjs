/**
 * Tool logins derived from stored secrets.
 *
 * A secret that reaches a node (see secrets-sync.mjs) is only useful to people and
 * agents there once the tool that uses it is signed in. This signs `gh` in from
 * `github_token`, and wires git to it, so a token rotated once lands on every machine
 * without anyone logging in by hand.
 *
 * A login changed on the machine itself (`gh auth refresh -s workflow`) belongs to the operator,
 * and comparing values cannot tell that from a rotation. So each node keeps the pair of tokens it
 * last looked at, as fingerprints. Store token moved: rotation, sign in. `gh` token moved: someone
 * else wrote it, so check both with GitHub first, and overwrite only when nothing would be lost.
 *
 * Nothing here prints or logs a token.
 */
import { execFile } from 'node:child_process';
import crypto from 'node:crypto';

const TIMEOUT_MS = 20_000;
const HOST = 'github.com';
const REVOKE_URL = 'https://api.github.com/credentials/revoke';
const NO_LOGIN = /no oauth token/i;

/** Run a command, optionally feeding stdin; never rejects. */
export function defaultRun(cmd, args, input, env = {}) {
  return new Promise((resolve) => {
    const childEnv = { ...process.env, GH_PROMPT_DISABLED: '1', GH_NO_UPDATE_NOTIFIER: '1' };
    // Either of these outranks gh's stored login, so a daemon that inherited one would
    // report it as the login and could not sign in at all.
    delete childEnv.GH_TOKEN;
    delete childEnv.GITHUB_TOKEN;
    const child = execFile(cmd, args, { timeout: TIMEOUT_MS, env: { ...childEnv, ...env } }, (error, stdout, stderr) => {
      resolve({ ok: !error, code: error?.code ?? 0, stdout: String(stdout || ''), stderr: String(stderr || '') });
    });
    child.stdin?.end(input === undefined ? undefined : String(input));
  });
}

const firstLine = (text) => String(text || '').split('\n').map((l) => l.trim()).find(Boolean) || 'unknown error';

/** The same value `auth secret list` shortens to its fingerprint. */
export const tokenFingerprint = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

/** What `gh` holds on this machine. The token stays in memory, for the caller to compare. */
export async function readGhToken(run = defaultRun) {
  const res = await run('gh', ['auth', 'token', '--hostname', HOST]);
  if (res.code === 'ENOENT') return { state: 'gh-missing' };
  if (res.ok && res.stdout.trim()) return { state: 'token', token: res.stdout.trim() };
  if (res.ok || NO_LOGIN.test(res.stderr)) return { state: 'none' };
  // A locked keychain or a timeout is not an empty login: signing in over it could lose one.
  return { state: 'unreadable', error: firstLine(res.stderr) };
}

/**
 * Ask GitHub about one token, which travels in this child's environment only.
 * `gh api --include` prints the status line even for a 401 and nothing at all when offline,
 * which separates a dead token from a dead network without matching error text.
 * @returns {Promise<{ state: 'ok'|'rejected'|'unknown', scopes: string[], login?: string }>}
 */
export async function probeGithubToken(token, run = defaultRun) {
  const res = await run('gh', ['api', '--hostname', HOST, '--include', 'user'], undefined, { GH_TOKEN: token });
  const [head] = res.stdout.split(/\r?\n\r?\n/, 1);
  const status = Number(head.match(/^HTTP\/\S+ (\d{3})/)?.[1]);
  if (status === 401) return { state: 'rejected', scopes: [] };
  if (status !== 200) return { state: 'unknown', scopes: [] };
  let login = null;
  try { login = JSON.parse(res.stdout.slice(head.length)).login; } catch { /* reported as unknown below */ }
  if (!login) return { state: 'unknown', scopes: [] };
  const scopes = (head.match(/^x-oauth-scopes:(.*)$/im)?.[1] || '').split(',').map((s) => s.trim()).filter(Boolean).sort();
  return { state: 'ok', login, scopes };
}

/** What a `gh` token can do that the store's cannot, and the reverse. */
export function compareScopes(gh, store) {
  return {
    added: gh.scopes.filter((scope) => !store.scopes.includes(scope)),
    removed: store.scopes.filter((scope) => !gh.scopes.includes(scope)),
  };
}

/** Sign `gh` in with `token` on stdin, then point git at it. */
export async function signInGh(token, run = defaultRun) {
  const login = await run('gh', ['auth', 'login', '--hostname', HOST, '--git-protocol', 'https', '--with-token'], token);
  if (!login.ok) return { status: 'failed', error: firstLine(login.stderr).replaceAll(token, '***') };
  await run('gh', ['auth', 'setup-git', '--hostname', HOST]);
  return { status: 'logged-in' };
}

/**
 * Bring `gh` in step with the store, unless that would lose something the operator holds.
 *
 * @param {{ token?: string, record?: { store: string, gh: string }, run?: Function }} options
 *   `record` is the pair this node last looked at; pass back the `record` of the result.
 * @returns {Promise<{
 *   status: 'no-token'|'gh-missing'|'current'|'logged-in'|'diverged'|'failed',
 *   reason?: string, first?: boolean, login?: string, store_login?: string|null,
 *   added?: string[], removed?: string[], replaced?: object, record?: object, error?: string,
 * }>} `diverged` left `gh` alone; `first` is true only when this is news, and `record` is
 *   missing or unchanged when GitHub could not be asked.
 */
export async function projectGithubLogin({ token, record, run = defaultRun } = {}) {
  const wanted = String(token || '').trim();
  if (!wanted) return { status: 'no-token' };

  const held = await readGhToken(run);
  if (held.state === 'gh-missing') return { status: 'gh-missing' };
  if (held.state === 'unreadable') return { status: 'failed', error: held.error.replaceAll(wanted, '***') };

  const storeFp = tokenFingerprint(wanted);
  const inStep = { store: storeFp, gh: storeFp };
  const signIn = async (reason, extra = {}) => {
    const result = await signInGh(wanted, run);
    return result.status === 'logged-in' ? { ...result, reason, ...extra, record: inStep } : result;
  };

  if (held.state === 'none') return signIn('no-login');
  if (held.token === wanted) return { status: 'current', record: inStep };

  const ghFp = tokenFingerprint(held.token);
  if (record?.gh === ghFp) {
    // Nothing moved: this difference was already reported, so stay quiet and off the network.
    if (record.store === storeFp) return { status: 'diverged', first: false, reason: record.reason, login: record.login, store_login: record.store_login, added: record.added, removed: record.removed, record };
    // Only the store moved. A rotation is deliberate, so it lands, over a local login too.
    return signIn('rotation', record.gh === record.store ? {} : { replaced: { reason: record.reason, login: record.login, added: record.added, removed: record.removed } });
  }

  const [gh, store] = await Promise.all([probeGithubToken(held.token, run), probeGithubToken(wanted, run)]);
  if (gh.state === 'rejected') return signIn('gh-token-rejected');
  // Offline, or GitHub answered oddly: not knowing is no reason to overwrite. Look again next cycle.
  if (gh.state !== 'ok' || store.state === 'unknown') return { status: 'diverged', first: false, reason: 'unverified', record };

  const keep = (reason, scopes = { added: [], removed: [] }) => {
    const next = { store: storeFp, gh: ghFp, reason, login: gh.login, store_login: store.login ?? null, ...scopes };
    return { status: 'diverged', first: true, reason, login: next.login, store_login: next.store_login, ...scopes, record: next };
  };
  if (store.state === 'rejected') return keep('store-token-rejected');
  if (gh.login !== store.login) return keep('different-account');
  const scopes = compareScopes(gh, store);
  const sameScopes = !scopes.added.length && !scopes.removed.length;
  // A local grant was removed again: same account, same powers, so nothing to lose.
  if (sameScopes && record && record.gh !== record.store) return signIn('same-scopes');
  // Otherwise someone asked for this new token on purpose, usually to rotate. Keep it.
  return keep(sameScopes ? 'new-token' : 'different-scopes', scopes);
}

/** Read-only comparison for operators. Holds fingerprints only, never a token. */
export async function inspectGithubLogin({ token, run = defaultRun } = {}) {
  const wanted = String(token || '').trim();
  if (!wanted) return { state: 'no-token' };
  const held = await readGhToken(run);
  if (held.state === 'gh-missing') return { state: 'gh-missing' };
  if (held.state === 'unreadable') return { state: 'unreadable', error: held.error.replaceAll(wanted, '***') };
  const store = { fingerprint: tokenFingerprint(wanted).slice(0, 12), ...(await probeGithubToken(wanted, run)) };
  if (held.state === 'none') return { state: 'no-login', store };
  if (held.token === wanted) return { state: 'same', store };
  const gh = { fingerprint: tokenFingerprint(held.token).slice(0, 12), ...(await probeGithubToken(held.token, run)) };
  // A rejected or unreachable token reports no scopes, which is not the same as holding none.
  return { state: 'diverged', gh, store, ...(gh.state === 'ok' && store.state === 'ok' ? compareScopes(gh, store) : { added: [], removed: [] }) };
}

/**
 * End a token at GitHub. This endpoint refuses authenticated requests, so it goes out without `gh`,
 * and it answers 202 before anything happens: only GitHub rejecting the token afterwards is proof.
 */
export async function revokeGithubToken(token, {
  run = defaultRun,
  fetchImpl = fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  attempts = 5,
  waitMs = 2000,
} = {}) {
  let requestStatus = null;
  try {
    const res = await fetchImpl(REVOKE_URL, {
      method: 'POST',
      headers: { accept: 'application/vnd.github+json', 'content-type': 'application/json', 'user-agent': 'total-recall' },
      body: JSON.stringify({ credentials: [token] }),
    });
    requestStatus = res.status;
  } catch { /* the check below decides */ }
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt) await sleep(waitMs);
    if ((await probeGithubToken(token, run)).state === 'rejected') return { revoked: true, request_status: requestStatus };
  }
  return { revoked: false, request_status: requestStatus };
}
