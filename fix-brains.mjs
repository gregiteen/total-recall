import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const globalVault = '/Users/greg/.agent/skills/total-recall/memory-vault';
const projectVault = '/Users/greg/Github/total-recall/.agent/skills/total-recall/memory-vault';

const files = execSync(`grep -rl "Self-captured memory:" ${globalVault} || true`, { encoding: 'utf-8' }).trim().split('\n').filter(Boolean);

let moved = 0;
for (const file of files) {
  const relativePath = path.relative(globalVault, file);
  const targetPath = path.join(projectVault, relativePath);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.renameSync(file, targetPath);
  moved++;
}
console.log('Moved', moved, 'Self-captured memory nodes.');
