import os from 'os';
import path from 'path';
import { globalAgentDir } from './src/core/config.mjs';

function inferProjectName(instructionsFile) {
  const agentDir = path.dirname(instructionsFile);
  if (agentDir === globalAgentDir) return null;
  return path.basename(path.dirname(agentDir));
}

console.log('Global:', inferProjectName('/Users/greg/.agent/INSTRUCTIONS.md'));
console.log('Project:', inferProjectName('/Users/greg/Github/ultrachat/.agent/INSTRUCTIONS.md'));
