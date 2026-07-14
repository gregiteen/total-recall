import fs from 'fs';
let content = fs.readFileSync('src/core/vault-watcher.spec.mjs', 'utf8');

// replace setupFsWatch() with setupFsWatch(); startVaultWatcher().stop(); setupFsWatch()
// wait, if I just add let currentWatcher; and then in afterEach do currentWatcher?.stop();
const afterEachCode = `
afterEach(() => {
  vi.useRealTimers();
});`;
const newAfterEach = `
let currentWatcher;
afterEach(() => {
  if (currentWatcher) currentWatcher.stop();
  currentWatcher = null;
  vi.useRealTimers();
});`;
content = content.replace(afterEachCode, newAfterEach);

// Also we need to assign currentWatcher when startVaultWatcher is called
content = content.replace(/startVaultWatcher\(/g, "currentWatcher = startVaultWatcher(");
fs.writeFileSync('src/core/vault-watcher.spec.mjs', content);
