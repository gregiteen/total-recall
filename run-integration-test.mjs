import { execSync } from 'child_process';
try {
  execSync('npm test -- src/server/routes/integrations.spec.mjs', { stdio: 'inherit' });
} catch (e) {
  // failed
}
