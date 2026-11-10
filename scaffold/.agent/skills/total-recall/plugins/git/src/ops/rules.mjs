import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import { collectAudit, collectIdentity, isPassthrough } from '../../cli.mjs';
import { checkSecrets } from './secret-firewall.mjs';
import { failure, gitText, helpOnly, invocation, outgoingCommits, output, prospectiveCommit, repoId, stateStore } from './_support.mjs';

export const machineEmail = address => {
  const domain = address.split('@')[1]?.toLowerCase();
  return !domain || !domain.includes('.') || /\.(local|lan|home|internal|localdomain)$/.test(domain) || domain === 'localhost';
};

async function visibility(ctx) {
  // No remote: nothing can be published, so the repository is local, not public.
  if (!String(ctx.git(['remote']).stdout || '').trim()) return 'LOCAL';
  const repository = repoId(ctx);
  // Remote URLs can contain credentials. Cache only the URL fingerprint.
  const remote = createHash('sha256').update(ctx.git(['config', '--get', 'remote.origin.url']).stdout?.trim() || '').digest('hex');
  let store;
  let cached;
  try {
    store = await stateStore(ctx, 'visibility');
    cached = store.read({})[repository];
  } catch { /* Live visibility can still prove the rule. */ }
  const result = spawnSync(ctx.env?.GIT_PLUGIN_GH_BIN || 'gh', ['repo', 'view', '--json', 'visibility'], {
    cwd: gitText(ctx, ['rev-parse', '--show-toplevel']).trim(), env: ctx.env, encoding: 'utf8', shell: false, timeout: 15000,
  });
  let value;
  try { if (result.status === 0) value = JSON.parse(result.stdout).visibility?.toUpperCase(); } catch { /* refuse unknown */ }
  if (['PUBLIC', 'PRIVATE', 'INTERNAL'].includes(value)) {
    if (store) {
      const cache = store.read({});
      cache[repository] = { value, remote, checkedAt: new Date().toISOString() };
      store.write(cache);
    }
    return value;
  }
  if (cached?.remote === remote && ['PUBLIC', 'PRIVATE', 'INTERNAL'].includes(cached.value) &&
      Date.now() - Date.parse(cached.checkedAt) < 24 * 60 * 60 * 1000) return cached.value;
  throw new Error('Cannot verify repository visibility for internal project records');
}

export async function checkRules(args, ctx) {
  const call = invocation(args, ctx);
  if (!['commit', 'push'].includes(call.command) || helpOnly(args)) return;
  let prospective;
  try {
    const paths = new Set();
    const checkIdentity = text => {
      const emails = [...text.matchAll(/<([^<>\s]+)>/g)].map(m => m[1]);
      if (!emails.length || emails.some(machineEmail)) throw new Error('Refusing a machine-derived identity');
    };
    if (call.command === 'commit') {
      prospective = prospectiveCommit(call.ctx, call.args);
      call.ctx = prospective.ctx;
      for (const type of ['GIT_AUTHOR_IDENT', 'GIT_COMMITTER_IDENT']) checkIdentity(gitText(call.ctx, ['var', type]));
      const authorAt = call.args.findIndex(a => a === '--author');
      const author = authorAt >= 0 ? call.args[authorAt + 1] : call.args.find(a => a.startsWith('--author='))?.slice(9);
      if (author) checkIdentity(author);
      // --amend and -C/-c reuse identities from history unless reset-author is set.
      if (!call.args.includes('--reset-author')) {
        const reuseAt = call.args.findIndex(a => ['-C', '-c', '--reuse-message', '--reedit-message'].includes(a));
        const reuse = reuseAt >= 0 ? call.args[reuseAt + 1] : call.args.find(a => /^--(reuse|reedit)-message=/.test(a))?.split('=').slice(1).join('=');
        if (reuse || call.args.includes('--amend')) checkIdentity(gitText(call.ctx, ['show', '-s', '--format=%an <%ae>', reuse || 'HEAD']));
      }
      for (const file of gitText(call.ctx, ['diff', '--cached', '--name-only', '--diff-filter=ACMRT', '-z', '--']).split('\0').filter(Boolean)) paths.add(file);
    } else {
      for (const commit of outgoingCommits(call.ctx, call.args)) {
        checkIdentity(gitText(call.ctx, ['show', '-s', '--format=%an <%ae>%n%cn <%ce>', commit]));
        for (const file of gitText(call.ctx, ['ls-tree', '-r', '--name-only', '-z', commit]).split('\0').filter(Boolean)) paths.add(file);
      }
    }
    if ([...paths].some(file => file === '.github/workflows' || file.startsWith('.github/workflows/'))) return { refuse: 'Workflow files are prohibited (.github/workflows)' };
    if ([...paths].some(file => file.startsWith('docs/projects/')) && await visibility(call.ctx) === 'PUBLIC') {
      return { refuse: 'Internal project records cannot enter a public repository (docs/projects)' };
    }
  } catch (error) { return { refuse: error.message }; }
  finally { prospective?.cleanup(); }
}

export const guards = [{ name: 'rules', before: checkRules }];
