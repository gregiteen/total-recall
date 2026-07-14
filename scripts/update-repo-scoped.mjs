import fs from 'fs';
import path from 'path';
import os from 'os';
import matter from 'gray-matter';

// Assuming running from total-recall root
const brainDir = path.join(os.homedir(), '.gemini', 'config');
const knownRootsPath = path.join(brainDir, 'known-roots.json');

let repos = [process.cwd()];
if (fs.existsSync(knownRootsPath)) {
  try { repos = [...new Set([...repos, ...JSON.parse(fs.readFileSync(knownRootsPath, 'utf8'))])]; } catch {}
}

console.log('Scanning repos for local skills...');
let updated = 0;

for (const repo of repos) {
  const skillsDir = path.join(repo, '.agent', 'skills');
  if (!fs.existsSync(skillsDir)) continue;

  for (const name of fs.readdirSync(skillsDir)) {
    const skillPath = path.join(skillsDir, name, 'SKILL.md');
    if (!fs.existsSync(skillPath)) continue;

    try {
      const raw = fs.readFileSync(skillPath, 'utf8');
      const parsed = matter(raw);
      
      // If repo_scoped is already set, skip
      if (parsed.data.repo_scoped !== undefined) continue;

      // Only update if it's NOT a known global skill
      // (You can whitelist global skills here if needed)
      
      parsed.data.repo_scoped = true;
      const updatedContent = matter.stringify(parsed.content, parsed.data);
      fs.writeFileSync(skillPath, updatedContent, 'utf8');
      console.log(`Updated: ${repo}/.agent/skills/${name}/SKILL.md`);
      updated++;
    } catch (e) {
      console.error(`Failed to update ${skillPath}:`, e.message);
    }
  }
}

console.log(`\nFinished! Updated ${updated} skills to be repo_scoped: true.`);
