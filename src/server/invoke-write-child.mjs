/** Confined projection worker. No canonical write grant or mutation input. */
import { indexConfinedFacts } from '../core/confined-memory.mjs';

try {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
    if (Buffer.byteLength(input) > 16384) throw new Error('Input limit');
  }
  const request = JSON.parse(input);
  if (!request || Object.keys(request).length !== 1 || typeof request.brain !== 'string') throw new Error('Invalid projection');
  process.stdout.write(JSON.stringify(indexConfinedFacts(request.brain)));
} catch {
  process.stderr.write('Local indexing did not complete.');
  process.exitCode = 1;
}
