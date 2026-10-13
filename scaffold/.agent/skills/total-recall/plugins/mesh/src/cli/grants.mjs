/**
 * `mesh grants` — which enrolled machines may read which secret keys.
 *
 *   mesh grants list
 *   mesh grants add    (--node <name> | --tag <tag:x> | --user <login>) KEY [KEY...]
 *   mesh grants remove (--node <name> | --tag <tag:x> | --user <login>) [KEY...]
 *
 * Keys may end in `*` to match a prefix. Nothing is granted by default.
 */
import { grantKeys, loadPolicy, revokeKeys, savePolicy, policyPath } from '../core/mesh-identity.mjs';

function parse(args) {
  const selector = {};
  const keys = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--node' || arg === '--tag' || arg === '--user') selector[arg.slice(2)] = args[(i += 1)];
    else if (arg.startsWith('--')) throw new Error(`Unknown option ${arg}`);
    else keys.push(arg);
  }
  return { selector, keys };
}

export async function grantsCli(args, brainDir, out = console.log) {
  const action = args[0] || 'list';
  if (action === 'list') {
    out(JSON.stringify({ path: policyPath(brainDir), ...loadPolicy(brainDir) }));
    return;
  }
  if (action !== 'add' && action !== 'remove') throw new Error('Usage: mesh grants list|add|remove');
  const { selector, keys } = parse(args.slice(1));
  const current = loadPolicy(brainDir);
  const next = action === 'add' ? grantKeys(current, selector, keys) : revokeKeys(current, selector, keys);
  savePolicy(brainDir, next);
  out(JSON.stringify({ ok: true, grants: next.grants.length }));
}
