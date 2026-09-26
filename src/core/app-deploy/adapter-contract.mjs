/**
 * Shared conformance boundary for app deployment adapters.
 *
 * An adapter owns the target runtime, but every adapter must prove the same
 * lifecycle against an isolated app. This runner intentionally uses the SSSS
 * package's canonical operation fixture rather than a Total Recall-only record.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

export const ADAPTER_CONTRACT_VERSION = '1.0.0';
export const ADAPTER_METHODS = Object.freeze([
  'detect',
  'generate',
  'executeSsss',
  'rebuildProjection',
  'start',
  'cleanup'
]);

export function assertAdapterContract(adapter) {
  if (!adapter || typeof adapter !== 'object' || !/^[a-z][a-z0-9-]*$/.test(adapter.id || '')) {
    throw new TypeError('Adapter must have a safe, lowercase id');
  }
  for (const method of ADAPTER_METHODS) {
    if (typeof adapter[method] !== 'function') {
      throw new TypeError(`Adapter '${adapter.id}' must implement ${method}()`);
    }
  }
  return adapter;
}

function fail(stage, message) {
  throw new Error(`Adapter contract ${stage}: ${message}`);
}

function digest(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function inside(parent, child) {
  const relative = path.relative(parent, child);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function snapshot(dir) {
  const entries = [];
  function walk(current, prefix = '') {
    for (const item of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const relative = path.posix.join(prefix, item.name);
      const absolute = path.join(current, item.name);
      const stat = fs.lstatSync(absolute);
      if (stat.isSymbolicLink()) fail('generation', `symlink '${relative}' is not portable`);
      if (stat.isDirectory()) walk(absolute, relative);
      else if (stat.isFile()) entries.push([relative, digest(absolute)]);
      else fail('generation', `unsupported file '${relative}'`);
    }
  }
  walk(dir);
  return entries;
}

/**
 * Run the same lifecycle proof for each declared adapter. The caller supplies
 * a canonical SSSS operation fixture with request and expected_response.
 * Adapter methods receive an isolated target and never the operator's vault.
 */
export async function runAdapterContractFixtures(adapter, operationFixture) {
  assertAdapterContract(adapter);
  if (!operationFixture?.request || operationFixture.expected_response?.success !== true) {
    throw new TypeError('A successful canonical SSSS operation fixture is required');
  }

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-adapter-contract-'));
  const target = path.join(root, 'app');
  const first = path.join(root, 'generated-a');
  const second = path.join(root, 'generated-b');
  const vault = path.join(target, 'vault');
  const privateFile = path.join(vault, 'tenant-private.txt');
  let runtime;
  try {
    fs.mkdirSync(vault, { recursive: true });
    fs.mkdirSync(first);
    fs.mkdirSync(second);
    fs.writeFileSync(privateFile, 'private user data\n');
    fs.writeFileSync(path.join(target, 'package.json'), JSON.stringify({
      name: 'adapter-contract-app',
      version: '0.0.0',
      type: 'module',
      ssss: { adapter: adapter.id }
    }));

    const targetBefore = snapshot(target);
    const detection = await adapter.detect(target);
    if (detection?.supported !== true || detection.adapter !== adapter.id) {
      fail('detection', `expected a compatible '${adapter.id}' target`);
    }
    if (JSON.stringify(snapshot(target)) !== JSON.stringify(targetBefore)) {
      fail('detection', 'target detection changed the app');
    }

    await adapter.generate({ target, output: first });
    await adapter.generate({ target, output: second });
    const generated = snapshot(first);
    if (generated.length === 0 || JSON.stringify(generated) !== JSON.stringify(snapshot(second))) {
      fail('generation', 'source output must be nonempty and deterministic');
    }
    if (JSON.stringify(snapshot(target)) !== JSON.stringify(targetBefore)) {
      fail('generation', 'planning/generation changed the target app');
    }

    const request = structuredClone(operationFixture.request);
    const denied = await adapter.executeSsss(request, { target, principal: null });
    if (denied?.success !== false) fail('kernel bridge', 'missing verified principal was accepted');

    const accepted = await adapter.executeSsss(request, {
      target,
      principal: { id: 'fixture-admin', role: 'system', verified: true }
    });
    if (accepted?.success !== true || accepted?.validation?.valid !== true) {
      fail('kernel bridge', `canonical operation failed: ${JSON.stringify(accepted?.validation?.errors || [])}`);
    }
    const document = path.join(vault, request.path);
    if (!fs.existsSync(document)) fail('kernel bridge', 'canonical document was not committed to the app vault');
    const canonicalHash = digest(document);
    const replay = await adapter.executeSsss(request, {
      target,
      principal: { id: 'fixture-admin', role: 'system', verified: true }
    });
    if (replay?.success !== true || replay?.replay !== true || digest(document) !== canonicalHash) {
      fail('kernel bridge', 'same operation did not replay idempotently');
    }
    const escape = { ...request, idempotency_key: `${request.idempotency_key}-escape`, path: '../outside.md' };
    const escaped = await adapter.executeSsss(escape, {
      target,
      principal: { id: 'fixture-admin', role: 'system', verified: true }
    });
    if (escaped?.success !== false || fs.existsSync(path.join(target, 'outside.md'))) {
      fail('kernel bridge', 'path escape was accepted');
    }

    const projection = await adapter.rebuildProjection({ target });
    const projectionPath = projection?.path && path.resolve(projection.path);
    if (!projectionPath || !inside(target, projectionPath) || inside(vault, projectionPath)
        || !fs.existsSync(projectionPath) || !fs.lstatSync(projectionPath).isFile()
        || !inside(fs.realpathSync(target), fs.realpathSync(projectionPath))) {
      fail('projection', 'rebuild must produce a regular file inside the app and outside its vault');
    }
    const projectionHash = digest(projectionPath);
    fs.unlinkSync(projectionPath);
    await adapter.rebuildProjection({ target });
    if (!fs.existsSync(projectionPath) || digest(projectionPath) !== projectionHash || digest(document) !== canonicalHash) {
      fail('projection', 'rebuild is nondeterministic or changed canonical state');
    }

    runtime = await adapter.start({ target });
    if (!runtime || typeof runtime.health !== 'function' || typeof runtime.stop !== 'function') {
      fail('runtime', 'start must return health() and stop()');
    }
    const health = await runtime.health();
    if (health?.status !== 'healthy') fail('runtime', 'health check did not report healthy');
    await runtime.stop();
    runtime = null;

    await adapter.cleanup({ target, generated: [first, second] });
    if (fs.readFileSync(privateFile, 'utf8') !== 'private user data\n' || digest(document) !== canonicalHash) {
      fail('cleanup', 'tenant-private or canonical app data changed');
    }
    return { valid: true, adapter: adapter.id, contract_version: ADAPTER_CONTRACT_VERSION };
  } finally {
    if (runtime?.stop) await runtime.stop();
    fs.rmSync(root, { recursive: true, force: true });
  }
}
