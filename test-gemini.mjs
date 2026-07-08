import { spawnSync } from 'child_process';
const result = spawnSync('node', ['src/server/index.mjs', '--help'], { encoding: 'utf8', timeout: 3000 });
console.log(result.status);
