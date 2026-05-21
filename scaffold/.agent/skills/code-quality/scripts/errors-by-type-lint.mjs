import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../../../');
const REPORT_LINT = path.join(ROOT, 'lint-status.txt');

async function report() {
  try {
    const data = await readFile(REPORT_LINT, 'utf8');
    const lines = data.split('\n');
    const ruleGroups = {};

    // Pattern:   123:60  warning  Unexpected any... @typescript-eslint/no-explicit-any
    const lintRegex = /^\s*(\d+:\d+)\s+(warning|error)\s+(.*?)\s+([@\/\w-]+)$/;
    let currentFile = '';

    lines.forEach(line => {
      if (line.trim().startsWith('/') || line.trim().startsWith('.')) {
        currentFile = line.trim();
        return;
      }
      const match = line.match(lintRegex);
      if (match && currentFile) {
        const rule = match[4];
        if (!ruleGroups[rule]) ruleGroups[rule] = [];
        ruleGroups[rule].push(`  ${currentFile}:${match[1]} [${match[2]}] ${match[3]}`);
      }
    });

    const sortedRules = Object.entries(ruleGroups)
      .sort((a, b) => b[1].length - a[1].length);

    console.log('🛡️ --- LINT ERRORS BY RULE (Detailed View) --- 🛡️');
    
    if (sortedRules.length === 0) {
      console.log('✅ No Lint problems grouped by rule.');
      return;
    }

    let totalShown = 0;
    const MAX_SHOWN = 30;

    for (const [rule, errors] of sortedRules) {
      if (totalShown >= MAX_SHOWN) break;

      console.log(`\n📏 ${rule} (${errors.length} instances)`);
      
      const toShow = errors.slice(0, Math.max(0, MAX_SHOWN - totalShown));
      toShow.forEach(e => console.log(e));
      totalShown += toShow.length;

      if (errors.length > toShow.length) {
        console.log(`  ... and ${errors.length - toShow.length} more`);
      }
    }

    if (totalShown >= MAX_SHOWN) {
      console.log(`\n⚠️ Report capped at ${MAX_SHOWN} total errors to protect context window.`);
    }

  } catch (err) {
    console.error('❌ Could not read Lint report. Is the daemon running?');
  }
}

report();
