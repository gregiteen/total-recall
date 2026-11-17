/** Auth-only CLI transport. No ambient credential or alternate-store resolution. */
import { spawnSync } from 'node:child_process';
function invoke(args, { env = process.env, run = spawnSync, input } = {}) {
  const binary = env.TOTAL_RECALL_BIN || 'total-recall';
  const script = binary.endsWith('.mjs');
  const result = run(script ? process.execPath : binary, [...(script ? [binary] : []), 'auth', 'secret', ...args], {
    env, input, encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024,
  });
  if (result.error || result.status !== 0) throw new Error('Auth credential operation failed; unlock and check the selected auth store');
  return result.stdout;
}
export function readAuthSecret(key, options = {}) {
  if (!/^[A-Z][A-Z0-9_]*$/.test(key)) throw new Error('Invalid credential reference');
  let result;
  try { result = JSON.parse(invoke(['get', key, '--json'], options)); }
  catch (error) { throw new Error('Auth credential read failed', { cause: error }); }
  if (result?.found === false) return '';
  if (result?.found !== true || typeof result.value !== 'string') throw new Error('Invalid auth credential response');
  return result.value;
}
export function writeAuthSecret(key, value, options = {}) {
  if (!/^[A-Z][A-Z0-9_]*$/.test(key) || typeof value !== 'string' || !value) throw new Error('Credential reference and value required');
  invoke(['set', key, '--stdin'], { ...options, input: value });
  if (readAuthSecret(key, options) !== value) throw new Error('Auth credential readback failed');
  return { saved: true, secretKey: key };
}
