/** Full-mode owner work shares invoke's process-group and output limits. */
import path from 'node:path';
console.log = console.info = console.debug = (...args) => console.error(...args);

try {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
    if (Buffer.byteLength(input) > 32768) throw new Error('Input limit');
  }
  const { operation, params, brain, registryBrain } = JSON.parse(input);
  // Config and Auth must use the serving brain, not a brain inferred from cwd.
  process.env.AGENT_DIR = path.dirname(path.dirname(brain));
  process.env.TR_SECRETS_BRAIN = brain;
  const { executeCoreOperation } = await import('./invoke-core-operations.mjs');
  const result = await executeCoreOperation(operation, params, { brain, registryBrain });
  process.stdout.write(JSON.stringify({ ok: true, result }));
} catch (err) {
  // Return curated policy codes only. Never return owner exception text.
  const { InvokeError } = await import('./invoke-execution.mjs');
  process.stdout.write(JSON.stringify({ ok: false, error: err instanceof InvokeError ? err.code : 'operation-failed',
    status: err instanceof InvokeError ? err.status : 502 }));
  process.exitCode = 1;
}
