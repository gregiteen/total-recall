import fs from 'node:fs';
import path from 'node:path';
import { optimizeSkills, skillDirectories } from '../core/skill-optimizer.mjs';

export function runSkillOptimize(args) {
  const dirs = []; let maxTokens = 900, apply = false, json = false, summary, repoRoot, globalRoot, profileName;
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === '--apply') apply = true;
    else if (flag === '--dry-run') { /* default */ }
    else if (flag === '--json') json = true;
    else if (['--skill', '--root', '--max-tokens', '--summary-file', '--repo-root', '--global-root', '--profile'].includes(flag)) {
      const value = args[++i];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
      if (flag === '--skill') dirs.push(value);
      else if (flag === '--root') dirs.push(...skillDirectories(value));
      else if (flag === '--max-tokens') maxTokens = Number(value);
      else if (flag === '--repo-root') repoRoot = value;
      else if (flag === '--global-root') globalRoot = value;
      else if (flag === '--profile') profileName = value;
      else summary = fs.readFileSync(value, 'utf8');
    } else throw new Error(`Unknown optimizer option: ${flag}`);
  }
  if (!dirs.length) throw new Error('Specify --skill <package> or --root <skills-directory>; no implicit cross-repo scope');
  if (summary !== undefined && dirs.length !== 1) throw new Error('Authored summary requires exactly one skill');
  if (apply && args.includes('--dry-run')) throw new Error('Choose --apply or --dry-run');
  let profile, profileRole, expectedRepository;
  if (profileName) {
    if (summary !== undefined) throw new Error('Choose --profile or --summary-file');
    const profiles = JSON.parse(fs.readFileSync(new URL('../../templates/skill-routers.json', import.meta.url), 'utf8'));
    if (!['portable', 'total-recall'].includes(profileName)) throw new Error('Unknown routing profile');
    profile = profiles[profileName];
    if (profileName === 'total-recall') {
      if (!repoRoot) throw new Error('Repository profile requires --repo-root');
      expectedRepository = 'total-recall-brain';
      if (JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).name !== expectedRepository) throw new Error('Routing profile repository mismatch');
      profileRole = 'repository';
    } else {
      if (!globalRoot && !repoRoot) throw new Error('Portable profile requires an explicit ownership root');
      profileRole = 'portable';
    }
  }
  const results = optimizeSkills(dirs, { maxTokens, apply, summary, repoRoot, globalRoot, profile, profileRole, expectedRepository });
  const counts = {};
  for (const r of results) counts[r.status] = (counts[r.status] || 0) + 1;
  const report = { mode: apply ? 'apply' : 'dry-run', measurement: 'ceil(characters / 4), not model tokens or total session context', counts,
    saved_estimated_tokens: results.reduce((n, r) => n + (r.saved || 0), 0), results };
  console.log(json ? JSON.stringify(report) : `${report.mode}: ${JSON.stringify(counts)}; ${report.saved_estimated_tokens} estimated tokens saved${apply ? '' : ' if applied'}\n` + results.filter(r => r.status !== 'current').slice(0, 20).map(r => `${r.status}: ${r.path} (${r.before ?? '?'} → ${r.after ?? '?'}) ${r.reason || ''}`).join('\n'));
  return results.some(r => r.status === 'error') ? 1 : results.some(r => r.status === 'review') ? 2 : 0;
}
