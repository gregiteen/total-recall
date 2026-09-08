#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import path from 'node:path';

export async function run(argv = []) {
  const scriptPath = path.resolve(process.cwd(), '.agent/skills/code-quality/scripts/report.mjs');
  try {
    const out = execFileSync('node', [scriptPath], { encoding: 'utf8' });
    console.log(out);
  } catch (err) {
    console.error('Failed to run code-quality report:', err.message);
  }
}

export default run;
