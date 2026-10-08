/** Package instruction skills for Codex's plugin host, never a brain's state. */
import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { discoverRepoSkills } from '../skill-projection.mjs';

export function packageCodexSkills({ repo, output, name, skills: selected }) {
  if (!/^[a-z][a-z0-9-]{1,63}$/.test(name || '')) throw new Error('Use a kebab-case plugin name.');
  repo = path.resolve(repo);
  output = path.resolve(output);
  if (fs.existsSync(output)) throw new Error('Output already exists; existing packages are preserved.');
  const skills = discoverRepoSkills(path.join(repo, '.agent'))
    .filter(s => !selected || selected.includes(s.name));
  if (!skills.length) throw new Error('No selected skills found.');
  if (selected?.some(n => !skills.some(s => s.name === n))) throw new Error('A requested skill is missing.');
  for (const skill of skills) {
    if (!/^[a-zA-Z0-9_-]+$/.test(skill.name)) throw new Error('Unsafe skill folder name.');
    const source = fs.realpathSync(skill.skillDir);
    const relative = path.relative(source, output);
    if (!relative || (!relative.startsWith('..' + path.sep) && !path.isAbsolute(relative))) {
      throw new Error('Output cannot be inside a source skill.');
    }
  }
  const staging = output + '.tmp-' + process.pid;
  if (fs.existsSync(staging)) throw new Error('Staging path already exists.');
  try {
    for (const skill of skills) {
      const dest = path.join(staging, 'skills', skill.name);
      fs.mkdirSync(dest, { recursive: true });
      // Deliberately package instructions only. Copying a whole skill directory
      // could export memory-vault, credentials, config or derived personal data.
      const sourceFile = path.join(skill.skillDir, 'SKILL.md');
      const source = fs.readFileSync(sourceFile, 'utf8');
      const frontmatter = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      const metadata = frontmatter && parseYaml(frontmatter[1]);
      if (!metadata?.name || !metadata?.description) throw new Error('Skill requires name and description.');
      fs.writeFileSync(path.join(dest, 'SKILL.md'),
        `---\nname: ${JSON.stringify(metadata.name)}\ndescription: ${JSON.stringify(metadata.description)}\n---\n\n` +
        `Read ${JSON.stringify(sourceFile)} completely and follow that skill in its owning repository ` +
        `${JSON.stringify(repo)}. Resolve its relative resources against its original directory. ` +
        'If the owning repository is unavailable, report that prerequisite; do not invent its instructions.\n');
    }
    const manifest = {
      name, version: '0.1.0', description: 'Repository instruction workflows for Codex',
    };
    fs.writeFileSync(path.join(staging, 'plugin.json'), JSON.stringify({
      $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
      ...manifest,
    }, null, 2) + '\n');
    fs.mkdirSync(path.join(staging, '.codex-plugin'));
    fs.writeFileSync(path.join(staging, '.codex-plugin', 'plugin.json'),
      JSON.stringify({ ...manifest, skills: './skills/' }, null, 2) + '\n');
    fs.writeFileSync(path.join(staging, 'README.md'),
      '# Codex instruction package\n\nInstall and enable this package through your host\'s supported plugin source.\n' +
      'Creating these files does not register commands in an existing web chat.\n' +
      'Skills retain their repository file references; use the owning cloud environment.\n' +
      'References, scripts, credentials and memory are intentionally not exported.\n');
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.renameSync(staging, output);
  } catch (error) {
    fs.rmSync(staging, { recursive: true, force: true });
    throw error;
  }
  return { output, name, skills: skills.map(s => s.name), installed: false };
}

export function runCodexPackage(args) {
  const name = args[0];
  const value = flag => { const i = args.indexOf(flag); return i < 0 ? undefined : args[i + 1]; };
  const output = value('--output');
  if (!output) throw new Error('Usage: scaffold codex-plugin <name> --output <new-directory> [--repo <path>] [--skills <comma-separated-names>]');
  const selected = value('--skills');
  const result = packageCodexSkills({ repo: value('--repo') || process.cwd(), output, name,
    skills: selected ? selected.split(',') : undefined });
  console.log(JSON.stringify(result, null, 2));
}
