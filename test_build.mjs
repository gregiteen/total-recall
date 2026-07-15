import { buildRulesBlock } from './src/core/surface.mjs';
import path from 'path';
import os from 'os';

async function test() {
  const globalAgentDir = path.join(os.homedir(), '.agent');
  const skillsDir = path.join(globalAgentDir, 'skills');
  const result = await buildRulesBlock(skillsDir, []);
  console.log(result);
}

test();
