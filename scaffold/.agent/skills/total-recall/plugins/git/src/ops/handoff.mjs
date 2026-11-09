import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { exportBundle, validateBundle } from '@gregiteen/ssss-cli/bundle';
import { serializeDocument } from '@gregiteen/ssss-cli/frontmatter';
import { git, trJSON, activePlan, ledger, operation, output } from '../lib/context.mjs';

export const operations = {
  handoff: operation('Pack a branch, project tracker and related memory in an SSSS bundle', 'handoff <branch> [--out <file>] [--json]', async (args, ctx) => {
    if (['create', 'verify', 'list-heads', 'unbundle'].includes(args[0])) {
      const result = ctx.git(['bundle', ...args]);
      if (result.stdout) process.stdout.write(result.stdout);
      if (result.stderr) process.stderr.write(result.stderr);
      return result.status ?? result.code ?? 1;
    }
    const [branch, flag, name] = args;
    if (!branch || branch.startsWith('-') || (args.length !== 1 && !(args.length === 3 && flag === '--out' && name))) throw new Error('Use bundle <branch> [--out <file>]');
    git(ctx, ['check-ref-format', '--branch', branch]);
    const ref = `refs/heads/${branch}`;
    const sha = git(ctx, ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`]).trim();
    let plan;
    if (git(ctx, ['branch', '--show-current']).trim() === branch) plan = activePlan(ctx);
    else {
      const paths = git(ctx, ['ls-tree', '-r', '--name-only', '-z', ref, '--', 'docs/projects/in-progress']).split('\0').filter(file => file.endsWith('_PROJECT_TRACKER.md'));
      if (paths.length !== 1) throw new Error('The branch must contain one active tracker');
      plan = { tracker: paths[0], body: git(ctx, ['show', `${ref}:${paths[0]}`]) };
    }
    if (!plan.tracker) throw new Error('A hand-off bundle requires an active tracker');
    const commits = new Set(git(ctx, ['rev-list', ref]).trim().split('\n'));
    const store = await ledger(ctx);
    const records = store?.read([]).filter(row => commits.has(row.sha)) || [];
    const memory = trJSON(ctx, ['recall', `${branch} ${records.flatMap(row => row.trackerItems || []).join(' ')}`, '--local', '--project', '--format', 'json']);
    if (!Array.isArray(memory)) throw new Error('Related memory must be a result array');
    const out = path.resolve(ctx.cwd, name || `${branch.replace(/[^\w.-]/g, '-')}.ucw.json`);
    if (fs.existsSync(out)) throw new Error('The output file already exists');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'git-handoff-'));
    try {
      const pack = path.join(tmp, 'branch.bundle');
      git(ctx, ['bundle', 'create', pack, ref]);
      git(ctx, ['bundle', 'verify', pack]);
      const vault = path.join(tmp, 'vault');
      fs.mkdirSync(vault);
      const asset = (file, title, content, encoding = 'utf-8', mime = 'text/plain') => {
        const bytes = encoding === 'base64' ? Buffer.from(content, 'base64') : Buffer.from(content);
        fs.writeFileSync(path.join(vault, file), serializeDocument({ type: 'asset', name: title, title, description: `Git hand-off: ${title}`, timestamp: new Date().toISOString(), mime_type: mime, encoding, x_portability: 'tenant_private', hash: `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`, size_bytes: bytes.length }, content));
      };
      asset('branch.md', `${branch}.bundle`, fs.readFileSync(pack).toString('base64'), 'base64', 'application/x-git-bundle');
      asset('tracker.md', path.basename(plan.tracker), plan.body, 'utf-8', 'text/markdown');
      asset('memory.md', 'Related repository memory', JSON.stringify({ branch, sha, records, memory }, null, 2), 'utf-8', 'application/json');
      const bundle = exportBundle(vault, { name: `Git hand-off: ${branch}`, description: 'Branch, active tracker and related repository memory', profile: 'backup', exportedAt: new Date().toISOString() });
      const check = validateBundle(bundle);
      if (!check.valid) throw new Error(`Invalid SSSS hand-off bundle: ${check.errors.join('; ')}`);
      fs.writeFileSync(out, JSON.stringify(bundle, null, 2), { flag: 'wx', mode: 0o600 });
      output(ctx, { ok: true, file: out, branch, sha, manifest: bundle.manifest }, `Saved ${out}`);
      return 0;
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  }),
};
