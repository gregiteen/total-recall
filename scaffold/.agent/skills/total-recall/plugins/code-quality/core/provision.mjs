/**
 * Runs when Total Recall creates or ensures a project brain (`init --project`,
 * `brain ensure`, `plugin create`), so a new repository has gates from the start.
 * Declared as `runtime.modules["project-provision"]` in plugin.json.
 */
import { ensureGates } from './ensure.mjs';

const VERB = { created: 'gates set up', imported: 'gate list recorded', rebuilt: 'gate list rebuilt', none: 'gates already configured' };

export async function provisionProject({ projectRoot, dryRun = false } = {}) {
  const result = await ensureGates(projectRoot, { dryRun });
  const ok = !['invalid', 'no-brain'].includes(result.state);
  return {
    ok,
    state: result.state,
    action: result.action,
    summary: ok
      ? `${VERB[result.action] || result.state}${result.gates.length ? ` (${result.gates.join(', ')})` : ''}`
      : (result.error || result.state),
  };
}
