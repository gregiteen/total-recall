/** Run the repository's own quality gates through the code-quality plugin. No configured gate is not a pass. */
import { spawnSync } from 'node:child_process';

export function runQualityGate(directory, { tier = 'fast', runner = spawnSync, timeoutMs = 600000 } = {}) {
  const result = runner(process.env.TOTAL_RECALL_BIN || 'total-recall', ['code-quality-check', '--tier', tier, '--json'], { cwd: directory, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 });
  const output = `${result.stdout || ''}\n${result.stderr || ''}`.trim();
  if (result.error || result.status === null) return { status: 'unavailable', passed: false, tier, summary: `The gate did not run: ${result.error?.message || 'terminated'}` };
  let report = null;
  try { report = JSON.parse(result.stdout); } catch { /* a text report */ }
  if (/No code-quality state/.test(report?.error || output)) return { status: 'unconfigured', passed: false, tier, summary: String(report?.error || output).slice(0, 500) };
  return { status: result.status === 0 ? 'passed' : 'failed', passed: result.status === 0, tier, summary: output.slice(-2000), report };
}
