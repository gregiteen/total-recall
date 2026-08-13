import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../../../');

console.log('🛡️ --- LINT AUTO-FIXER (v1.5.0) --- 🛡️');
console.log(`📍 Project Root: ${ROOT}`);

/**
 * Execute ESLint fix on the whole project with 6GB memory limit
 * to handle large codebase without crashing the environment.
 */
async function runAutoFix() {
  console.log('🚀 Starting repo-wide fix (this will take 60-120 seconds)...');
  
  const eslint = spawn('npx', ['eslint', '.', '--fix', '--max-warnings', '10000'], {
    cwd: ROOT,
    env: { 
      ...process.env, 
      NODE_OPTIONS: '--max-old-space-size=6144' 
    }
  });

  eslint.stdout.on('data', (data) => {
    process.stdout.write(data.toString());
  });

  eslint.stderr.on('data', (data) => {
    process.stderr.write(data.toString());
  });

  return new Promise((resolve, reject) => {
    eslint.on('close', (code) => {
      if (code === 0 || code === 1) {
        console.log('✅ Auto-fix pass complete.');
        resolve();
      } else {
        console.error(`❌ ESLint exited with code ${code}`);
        reject(new Error(`Exit code ${code}`));
      }
    });
  });
}

runAutoFix().catch(err => {
  console.error('❌ Auto-fix failed:', err.message);
  process.exit(1);
});
