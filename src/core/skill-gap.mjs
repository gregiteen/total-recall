import { discoverPlugins } from './plugin-loader.mjs';
import { runPluginCommand } from './plugin-runner.mjs';

/** Skill engineering belongs to skill-manager. Missing operations fail closed. */
export async function requestSkillGap(topic, evidence, { projectRoot = process.cwd(), discover = discoverPlugins, run = runPluginCommand } = {}) {
  if (typeof topic !== 'string' || !topic.trim() || typeof evidence !== 'string' || !evidence.trim()) {
    throw new Error('Skill gap requires a topic and an evidence reference');
  }
  const plugin = discover(projectRoot).find(item => item.id === 'skill-manager' && item.valid);
  if (!plugin?.manifest.cli?.subcommands?.some(item => item.name === 'gap')) {
    throw new Error('Skill-manager gap is unavailable. Install an owner version that provides: total-recall skill-manager gap "<topic>" --evidence <ref>');
  }
  const result = await run(plugin, { subcommand: 'gap', args: [topic.trim(), '--evidence', evidence], cwd: projectRoot });
  if (!result.ok || result.truncated) throw new Error(`Skill-manager gap failed: ${result.stderr || result.output || result.exitCode}`);
  return { success: true, output: result.stdout || result.output, executor: 'skill-manager' };
}
