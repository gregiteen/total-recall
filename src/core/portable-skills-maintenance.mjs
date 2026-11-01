/** Existing daemon maintenance verifies explicitly enrolled owner skill packages. */
import fs from 'node:fs';
import path from 'node:path';
import { loadRegistry } from './skills-registry.mjs';
import { runBounded } from './startup-health.mjs';

export async function maintainPortableSkills({ brainDir, apply = true, run = runBounded } = {}) {
  const entry = loadRegistry(brainDir).skills.ssss;
  if (!entry || !entry.layered || entry.source_type !== 'portable-owner-package') return { skipped: true, reason: 'no-enrolled-portable-source', failed: 0, results: [] };
  const script = path.join(entry.source_path, 'core/scripts/maintain.mjs');
  if (!fs.existsSync(script)) return { failed: 1, results: [], error: 'Registered portable source maintenance helper is missing' };
  const result = await run(process.execPath, [script, '--source', entry.source_path, ...(apply ? ['--apply'] : [])], { timeoutMs: 5 * 60 * 1000, maxBytes: 8 * 1024 * 1024 });
  try {
    const report = JSON.parse(result.output);
    return { ...report, failed: Math.max(report.failed || 0, result.code === 0 ? 0 : 1) };
  } catch {
    return { failed: 1, results: [], error: result.reason || result.output || 'Portable skill verification returned no report' };
  }
}
