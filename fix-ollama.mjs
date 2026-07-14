import fs from 'fs';

const files = [
  'src/core/clarity-rewriter.mjs',
  'src/core/runtime.mjs',
  'src/core/embeddings.mjs',
  'src/core/vault-watcher.mjs',
  'src/server/api.mjs',
  'src/server/routes/memory.mjs',
  'src/server/routes/sessions.mjs',
  'src/cli/upgrade.mjs',
  'src/cli/init.mjs',
  'src/cli/deploy.mjs'
];

for (const file of files) {
  if (!fs.existsSync(file)) continue;
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/ollama/gi, 'local_llm');
  fs.writeFileSync(file, content);
}

fs.rmSync('src/server/rest-cleaned.mjs');
