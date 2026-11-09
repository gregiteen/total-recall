import fs from 'node:fs';
import path from 'node:path';
import { git, tr, operation, output } from '../lib/context.mjs';

// Git treats 1..127 (except 125) as a bad revision. Abort on runner failures.
const RUNNER = `const {spawnSync}=require('node:child_process');
const r=spawnSync(process.env.GIT_PLUGIN_TR_BIN||'total-recall',['code-quality','check','--json'],{encoding:'utf8',shell:false,maxBuffer:16777216});
let data;try{data=JSON.parse(r.stdout)}catch{}
const valid=data&&typeof data.ok==='boolean';
process.exitCode=r.error||!valid||![0,1,125].includes(r.status)?128:r.status===125?125:r.status===0&&data.ok?0:1;`;

export const operations = {
  'bisect-agent': operation('Find the first bad commit with the repository quality gate', 'bisect-agent <good> <bad> [--json]', async (args, ctx) => {
    if (args.length !== 2 || args.some(arg => arg.startsWith('-'))) throw new Error('Supply good and bad revisions');
    if (git(ctx, ['status', '--porcelain=v1', '-z']).length) throw new Error('Bisect requires a clean tree');
    const bisectStart = git(ctx, ['rev-parse', '--git-path', 'BISECT_START']).trim();
    if (fs.existsSync(path.resolve(ctx.cwd, bisectStart))) throw new Error('A bisect session is already active');
    const refs = args.map(ref => git(ctx, ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`]).trim());
    if (refs[0] === refs[1]) throw new Error('Good and bad revisions must differ');
    git(ctx, ['merge-base', '--is-ancestor', ...refs]);
    // Probe the contract before changing HEAD. A failing gate is a valid probe.
    const probe = tr(ctx, ['code-quality', 'check', '--json']);
    let report;
    try { report = JSON.parse(probe.stdout); } catch { /* invalid below */ }
    if (probe.error || ![0, 1].includes(probe.status) || typeof report?.ok !== 'boolean') throw new Error('Repository code-quality check is unavailable or returned an invalid report');
    let started = false;
    try {
      git(ctx, ['bisect', 'start', refs[1], refs[0]]);
      started = true;
      const result = ctx.git(['bisect', 'run', process.execPath, '-e', RUNNER], { env: ctx.env, timeout: 30 * 60 * 1000 });
      if ((result.status ?? result.code) !== 0 || result.error) throw new Error('Bisect did not identify one bad commit. The gate failed, aborted or skipped revisions.');
      const firstBad = git(ctx, ['rev-parse', '--verify', 'refs/bisect/bad']).trim();
      const message = git(ctx, ['show', '-s', '--format=%s', firstBad]).trim();
      output(ctx, { ok: true, firstBad, message, gate: 'total-recall code-quality check --json' }, `First bad commit: ${firstBad}\n${message}`);
      return 0;
    } finally {
      if (started) git(ctx, ['bisect', 'reset']);
    }
  }),
};
