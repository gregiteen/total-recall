import { getPluginById, projectPluginsDir } from '../../core/plugin-loader.mjs';
import { readPluginConnection } from '../../core/plugin-connections.mjs';
import { detectProjectBrain } from '../../core/brain-locate.mjs';
import { resolvePluginBrainTargets } from '../../server/plugin-brain-targets.mjs';
import path from 'node:path';

const USAGE = 'Usage: total-recall plugin connection <id> [--brain <global|project:ID>] [--json]';
const METHODS = { 'api-key': 'API key', oauth: 'OAuth', 'dashboard-session': 'Dashboard session', none: 'None', unknown: 'Unknown' };

/**
 * One owner-reported connection, read from cached evidence only. For the same explicit --brain it prints the
 * report GET /api/plugins/:id/connection serves. Without --brain the scope is explicit rather than inferred from
 * a path: the project brain of the working directory when one exists there, otherwise the global brain.
 */
export async function runPluginConnection(args = []) {
  if (args.includes('--help') || args.includes('-h')) { console.log(USAGE); return; }
  const json = args.includes('--json');
  const at = args.indexOf('--brain');
  const brain = at === -1 ? undefined : args[at + 1];
  const positional = args.filter((arg, index) => !arg.startsWith('-') && args[index - 1] !== '--brain');
  const unknown = args.find(arg => arg.startsWith('-') && !['--json', '--brain'].includes(arg));
  if (positional.length !== 1 || unknown || (at !== -1 && (!brain || brain.startsWith('-')))) {
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }
  try {
    // The CLI is the local operator, which the shared resolver treats as a dashboard session.
    const projectRoot = brain === undefined ? detectProjectBrain(process.cwd())?.projectRoot : undefined;
    const target = projectRoot
      ? { brainId: 'project', brainDir: path.dirname(projectPluginsDir(projectRoot)), projectRoot }
      : resolvePluginBrainTargets([brain ?? 'global'], { type: 'dashboard_session' })[0];
    const plugin = getPluginById(positional[0], target.projectRoot);
    if (!plugin) throw Object.assign(new Error('Plugin unavailable'), { status: 404 });
    const report = await readPluginConnection(plugin, target);
    if (json) { console.log(JSON.stringify(report)); return; }
    if (!report.reported) { console.log(`${report.pluginId}: unreported. ${report.message}`); return; }
    console.log(`${report.pluginId}: ${report.status}${report.lastStatus ? ` (last ${report.lastStatus})` : ''}`);
    console.log(`  Brain:          ${target.brainId === 'global' ? 'global' : target.brainId}`);
    console.log(`  Authentication: ${METHODS[report.method]}`);
    console.log(`  Last checked:   ${report.checkedAt ?? 'never'}`);
    if (report.failure) console.log(`  Failure:        ${report.failure.message}`);
  } catch (error) {
    // Registry and authorization messages are already curated; never print a stack or owner text.
    console.error(error.status ? error.message : 'Could not read the plugin connection.');
    process.exitCode = 1;
  }
}
