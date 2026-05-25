import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../../../');
const REPORT_TS = path.join(ROOT, 'typescript-fullrepo-errors.txt');

const limitArg = process.argv.find(a => a.startsWith('--limit='));
const MAX_SHOWN = limitArg ? parseInt(limitArg.split('=')[1], 10) : Infinity;

async function report() {
  try {
    const data = await readFile(REPORT_TS, 'utf8');
    const lines = data.split('\n');
    const typeGroups = {};

    // Pattern: path/to/file.ts(line,col): error (TS\d+): Message
    const errorRegex = /: error (TS\d+): (.*)$/;

    lines.forEach(line => {
      const match = line.match(errorRegex);
      if (match) {
        const type = match[1];
        if (!typeGroups[type]) typeGroups[type] = [];
        typeGroups[type].push(line);
      }
    });

    const sortedTypes = Object.entries(typeGroups)
      .sort((a, b) => b[1].length - a[1].length);

    console.log('🛡️ --- TS ERRORS BY TYPE (Detailed View) --- 🛡️');
    
    if (sortedTypes.length === 0) {
      console.log('✅ No TypeScript errors grouped by type.');
      return;
    }

    let totalShown = 0;

    for (const [type, errors] of sortedTypes) {
      if (totalShown >= MAX_SHOWN) break;

      console.log(`\n🏷️  ${type} (${errors.length} instances)`);
      
      const toShow = isFinite(MAX_SHOWN) ? errors.slice(0, Math.max(0, MAX_SHOWN - totalShown)) : errors;
      toShow.forEach(e => console.log(`  ${e.trim()}`));
      totalShown += toShow.length;

      if (errors.length > toShow.length) {
        console.log(`  ... and ${errors.length - toShow.length} more`);
      }
    }

    if (isFinite(MAX_SHOWN) && totalShown >= MAX_SHOWN) {
      console.log(`\n⚠️ Report capped at ${MAX_SHOWN} total errors (use without --limit to see all).`);
    }

  } catch (err) {
    console.error('❌ Could not read TypeScript report. Is the daemon running?');
  }
}

report();


