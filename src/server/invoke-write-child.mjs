/** Structured trusted mutation entrypoint. Never accepts executable code. */
import { createConfinedFact } from '../core/confined-memory.mjs';

try {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
    if (Buffer.byteLength(input) > 16384) throw new Error('Input limit');
  }
  const { brain, params, caller } = JSON.parse(input);
  try { process.stdout.write(JSON.stringify(await createConfinedFact(brain, params, caller))); }
  catch (err) {
    if (err.result) process.stdout.write(JSON.stringify(err.result));
    throw err;
  }
} catch {
  process.stderr.write('Confined fact creation did not complete; check committed/indexed status before retry.');
  process.exitCode = 1;
}
