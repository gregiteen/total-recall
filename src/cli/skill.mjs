import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// Helper to resolve agent directories dynamically
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../');
const agentDir = path.join(ROOT, '.agent');
const skillsDir = path.join(agentDir, 'skills');

// Direct dynamic imports for scripts layer to preserve environment paths
const scriptsPath = path.join(agentDir, 'skills', 'total-recall', 'skills', 'skill', 'scripts');

function printHelp() {
  console.log(`
  total-recall skill — Sovereign AI Capability Registry & Manager

  Usage: total-recall skill <command> [options]

  Commands:
    find <query>          Search skills.sh registry sorted by absolute installs rating
    install <package>     Download/load a skill, run static security audit, and compile shims (alias: load, add)
    create <name>         Scaffold a new SSSS-compliant skill folder structure (alias: new)
    edit <name>           Open the local skill's SKILL.md file in your preferred editor
    scan <name>           Run security audit scan on an installed local skill directory
    list                  List all locally active parent skills and nested sub-skills (alias: ls)
    remove <name>         Safely delete a skill package and hot-recompile shims (alias: rm)

  Options:
    --help, -h            Show this help menu
  
  Examples:
    npx total-recall skill find git
    npx total-recall skill load github/awesome-copilot@prd
    npx total-recall skill create my-awesome-skill
    npx total-recall skill edit my-awesome-skill
    npx total-recall skill scan total-recall
`);
}

export default async function skillCli(args) {
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printHelp();
    return;
  }

  const command = args[0];

  if (command === 'find') {
    const query = args[1];
    if (!query) {
      console.error('❌ You must provide a search query.');
      console.error('Usage: npx total-recall skill find <query>');
      process.exit(1);
    }

    try {
      const { searchAndSort } = await import('../../.agent/skills/total-recall/skills/skill/scripts/find-skills.mjs');
      const results = searchAndSort(query);
      
      if (results.length === 0) {
        console.log('\nℹ️  No matching skills found on skills.sh.');
        return;
      }

      console.log('\n✨ --- SKILLS.SH REGISTRY SEARCH RESULTS (Sorted by Installs) --- ✨\n');
      
      const nameHeader = 'SKILL PACKAGE';
      const installsHeader = 'INSTALLS';
      const urlHeader = 'REGISTRY URL';
      
      let maxNameLen = nameHeader.length;
      let maxInstallsLen = installsHeader.length;

      for (const r of results) {
        if (r.name.length > maxNameLen) maxNameLen = r.name.length;
        if (r.installsStr.length > maxInstallsLen) maxInstallsLen = r.installsStr.length;
      }

      const divider = '-'.repeat(maxNameLen + maxInstallsLen + 35);
      console.log(divider);
      console.log(
        `${nameHeader.padEnd(maxNameLen)}   | ${installsHeader.padEnd(maxInstallsLen)}   | ${urlHeader}`
      );
      console.log(divider);

      for (const r of results) {
        console.log(
          `${r.name.padEnd(maxNameLen)}   | ${r.installsStr.padEnd(maxInstallsLen)}   | ${r.url}`
        );
      }

      console.log(divider);
      console.log(`💡 Tip: To install any skill, run: npx total-recall skill install <package-name>\n`);
    } catch (err) {
      console.error('❌ Error executing search:', err.message);
      process.exit(1);
    }
  } 
  
  else if (command === 'install' || command === 'add' || command === 'load') {
    const pkg = args[1];
    if (!pkg) {
      console.error('❌ You must provide a skill package to load.');
      console.error('Usage: npx total-recall skill load <owner/repo@skill>');
      process.exit(1);
    }

    try {
      const { installSkill } = await import('../../.agent/skills/total-recall/skills/skill/scripts/install-skill.mjs');
      const res = installSkill(pkg);
      if (!res.success) {
        process.exit(1);
      }
    } catch (err) {
      console.error('❌ Loading skill failed:', err.message);
      process.exit(1);
    }
  } 
  
  else if (command === 'scan') {
    const target = args[1];
    if (!target) {
      console.error('❌ You must specify a local skill directory to scan.');
      console.error('Usage: npx total-recall skill scan <skill-name>');
      process.exit(1);
    }

    const targetDir = path.resolve(skillsDir, target);

    try {
      const { runScan } = await import('../../.agent/skills/total-recall/skills/skill/scripts/scan-skill.mjs');
      const result = runScan(targetDir);
      process.exit(result.success ? 0 : 1);
    } catch (err) {
      console.error('❌ Audit execution failed:', err.message);
      process.exit(1);
    }
  } 
  
  else if (command === 'list' || command === 'ls') {
    if (!fs.existsSync(skillsDir)) {
      console.log('No skills registry directory initialized yet.');
      return;
    }

    const dirs = fs.readdirSync(skillsDir).filter(d => 
      fs.statSync(path.join(skillsDir, d)).isDirectory()
    );

    if (dirs.length === 0) {
      console.log('No installed skills found in the active brain.');
      return;
    }

    console.log('\n📦 Installed Sovereign Skills:');
    console.log('------------------------------------------------------------');
    for (const d of dirs) {
      const skillPath = path.join(skillsDir, d);
      const subSkillsPath = path.join(skillPath, 'skills');
      let subSkills = [];

      if (fs.existsSync(subSkillsPath) && fs.statSync(subSkillsPath).isDirectory()) {
        subSkills = fs.readdirSync(subSkillsPath).filter(sd => 
          fs.statSync(path.join(subSkillsPath, sd)).isDirectory()
        );
      }

      console.log(` • ${d.padEnd(20)} [Universal Skill Package]`);
      if (subSkills.length > 0) {
        console.log(`   └ Sub-skills: ${subSkills.map(s => `🧩 ${s}`).join(', ')}`);
      }
    }
    console.log('------------------------------------------------------------\n');
  } 
  
  else if (command === 'remove' || command === 'rm') {
    const target = args[1];
    if (!target) {
      console.error('❌ You must specify a skill name to remove.');
      console.error('Usage: npx total-recall skill remove <skill-name>');
      process.exit(1);
    }

    const targetDir = path.join(skillsDir, target);
    if (!fs.existsSync(targetDir)) {
      console.error(`❌ Skill "${target}" not found at ${targetDir}`);
      process.exit(1);
    }

    console.log(`🗑️  Removing skill "${target}"...`);
    fs.rmSync(targetDir, { recursive: true, force: true });
    console.log('✅ Skill files deleted successfully.');

    // Hot-recompile shims to strip the removed rules
    console.log('🔄 Hot-recompiling active shims to reflect changes...');
    const child = spawnSync('npx', ['total-recall', 'compile'], { 
      encoding: 'utf8',
      cwd: ROOT
    });

    if (child.error || child.status !== 0) {
      console.warn('⚠️  Shim hot-recompilation returned warning.');
    } else {
      console.log('🚀 Hot-recompilation successful. Skill is fully offline.');
    }
  } 
  
  else if (command === 'create' || command === 'new') {
    const target = args[1];
    if (!target) {
      console.error('❌ You must specify a skill name to create.');
      console.error('Usage: npx total-recall skill create <skill-name>');
      process.exit(1);
    }

    if (!/^[a-z][a-z0-9-]{1,63}$/.test(target)) {
      console.error('❌ Invalid skill name. Must be lowercase kebab-case (e.g. my-awesome-skill).');
      process.exit(1);
    }

    const newSkillDir = path.join(skillsDir, target);
    if (fs.existsSync(newSkillDir)) {
      console.error(`❌ Skill directory already exists: ${newSkillDir}`);
      process.exit(1);
    }

    console.log(`📁 Scaffolding skill folder structure for "${target}"...`);
    fs.mkdirSync(newSkillDir, { recursive: true });
    
    const folders = ['scripts', 'references', 'evals', 'subagents'];
    for (const f of folders) {
      fs.mkdirSync(path.join(newSkillDir, f), { recursive: true });
      fs.writeFileSync(path.join(newSkillDir, f, '.gitkeep'), '', 'utf8');
    }

    // Write template SKILL.md
    const skillMdContent = `---
type: skill
name: ${target}
description: "Use this skill when [TRIGGER CONDITION]. MANDATORY: You MUST read the full SKILL.md file before executing."
schema_version: 2
---

# ${target.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')} Skill

Provide a high-level explanation of the skill's capabilities and context.

## Core Directives

1. Step-by-step procedural instruction
2. Concrete action rule
3. Pitfalls to avoid

## References

* Core specifications or API documentation
`;
    fs.writeFileSync(path.join(newSkillDir, 'SKILL.md'), skillMdContent, 'utf8');

    // Write template evals.json
    const evalsJsonContent = [
      {
        "name": "frontmatter-has-name",
        "assertion": "SKILL.md YAML frontmatter contains a 'name' field",
        "severity": "error"
      },
      {
        "name": "description-is-trigger-optimized",
        "assertion": "description field starts with 'Use this skill when'",
        "severity": "warning"
      },
      {
        "name": "no-empty-directories",
        "assertion": "All required directories contain at least one non-.gitkeep file",
        "severity": "error"
      }
    ];
    fs.writeFileSync(path.join(newSkillDir, 'evals', 'evals.json'), JSON.stringify(evalsJsonContent, null, 2), 'utf8');

    console.log(`✨ Skill "${target}" successfully created and SSSS-scaffolded!`);
    console.log(`📍 Path: ${newSkillDir}`);
    console.log(`💡 Next steps: edit the SKILL.md and add your automation scripts!`);
  }

  else if (command === 'edit') {
    const target = args[1];
    if (!target) {
      console.error('❌ You must specify a skill name to edit.');
      console.error('Usage: npx total-recall skill edit <skill-name>');
      process.exit(1);
    }

    const skillPath = path.join(skillsDir, target, 'SKILL.md');
    if (!fs.existsSync(skillPath)) {
      console.error(`❌ Skill "${target}" not found at ${skillPath}`);
      process.exit(1);
    }

    const editor = process.env.EDITOR || 'vi';
    console.log(`📝 Opening skill "${target}" in ${editor}...`);
    const { spawnSync: ss } = await import('node:child_process');
    const child = ss(editor, [skillPath], { stdio: 'inherit' });
    process.exit(child.status || 0);
  }

  else {
    console.error(`❌ Unknown skill command: ${command}`);
    printHelp();
    process.exit(1);
  }
}
