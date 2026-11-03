/**
 * `mesh grants` — which enrolled machines may read which secret keys.
 *
 *   mesh grants list
 *   mesh grants add    (--node <name> | --tag <tag:x> | --user <login>) (KEY | --repo <name>)...
 *   mesh grants remove (--node <name> | --tag <tag:x> | --user <login>) [KEY...]
 *
 * Keys may end in `*` to match a prefix. `--repo <name>` grants every secret whose `repos`
 * metadata names that repository (stored as `repo:<name>`, resolved on the leader). Prefer it to
 * `*`: a node that leaks then exposes only what its repositories use. Nothing is granted by default.
 */
import { grantKeys, loadPolicy, revokeKeys, savePolicy, policyPath } from '../core/mesh-identity.mjs';

function parse(args) {
  const selector = {};
  const keys = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--node' || arg === '--tag' || arg === '--user') selector[arg.slice(2)] = args[(i += 1)];
    else if (arg === '--repo') keys.push(`repo:${args[(i += 1)]}`);
    else if (arg.startsWith('--')) throw new Error(`Unknown option ${arg}`);
    else keys.push(arg);
  }
  return { selector, keys };
}

export async function grantsCli(args, brainDir, out = console.log, warn = console.error) {
  const action = args[0] || 'list';
  if (action === 'list') {
    out(JSON.stringify({ path: policyPath(brainDir), ...loadPolicy(brainDir) }));
    return;
  }
  if (action !== 'add' && action !== 'remove') throw new Error('Usage: mesh grants list|add|remove');
  const { selector, keys } = parse(args.slice(1));
  if (action === 'add' && keys.includes('*')) warn('Warning: "*" gives this machine every secret; if it leaks, every secret must be rotated. Prefer --repo <name> or named keys.');
  const current = loadPolicy(brainDir);
  const next = action === 'add' ? grantKeys(current, selector, keys) : revokeKeys(current, selector, keys);
  savePolicy(brainDir, next);
  out(JSON.stringify({ ok: true, grants: next.grants.length }));
}
