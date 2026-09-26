#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Prints the latest report written by the code-quality skill's background
// gates. The report script only reads results; it never starts a check.
export async function run() {
  const scriptPath = path.resolve(process.cwd(), '.agent/skills/code-quality/scripts/report.mjs');
  if (!fs.existsSync(scriptPath)) {
    console.error(`No code-quality skill in ${process.cwd()} (expected ${scriptPath}).`);
    process.exitCode = 1;
    return;
  }
  try {
    const out = execFileSync(process.execPath, [scriptPath], { encoding: 'utf8', cwd: process.cwd() });
    console.log(out);
  } catch (err) {
    if (err.stdout) console.log(err.stdout);
    console.error(err.stderr || err.message);
    process.exitCode = err.status || 1;
  }
}

export default run;
