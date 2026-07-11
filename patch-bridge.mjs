import fs from 'fs';
const file = 'src/core/ssss-kernel-bridge.mjs';
let content = fs.readFileSync(file, 'utf8');
content = content.replace(
  'const response = await engine.processOperation(env, vaultRoot, {',
  `const eventsDir = path.join(vaultRoot, '.events');
  if (!fs.existsSync(eventsDir)) fs.mkdirSync(eventsDir, { recursive: true });
  const response = await engine.processOperation(env, vaultRoot, {`
);
fs.writeFileSync(file, content);
