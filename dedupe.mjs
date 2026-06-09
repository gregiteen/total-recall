import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

const vaultDir = path.join(process.env.HOME, '.agent', 'skills', 'total-recall', 'memory-vault');
const categories = fs.readdirSync(vaultDir).filter(f => fs.statSync(path.join(vaultDir, f)).isDirectory());

const nodes = [];

for (const cat of categories) {
  const catDir = path.join(vaultDir, cat);
  const files = fs.readdirSync(catDir).filter(f => f.endsWith('.md'));
  for (const f of files) {
    const p = path.join(catDir, f);
    const raw = fs.readFileSync(p, 'utf8');
    const { data } = matter(raw);
    if (data.status === 'active') {
      nodes.push({ file: p, title: data.title, slug: data.slug, updated: new Date(data.updated || data.created || 0) });
    }
  }
}

const titleMap = new Map();
let duplicateCount = 0;

for (const n of nodes) {
  const title = n.title.trim().toLowerCase();
  if (!titleMap.has(title)) {
    titleMap.set(title, []);
  }
  titleMap.get(title).push(n);
}

for (const [title, group] of titleMap.entries()) {
  if (group.length > 1) {
    console.log(`\nDuplicate Title: "${title}" (${group.length} nodes)`);
    group.sort((a, b) => b.updated - a.updated); // Keep newest first
    for (let i = 1; i < group.length; i++) {
      console.log(`  -> Archive: ${group[i].slug} (updated ${group[i].updated})`);
      const raw = fs.readFileSync(group[i].file, 'utf8');
      const { data, content } = matter(raw);
      data.status = 'archived';
      data.x_archived_reason = 'duplicate_title';
      data.superseded_by = group[0].slug;
      
      const lines = [];
      lines.push('---');
      for (const key of Object.keys(data)) {
        lines.push(`${key}: ${JSON.stringify(data[key])}`);
      }
      lines.push('---');
      lines.push(content);
      
      // We will actually modify the files to archive them
      fs.writeFileSync(group[i].file, lines.join('\n'));
      duplicateCount++;
    }
  }
}

console.log(`\nTotal duplicates archived: ${duplicateCount}`);
