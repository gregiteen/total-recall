import { InvokeError } from './invoke-execution.mjs';
import { validateConfinedFact } from '../core/confined-memory.mjs';

/** Resolve fresh key AND ancestors through the shared auth owner on each check. */
export function invokeAuthority(req, { loadKeys, keyHasScope }) {
  try { return resolveAuthority(req, { loadKeys, keyHasScope }); }
  catch (err) {
    if (err instanceof InvokeError) throw err;
    throw new InvokeError(503, 'authority-unavailable', 'Shared auth authority is unavailable.');
  }
}

function resolveAuthority(req, { loadKeys, keyHasScope }) {
  if (req.auth?.type !== 'pat' || !req.auth.id) {
    throw new InvokeError(403, 'explicit-key-required', 'Invoke requires a named PAT with an explicit invoke mode.');
  }
  const keys = loadKeys();
  const chain = [], seen = new Set();
  let key = keys.find(k => k.id === req.auth.id);
  while (key) {
    if (seen.has(key.id) || !keyHasScope(key, null)) throw new InvokeError(403, 'authority-ended', 'Key or issuer is expired, revoked or invalid.');
    seen.add(key.id); chain.push(key);
    if (key.issued_by === 'local-operator' || !key.issued_by) break;
    key = keys.find(k => k.id === key.issued_by);
    if (!key) throw new InvokeError(403, 'authority-ended', 'Issuer is unavailable.');
  }
  if (!chain.length) throw new InvokeError(403, 'authority-ended', 'Key is unavailable.');
  const allows = scope => chain.every(k => keyHasScope(k, scope));
  // The leaf must carry a literal mode. A historical wildcard does not opt in.
  const full = chain.every(k => k.scopes?.includes('invoke:full')) && allows('invoke:full');
  const restricted = chain[0].scopes?.includes('invoke:restricted') && allows('invoke:restricted');
  if (!full && !restricted) throw new InvokeError(403, 'invoke-grant-required', 'Explicit invoke:full or invoke:restricted grant required; legacy keys are not migrated automatically.');
  return { id: chain[0].id, scopes: chain[0].scopes, mode: full ? 'full' : 'restricted', allows };
}

export function operationAllowed(authority, operation, scope, targets = ['server']) {
  if (scope && !authority.allows(scope)) return false;
  if (operation === 'capabilities') return true;
  if (authority.mode === 'full') return true;
  return ['ssss.read', 'ssss.write'].includes(operation) && targets.some(target =>
    authority.allows(target === 'server' ? 'brain:server' : `brain:project-${target.slice('project:'.length)}`));
}

export function authorizeInvoke(authority, operation, scope, params, targets = ['server']) {
  if (scope && !authority.allows(scope)) throw new InvokeError(403, 'insufficient-scope', `Operation requires scope '${scope}'.`);
  if (!operationAllowed(authority, operation, scope, targets)) {
    throw new InvokeError(403, 'unsupported-restricted-operation', 'No confined owner adapter is available for this operation.');
  }
  if (authority.mode === 'restricted') {
    if (operation === 'capabilities') return;
    if (!targets.includes(params.target ?? 'server') || params.scope !== undefined) {
      throw new InvokeError(403, 'target-denied', 'Restricted memory requires an available granted brain target.');
    }
    if (operation === 'ssss.write') {
      try { validateConfinedFact({ ...params, target: 'server' }); }
      catch { throw new InvokeError(400, 'invalid-fact', 'Restricted writes accept only fact content, optional title and plain tags.'); }
      return;
    }
    const allowed = new Set(['query', 'category', 'limit', 'target', 'timeoutMs']);
    if (Object.keys(params).some(k => !allowed.has(k))) {
      throw new InvokeError(400, 'unknown-parameter', 'Unsupported restricted retrieval parameter.');
    }
  }
}
