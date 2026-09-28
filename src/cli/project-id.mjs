/**
 * total-recall project-id [--json] | --all
 *
 * Prints this project's stable random-UUID id, creating it on first use.
 * --all gives every registered project an id and reconciles the registry.
 */
import path from 'node:path';
import { detectProjectBrain } from './agent-dir.mjs';
import { getGlobalBrainDir } from './agent-dir.mjs';
import { ensureProjectId, repairProjectIds } from '../core/project-id.mjs';

export default async function projectIdCli(argv = []) {
  const args = argv.filter((a) => a !== 'project-id');
  if (args.includes('--help') || args.includes('-h')) {
    console.log(
      'Usage: total-recall project-id [--json]\n' +
        '       total-recall project-id --all [--json]\n\n' +
        "Prints this repo's random-UUID project id (created on first use, stored in\n" +
        'config/brain.json). --all ensures every registered project has one and syncs the registry.',
    );
    return;
  }
  const json = args.includes('--json');
  if (args.includes('--all')) {
    const r = repairProjectIds(getGlobalBrainDir());
    if (json) console.log(JSON.stringify(r));
    else {
      console.log(`  ${r.total} project(s): ${r.created} id(s) created, ${r.synced} registry row(s) synced, ${r.missing_brain} without a brain on disk`);
    }
    return;
  }
  const project = detectProjectBrain(process.cwd());
  if (!project) {
    console.error(`No project brain found above ${process.cwd()}`);
    process.exit(1);
  }
  const { project_id, created } = ensureProjectId(project.brainDir);
  if (json) {
    console.log(JSON.stringify({ project_id, name: path.basename(project.projectRoot).trim(), created, path: project.projectRoot }));
  } else {
    console.log(project_id);
  }
}
