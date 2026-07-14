import fs from 'fs';
let content = fs.readFileSync('src/core/vault-watcher.spec.mjs', 'utf8');

// In beforeEach, after `startVaultWatcher = mod.startVaultWatcher;`, add `startVaultWatcher().stop();`
content = content.replace(
  /startVaultWatcher = mod\.startVaultWatcher;/g,
  "startVaultWatcher = mod.startVaultWatcher;\n  startVaultWatcher('/fake/vault', '/fake/skills', '/fake/derived', '/fake/sessions', '/fake/instructions.md').stop();"
);

fs.writeFileSync('src/core/vault-watcher.spec.mjs', content);
