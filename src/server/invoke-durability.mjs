/**
 * Trusted host fact broker. Only this fixed, schema-checked operation crosses
 * the permission boundary. SSSS owns intent -> document -> event fsync ordering;
 * a later filesystem sweep cannot supply that guarantee.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { commitConfinedFact, validateConfinedFact } from '../core/confined-memory.mjs';
import { InvokeError, invokeEnvironment } from './invoke-execution.mjs';

const entry = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(entry), '../..');

/** All options are host context; none are taken from request parameters. */
export async function brokerConfinedFact(params, { req, store, authorityId, target, selectedBrain,
  serverBrain, registryBrain, signal, limits, run }) {
  const started = Date.now();
  // Re-resolve authority and the selected-brain owner here, independently of
  // route authorization. A caller supplies neither a filesystem root nor code.
  const { invokeAuthority, authorizeInvoke } = await import('./invoke-policy.mjs');
  const { restrictedBrainTargets } = await import('./invoke-targets.mjs');
  const checkAuthority = () => {
    if (signal.aborted) throw new InvokeError(403, 'authority-ended', 'Caller authority ended before execution.');
    const authority = invokeAuthority(req, store);
    const targets = restrictedBrainTargets(authority, { serverBrain, registryBrain });
    if (authority.mode !== 'restricted' || authority.id !== authorityId ||
      (params.target ?? 'server') !== target || targets.get(target) !== selectedBrain) {
      throw new InvokeError(403, 'authority-ended', 'Caller authority or target changed.');
    }
    authorizeInvoke(authority, 'ssss.write', 'ssss:write', params, [...targets.keys()]);
    return authority;
  };
  const authority = checkAuthority();
  const fact = { ...params, target: 'server' };
  validateConfinedFact(fact);
  const deadline = started + Math.min(params.timeoutMs ?? limits.timeoutMs, limits.timeoutMs);
  let result = { committed: false, indexed: false };
  const remaining = () => {
    if (Date.now() >= deadline) throw new InvokeError(504, 'timeout', 'Fact execution reached its deadline.', result);
    return deadline - Date.now();
  };
  const parse = run => { try { return JSON.parse(run.stdout); } catch { return null; } };
  const failed = (run, state) => {
    if (run.exit_code === 0 && !run.termination_reason && !run.truncated) return;
    const code = run.termination_reason || (run.truncated ? 'output-limit' : 'mutation-failed');
    throw new InvokeError(code === 'timeout' ? 504 : code === 'authority-ended' ? 403 : 422,
      code, 'Fact execution did not complete; check committed/indexed status before retry.', state);
  };
  try {
    // A disposable trusted transaction worker keeps kill/deadline semantics even
    // during SSSS lock waits. Entry, argv, environment, principal and target are
    // host-selected. No CLI, plugins, generators or caller code are loaded.
    const committed = await run({ entry, cwd: root, env: invokeEnvironment(false),
      timeoutMs: remaining(), nodeArgs: ['--max-old-space-size=128'],
      input: JSON.stringify({ brain: selectedBrain, params: fact, caller: authority.id }) });
    const response = parse(committed);
    result = response || { committed: 'unknown', indexed: false };
    failed(committed, result);
    if (response?.committed !== true || response.indexed !== false ||
      !/^fact-[0-9a-f-]{36}$/.test(response.slug) || response.path !== `memory-vault/facts/${response.slug}.md` ||
      typeof response.operation_id !== 'string') {
      throw new InvokeError(502, 'invalid-owner-output', 'Transaction returned invalid output.', { committed: 'unknown', indexed: false });
    }
    checkAuthority();
    const projection = await run({ entry: path.join(root, 'src/server/invoke-write-child.mjs'),
      cwd: root, env: invokeEnvironment(false), timeoutMs: remaining(),
      nodeArgs: ['--max-old-space-size=128', '--permission',
        `--allow-fs-read=${path.join(root, 'src')}`, `--allow-fs-read=${path.join(root, 'node_modules')}`,
        `--allow-fs-read=${path.join(root, 'package.json')}`, `--allow-fs-read=${selectedBrain}`,
        `--allow-fs-write=${path.join(selectedBrain, 'memory-derived')}`,
        `--allow-fs-write=${path.join(selectedBrain, 'memory-derived', '*')}`],
      input: JSON.stringify({ brain: selectedBrain }) });
    const indexed = parse(projection);
    // Projection output can never change the trusted transaction outcome.
    if (indexed?.indexed === true && !projection.truncated) result = { ...result, indexed: true };
    failed(projection, result);
    if (indexed?.indexed !== true) throw new InvokeError(502, 'invalid-owner-output', 'Index returned invalid output.', result);
    checkAuthority(); remaining();
    return result;
  } catch (err) {
    err.result ||= result;
    throw err;
  }
}

// Private fixed transaction entrypoint, reached only by the authorized host
// broker. This process intentionally uses real fsync, outside Node permissions.
if (process.argv[1] && path.resolve(process.argv[1]) === entry) {
  try {
    let input = '';
    for await (const chunk of process.stdin) {
      input += chunk;
      if (Buffer.byteLength(input) > 16384) throw new Error('Input limit');
    }
    const request = JSON.parse(input);
    if (!request || Object.keys(request).sort().join(',') !== 'brain,caller,params' ||
      typeof request.brain !== 'string' || !path.isAbsolute(request.brain)) throw new Error('Invalid transaction');
    process.stdout.write(JSON.stringify(await commitConfinedFact(request.brain, request.params, request.caller)));
  } catch (err) {
    if (err.result) process.stdout.write(JSON.stringify(err.result));
    process.stderr.write('Fact transaction did not complete.');
    process.exitCode = 1;
  }
}
