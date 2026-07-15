import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import matter from 'gray-matter';

const globalVault = '/Users/greg/.agent/skills/total-recall/memory-vault';
const globalSessions = '/Users/greg/.agent/skills/total-recall/sessions';
const githubDir = '/Users/greg/Github';

const projectVaults = {};

function getProjectVault(project) {
  if (!projectVaults[project]) {
    const p = path.join(githubDir, project, '.agent/skills/total-recall/memory-vault');
    projectVaults[project] = p;
  }
  return projectVaults[project];
}

// 1. Move everything I just moved back to global first
const totalRecallVault = getProjectVault('total-recall');
console.log('Restoring to global vault...');
const files = execSync(`grep -rl "Self-captured memory:" ${totalRecallVault} || true`, { encoding: 'utf-8' }).trim().split('\n').filter(Boolean);
let restoredCount = 0;
for (const file of files) {
  const relativePath = path.relative(totalRecallVault, file);
  const targetPath = path.join(globalVault, relativePath);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.renameSync(file, targetPath);
  restoredCount++;
}
console.log('Restored', restoredCount, 'files.');

// 2. Now process the global brain and distribute EVERYTHING based on session_id
console.log('Distributing from global vault...');

// Find all .md files in global vault
function walkDir(dir, callback) {
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walkDir(p, callback);
    else if (p.endsWith('.md')) callback(p);
  }
}

const sessionCache = {};
let movedCount = 0;

walkDir(globalVault, (file) => {
  let content;
  try {
    content = fs.readFileSync(file, 'utf8');
  } catch { return; }
  
  // Fix the \n issue on the fly
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (frontmatterMatch && frontmatterMatch[1].includes('\\n')) {
     const fm = frontmatterMatch[1].replace(/\\n/g, '\n');
     content = content.replace(frontmatterMatch[1], fm);
     fs.writeFileSync(file, content, 'utf8');
  }

  let parsed;
  try {
    parsed = matter(content);
  } catch { return; }

  const source = parsed.data.source;
  if (source && source.session_id) {
    const sessionId = source.session_id.replace(/^session:\/\//, '');
    if (!sessionCache[sessionId]) {
      const sessionFile = path.join(globalSessions, sessionId + '.md');
      if (fs.existsSync(sessionFile)) {
        try {
           // Also fix \n for session files
           let sessContent = fs.readFileSync(sessionFile, 'utf8');
           const sessMatch = sessContent.match(/^---\n([\s\S]*?)\n---/);
           if (sessMatch && sessMatch[1].includes('\\n')) {
              sessContent = sessContent.replace(sessMatch[1], sessMatch[1].replace(/\\n/g, '\n'));
           }
           const sessParsed = matter(sessContent);
           sessionCache[sessionId] = sessParsed.data.project || 'global';
        } catch {
           sessionCache[sessionId] = 'global';
        }
      } else {
        sessionCache[sessionId] = 'global';
      }
    }
    
    const project = sessionCache[sessionId];
    if (project && project !== 'global') {
      const projVault = getProjectVault(project);
      const relativePath = path.relative(globalVault, file);
      const projPath = path.join(projVault, relativePath);
      
      fs.mkdirSync(path.dirname(projPath), { recursive: true });
      fs.renameSync(file, projPath);
      movedCount++;
    }
  }
});

console.log(`Distributed ${movedCount} nodes to their rightful project brains!`);
