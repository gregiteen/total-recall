import fs from 'fs';
import { createEngine } from '@ssss/cli/engine';

const vaultRoot = './temp-vault';
fs.mkdirSync(vaultRoot, { recursive: true });

const engine = createEngine();
const env = {
  type: 'operation',
  idempotency_key: 'test',
  path: 'test.md',
  content: '# Test\n',
  dry_run: true
};

engine.processOperation(env, vaultRoot, {}).then(() => {
  console.log('Files after dry run:', fs.readdirSync(vaultRoot));
  fs.rmSync(vaultRoot, { recursive: true, force: true });
});
