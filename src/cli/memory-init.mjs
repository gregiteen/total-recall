/** Initialize portable memory without provisioning feature runtimes. */
import fs from 'node:fs';
import path from 'node:path';
import { getGlobalAgentDir } from './agent-dir.mjs';
import { registerProjectBrain, writeBrainIdentity, VAULT_CATEGORIES } from '../core/memory-brain.mjs';

export default async function init(args = []) {
  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage: total-recall init [--project] [--dry-run]\nCreate an empty memory vault and local instruction indexes.');
    return;
  }
  const unknown = args.find(arg => !['--project', '--global', '--dry-run', '--yes', '-y'].includes(arg));
  if (unknown) throw new Error(`Unsupported memory init option: ${unknown}`);
  if (args.includes('--global') && args.includes('--project')) throw new Error('Choose one brain layer');
  const project = args.includes('--project');
  const globalAgentDir = getGlobalAgentDir();
  const agentDir = process.env.AGENT_DIR || (project ? path.join(process.cwd(), '.agent') : globalAgentDir);
  const brainDir = path.join(agentDir, 'skills', 'total-recall');
  if (args.includes('--dry-run')) {
    console.log(`Would initialize ${project ? 'project' : 'global'} memory at ${brainDir}`);
    return;
  }
  for (const relative of ['config', 'plugins', 'memory-derived', ...VAULT_CATEGORIES.map(c => `memory-vault/${c}`)]) {
    fs.mkdirSync(path.join(brainDir, relative), { recursive: true });
  }
  const skillFile = path.join(brainDir, 'SKILL.md');
  if (!fs.existsSync(skillFile)) {
    fs.copyFileSync(new URL('../../templates/memory/SKILL.md', import.meta.url), skillFile);
  }
  const existingIdentity = fs.existsSync(path.join(brainDir, 'config', 'brain.json'));
  writeBrainIdentity(brainDir, { name: existingIdentity ? undefined : project ? path.basename(process.cwd()) : 'global',
    role: project ? 'project' : 'global' });
  if (project) {
    registerProjectBrain(path.join(globalAgentDir, 'skills', 'total-recall'), {
      name: path.basename(process.cwd()), path: process.cwd(), brainDir,
    });
  }
  const { compileSurface } = await import('../core/surface.mjs');
  const stats = await compileSurface({
    vaultDir: path.join(brainDir, 'memory-vault'), skillsDir: path.join(agentDir, 'skills'),
    derivedDir: path.join(brainDir, 'memory-derived'), instructionsFile: path.join(agentDir, 'INSTRUCTIONS.md'),
    projectRoot: project ? process.cwd() : path.dirname(agentDir), semantic: false,
  });
  console.log(`Initialized ${project ? 'project' : 'global'} memory: ${brainDir} (${stats.nodesProcessed} nodes)`);
}
