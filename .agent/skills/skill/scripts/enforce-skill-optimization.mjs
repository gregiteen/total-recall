import fs from 'fs';
import path from 'path';

const SKILLS_DIR = path.join(process.cwd(), '.agent/skills');

function checkSkills() {
  const dirs = fs.readdirSync(SKILLS_DIR).filter(d => {
    return fs.statSync(path.join(SKILLS_DIR, d)).isDirectory();
  });

  let allValid = true;

  for (const dir of dirs) {
    const skillPath = path.join(SKILLS_DIR, dir);
    const requiredDirs = ['subagents', 'hooks', 'scripts', 'evals', 'references'];
    
    // Check required directories
    for (const reqDir of requiredDirs) {
      const p = path.join(skillPath, reqDir);
      if (!fs.existsSync(p)) {
        console.error(`❌ [FAILURE] Skill '${dir}' is missing required directory: ${reqDir}/`);
        allValid = false;
        continue;
      }
      
      // Ensure the directory is not empty
      const contents = fs.readdirSync(p);
      if (contents.length === 0 || (contents.length === 1 && contents[0] === '.gitkeep')) {
        console.error(`❌ [FAILURE] Skill '${dir}' has an empty or stubbed directory: ${reqDir}/. Must contain real implementation.`);
        allValid = false;
      }
    }

    // Check evals.json
    const evalsPath = path.join(skillPath, 'evals', 'evals.json');
    if (fs.existsSync(evalsPath)) {
      try {
        const evals = JSON.parse(fs.readFileSync(evalsPath, 'utf8'));
        if (!Array.isArray(evals) || evals.length < 3) {
          console.error(`❌ [FAILURE] Skill '${dir}' evals.json has fewer than 3 assertions.`);
          allValid = false;
        }
      } catch (e) {
        console.error(`❌ [FAILURE] Skill '${dir}' evals.json is invalid JSON.`);
        allValid = false;
      }
    }
  }

  if (!allValid) {
    console.error('\n🚨 SKILL OPTIMIZATION ENFORCEMENT FAILED 🚨');
    console.error('All skills must be manually fully optimized with bespoke subagents, hooks, scripts, and evals. No empty directories or stubs allowed.');
    process.exit(1);
  } else {
    console.log('✅ All skills passed the structural optimization enforcement check.');
    process.exit(0);
  }
}

checkSkills();
