/** Full developer adapter: provider/credential work lives in a cancellable group. */
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Keep dependency diagnostics out of the structured result pipe. The parent
// never returns diagnostics, including those emitted by installed owner code.
console.log = console.info = console.debug = (...args) => console.error(...args);

try {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
    if (Buffer.byteLength(input) > 32768) throw new Error('Input limit');
  }
  const { operation, params, brain, timeoutMs } = JSON.parse(input);
  if (!['decision.run', 'decision.predict'].includes(operation)) throw new Error('Unknown operation');
  const plugin = path.join(brain, 'plugins/decision');
  const client = await import(pathToFileURL(path.join(plugin, 'src/client.mjs')).href);
  const auth = await import(pathToFileURL(path.join(plugin, 'auth-client.mjs')).href);
  const apiKey = auth.readAuthSecret('OPENROUTER_API_KEY');
  if (!apiKey) {
    process.stdout.write(JSON.stringify({ ok: false, error: 'credential-unavailable' }));
  } else {
    let result;
    if (operation === 'decision.run') {
      const d = await client.requestDecision({ apiKey, model: params.model || client.DEFAULT_MODEL,
        endpoint: client.DEFAULT_ENDPOINT, timeoutMs, state: params.state || {}, questions: params.questions });
      if (d) {
        const answers = Object.fromEntries(Object.entries(params.questions).map(([key, question]) => [key,
          question?.type === 'noul' ? d.noul(key) : question?.type === 'score' ? d.score(key) : d.choice(key)]));
        result = { answered: true, answers, model: d.modelVersion, cost_usd: d.cost, latency_ms: d.latencyMs };
      }
    } else {
      const { predictNextAction } = await import('../core/action-predictor.mjs');
      result = await predictNextAction(params.intent || '', {
        state: params.state || {}, apiKey, requestDecision: client.requestDecision,
        derivedDir: path.join(brain, 'memory-derived'), projectRoot: process.cwd(),
        model: client.DEFAULT_MODEL, endpoint: client.DEFAULT_ENDPOINT, timeoutMs,
        limit: Math.max(5, Math.min(40, Number(params.limit) || 20)),
      });
      if (result?.ok === false && result.reason === 'no-decision') result = null;
    }
    process.stdout.write(JSON.stringify(result ? { ok: true, result } : { ok: false, error: 'provider-failed' }));
  }
} catch {
  // Exception text can contain provider payloads, credentials or private paths.
  process.stdout.write(JSON.stringify({ ok: false, error: 'decision-failed' }));
  process.exitCode = 1;
}
