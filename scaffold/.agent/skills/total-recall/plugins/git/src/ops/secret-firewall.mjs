import { spawnSync } from 'node:child_process';
import { gitText, helpOnly, invocation, outgoingCommits, prospectiveCommit } from './_support.mjs';

/**
 * Ask the auth plugin which stored values occur in the text. One call per check; values never
 * enter this process, only key names come back (`auth secret scan --stdin`, exit 1 on a match).
 */
export function scanText(ctx, text) {
  const result = spawnSync(ctx.env?.GIT_PLUGIN_TR_BIN || 'total-recall', ['auth', 'secret', 'scan', '--stdin', '--json'], {
    cwd: ctx.cwd, env: ctx.env, input: text, encoding: 'utf8', shell: false, timeout: 120000, maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error || ![0, 1].includes(result.status)) throw new Error('Auth secret scan failed');
  const reply = JSON.parse(result.stdout);
  if (!Array.isArray(reply.keys)) throw new Error('Auth secret scan returned no key list');
  return reply.keys;
}

export function checkSecrets(args, ctx) {
  const call = invocation(args, ctx);
  if (!['commit', 'push'].includes(call.command) || helpOnly(args)) return;
  let prospective;
  try {
    if (call.command === 'commit') { prospective = prospectiveCommit(call.ctx, call.args); call.ctx = prospective.ctx; }
    // Collect what would be published, then scan it in one auth call.
    const chunks = [];
    const add = value => chunks.push(Buffer.isBuffer(value) ? value.toString('utf8') : value);
    if (call.command === 'commit') {
      add(gitText(call.ctx, ['diff', '--cached', '--no-ext-diff', '--no-textconv', '--binary', '--']));
      const paths = gitText(call.ctx, ['diff', '--cached', '--name-only', '--diff-filter=ACMRT', '-z', '--']).split('\0').filter(Boolean);
      for (const file of paths) {
        const row = call.ctx.git(['show', `:${file}`], { encoding: null });
        if (row.error || row.status !== 0) throw new Error('Cannot scan a staged object');
        add(row.stdout);
      }
    } else {
      const scanned = new Set();
      for (const commit of outgoingCommits(call.ctx, call.args)) {
        add(gitText(call.ctx, ['show', '--format=fuller', '--root', '--no-ext-diff', '--no-textconv', '--binary', commit, '--']));
        // Raw blobs of the files this commit changed: a binary patch does not contain the original bytes.
        const changed = gitText(call.ctx, ['diff-tree', '-r', '-z', '--root', '--no-commit-id', commit]).split('\0').filter(Boolean);
        for (const entry of changed) {
          const m = entry.match(/^:\d+ \d+ [a-f0-9]+ ([a-f0-9]+) [ACMRT]/);
          if (!m || /^0+$/.test(m[1]) || scanned.has(m[1])) continue;
          scanned.add(m[1]);
          const row = call.ctx.git(['cat-file', 'blob', m[1]], { encoding: null });
          if (row.error || row.status !== 0) throw new Error('Cannot scan an outgoing object');
          add(row.stdout);
        }
      }
    }
    // Batches stay under the auth scan input limit (64 MB) with room to spare.
    const matches = new Set();
    let batch = [], size = 0;
    const flush = () => { if (batch.length) for (const key of scanText(call.ctx, batch.join('\n'))) matches.add(key); batch = []; size = 0; };
    for (const chunk of chunks) {
      if (size + chunk.length > 32 * 1024 * 1024) flush();
      batch.push(chunk); size += chunk.length + 1;
    }
    flush();
    if (matches.size) return { refuse: `Auth secret match: ${[...matches].sort().join(', ')}` };
  } catch {
    return { refuse: 'Secret firewall could not complete. Check auth store and repository access.' };
  } finally { prospective?.cleanup(); }
}

export const guards = [{ name: 'secret-firewall', before: checkSecrets }];
