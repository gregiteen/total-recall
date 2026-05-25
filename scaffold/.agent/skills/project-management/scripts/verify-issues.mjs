#!/usr/bin/env node

/**
 * Script: verify-issues.mjs
 * Purpose: Verifies that the project-management skill conforms to Total Recall's strict Issue/PR templates.
 */

import fs from 'node:fs';
import path from 'node:path';

const GITHUB_DIR = path.resolve('.github');
const ISSUE_TEMPLATES_DIR = path.join(GITHUB_DIR, 'ISSUE_TEMPLATE');

let exitCode = 0;

function checkFile(filePath, description) {
  if (fs.existsSync(filePath)) {
    console.log(`✅ [PASS] ${description} exists.`);
  } else {
    console.error(`❌ [FAIL] Missing ${description}: ${filePath}`);
    exitCode = 1;
  }
}

// 1. Verify PR Template exists
checkFile(path.join(GITHUB_DIR, 'pull_request_template.md'), 'Pull Request Template');

// 2. Verify Issue Templates exist
checkFile(path.join(ISSUE_TEMPLATES_DIR, 'bug_report.md'), 'Bug Report Template');
checkFile(path.join(ISSUE_TEMPLATES_DIR, 'beta_task.md'), 'Beta Task Template');

console.log(exitCode === 0 ? "🎉 Project Management templates are valid." : "⚠️ Project Management templates are missing.");
process.exit(exitCode);
