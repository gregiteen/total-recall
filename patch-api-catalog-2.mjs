import fs from 'fs';
let apiSpec = fs.readFileSync('src/server/api.spec.mjs', 'utf8');

apiSpec = apiSpec.replace(
  "fs.writeFileSync(path.join(catalogDir, 'gemma4.yml'), 'id: total-recall/gemma4\\naliases: [gpt-4o-compatible]\\nmetadata:\\n  runtime_model: gemma4:26b\\n');",
  "fs.mkdirSync(path.join(catalogDir, 'gemma4'));\n      fs.writeFileSync(path.join(catalogDir, 'gemma4', 'MODEL.md'), '---\\nid: total-recall/gemma4\\naliases: [gpt-4o-compatible]\\nmetadata:\\n  runtime_model: gemma4:26b\\n---\\n\\n# Gemma 4');"
);

fs.writeFileSync('src/server/api.spec.mjs', apiSpec);
