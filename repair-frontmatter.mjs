import fs from 'fs';
import path from 'path';

function walkDir(dir, callback) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walkDir(p, callback);
    else if (p.endsWith('.md')) callback(p);
  }
}

let fixedCount = 0;
walkDir('.agent/skills/total-recall/memory-vault', (p) => {
  let content = fs.readFileSync(p, 'utf8');
  if (content.includes('\\n')) {
    // Only replace \n in the frontmatter block
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (frontmatterMatch) {
      let fm = frontmatterMatch[1];
      if (fm.includes('\\n')) {
         fm = fm.replace(/\\n/g, '\n');
         content = content.replace(frontmatterMatch[1], fm);
         fs.writeFileSync(p, content, 'utf8');
         fixedCount++;
      }
    }
  }
});
console.log('Fixed', fixedCount, 'files with corrupted frontmatter.');
