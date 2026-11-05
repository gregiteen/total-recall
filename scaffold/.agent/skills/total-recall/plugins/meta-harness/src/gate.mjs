/** Run the repository's own quality gates through the code-quality plugin. No configured gate is not a pass. */
import { runProcess } from './worker.mjs';

const run = async (binary, args, { cwd, timeoutMs }) => {
  // Asynchronous, so a gate never stalls another agent in the same run, and stoppable with the run.
  const result = await runProcess(binary, args, { cwd, timeoutMs, env: process.env, maxBytes: 16 * 1024 * 1024 });
  return { status: result.exitCode, stdout: result.stdout, stderr: result.stderr, error: result.reason ? new Error(result.reason) : undefined };
};

export async function runQualityGate(directory, { tier = 'fast', runner = run, timeoutMs = 600000 } = {}) {
  const result = await runner(process.env.TOTAL_RECALL_BIN || 'total-recall', ['code-quality-check', '--tier', tier, '--json'], { cwd: directory, timeoutMs });
  const output = `${result.stdout || ''}\n${result.stderr || ''}`.trim();
  if (result.error || result.status === null) return { status: 'unavailable', passed: false, tier, summary: `The gate did not run: ${result.error?.message || 'terminated'}` };
  let report = null;
  try { report = JSON.parse(result.stdout); } catch { /* a text report */ }
  if (/No code-quality state|No checks at tier/.test(output)) return { status: 'unconfigured', passed: false, tier, summary: String(report?.error || output).slice(0, 500) };
  return { status: result.status === 0 ? 'passed' : 'failed', passed: result.status === 0, tier, summary: output.slice(-2000), report };
}
