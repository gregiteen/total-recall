import { walkMd } from './src/core/vault.mjs';
import matter from 'gray-matter';
import fs from 'fs';
console.log('Starting...');
const files = walkMd('/Users/greg/.agent/skills/total-recall/memory-vault');
console.log('Walked files:', files.length);
for (const file of files) {
  console.log('Parsing', file);
  const raw = fs.readFileSync(file, 'utf8');
  matter(raw);
}
console.log('Done!');
