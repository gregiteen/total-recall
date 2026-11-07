/**
 * `auth secret gh-login`: see how this machine's `gh` login compares with `github_token`,
 * share it with the mesh, or return to the store's token. Prints fingerprints, never values.
 */
import { adoptGithubLogin, githubLoginStatus, useStoreGithubLogin } from './secrets-sync.mjs';

const USAGE = 'Usage: total-recall auth secret gh-login <status|adopt [--yes] [--revoke-old]|use-store [--yes]> [--json]';
const COMMAND = 'total-recall auth secret gh-login';

const scopeList = (scopes) => (scopes?.length ? scopes.join(', ') : 'no classic scopes');

function tokenLine(label, token) {
  if (token.state === 'rejected') return `    ${label}  ${token.fingerprint}  rejected by GitHub`;
  if (token.state !== 'ok') return `    ${label}  ${token.fingerprint}  could not be checked with GitHub`;
  return `    ${label}  ${token.fingerprint}  ${token.login}  ${scopeList(token.scopes)}`;
}

function scopeChange({ added = [], removed = [], store }) {
  if (store && store.state !== 'ok') return ['    the stored token is already rejected by GitHub, so there is no scope change to compare'];
  const lines = [];
  if (added.length) lines.push(`    gains: ${added.join(', ')}`);
  if (removed.length) lines.push(`    loses: ${removed.join(', ')}`);
  return lines.length ? lines : ['    scopes unchanged'];
}

function statusText(status) {
  if (status.state === 'no-token') return ['', '  The store holds no github_token.', ''];
  if (status.state === 'gh-missing') return ['', '  gh is not installed on this machine.', ''];
  if (status.state === 'unreadable') return ['', `  Could not read gh's login: ${status.error}`, ''];
  if (status.state === 'no-login') return ['', '  gh holds no login here. The next sync signs it in from github_token.', tokenLine('store', status.store), ''];
  if (status.state === 'same') return ['', '  gh on this machine uses github_token.', tokenLine('store', status.store), ''];
  return [
    '',
    '  gh on this machine differs from github_token.',
    tokenLine('gh   ', status.gh),
    tokenLine('store', status.store),
    '',
    '  The sync leaves this login alone until github_token is rotated.',
    `    Share it with every machine:   ${COMMAND} adopt`,
    `    Go back to the store's token:  ${COMMAND} use-store`,
    '',
  ];
}

function adoptText(result) {
  if (result.state === 'same') return ['', `  gh already uses ${result.key} (${result.fingerprint}).`, ''];
  const where = result.target === 'this machine' ? 'this machine (the leader)' : `the leader (${result.target})`;
  if (result.planned) {
    return [
      '',
      `  Would save gh's token (${result.gh.fingerprint}) as ${result.key} on ${where}, replacing ${result.store.fingerprint}.`,
      '  Every machine granted this key receives it on its next sync, with these scopes:',
      `    ${scopeList(result.gh.scopes)}`,
      ...scopeChange(result),
      ...(result.revoke_old && result.store.state === 'ok' ? ['  Then ends the old token at GitHub. That cannot be undone.'] : []),
      '  Run again with --yes to do it.',
      '',
    ];
  }
  const lines = ['', `  ✅ ${result.key} is now gh's token (${result.gh.fingerprint}), saved on ${where}.`, ...scopeChange(result)];
  if (result.leader_gh === 'failed') lines.push("  ❌ The leader's gh did not sign in, so it still uses the old token.");
  if (result.revocation?.skipped) lines.push(`  ❌ The old token still works: ${result.revocation.skipped}.`);
  else if (result.revocation?.revoked) lines.push(`  ✅ GitHub now rejects the old token (${result.store.fingerprint}).`);
  else if (result.revocation) lines.push(`  ❌ The old token (${result.store.fingerprint}) still works (revoke request ${result.revocation.request_status ?? 'failed'}).`);
  if (result.revocation && !result.revocation.skipped && !result.revocation.new_token_works) lines.push('  ❌ GitHub no longer accepts the new token. Sign in with gh again, then adopt again.');
  lines.push('');
  return lines;
}

function useStoreText(result) {
  if (result.error) return ['', `  ❌ gh did not sign in: ${result.error}`, ''];
  if (result.changed === false) return ['', '  gh already uses github_token.', ''];
  if (result.planned) {
    const local = result.gh ? tokenLine('gh   ', result.gh) : '    gh     holds no login';
    return ['', "  Would sign gh in from github_token, giving up this machine's own login.", local, tokenLine('store', result.store), '  Getting a broader login back takes a new browser approval. Run again with --yes to do it.', ''];
  }
  return ['', '  ✅ gh now uses github_token.', tokenLine('store', result.store), ''];
}

/** @returns {Promise<number>} the exit code */
export async function runGhLogin(brainDir, opts) {
  const action = opts.key;
  if (opts.unknownOption || opts.value || !['status', 'adopt', 'use-store'].includes(action)) {
    console.error(opts.unknownOption ? `  Unknown option for gh-login: ${opts.unknownOption}` : USAGE);
    return 1;
  }
  let result;
  let text;
  if (action === 'status') {
    result = await githubLoginStatus({ dir: brainDir });
    text = statusText;
  } else if (action === 'adopt') {
    result = await adoptGithubLogin({ dir: brainDir, yes: opts.yes === true, revokeOld: opts.revokeOld === true });
    text = adoptText;
  } else {
    result = await useStoreGithubLogin({ dir: brainDir, yes: opts.yes === true });
    text = useStoreText;
  }
  if (opts.json) console.log(JSON.stringify(result, null, 2));
  else console.log(text(result).join('\n'));
  return result.ok === false ? 1 : 0;
}
