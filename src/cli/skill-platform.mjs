import os from 'node:os';
import { refreshPlatformSkill } from '../core/platform-skill-maintenance.mjs';

/** Explicit scope and a reviewed hash are required; no registry discovery or init. */
export function runPlatformRefresh(args, { home = os.homedir(), refresh = refreshPlatformSkill } = {}) {
  const skillId = args[0];
  const flags = args.slice(1);
  const values = {};
  for (let i = 0; i < flags.length; i++) {
    const flag = flags[i];
    if (!['--repo', '--global', '--source-hash', '--apply', '--dry-run', '--json'].includes(flag) || flag in values) {
      throw new Error(`Invalid platform refresh option: ${flag}`);
    }
    if (['--repo', '--source-hash'].includes(flag)) {
      if (!flags[i + 1] || flags[i + 1].startsWith('--')) throw new Error(`Missing value for ${flag}`);
      values[flag] = flags[++i];
    } else values[flag] = true;
  }
  if (Boolean(values['--repo']) === Boolean(values['--global']) || values['--apply'] && values['--dry-run']) {
    throw new Error('Usage: skill refresh-platform <id> (--repo <existing-root> | --global) [--apply --source-hash <plan-hash>] [--dry-run] [--json]');
  }
  const result = refresh({ skillId, repo: values['--repo'] || home,
    apply: Boolean(values['--apply']), expectedSourceHash: values['--source-hash'] });
  console.log(JSON.stringify(result, null, 2));
  return result;
}
