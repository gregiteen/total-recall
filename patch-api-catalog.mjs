import fs from 'fs';
let apiSpec = fs.readFileSync('src/server/api.spec.mjs', 'utf8');
apiSpec = apiSpec.replace(
  "fs.writeFileSync(path.join(refsDir, 'authoring-principles.md'), '# Authoring\\n\\nTOTAL_RECALL_AUTHORING_FIXTURE_TOKEN\\n');",
  "fs.writeFileSync(path.join(refsDir, 'authoring-principles.md'), '# Authoring\\n\\nTOTAL_RECALL_AUTHORING_FIXTURE_TOKEN\\n');\n      const catalogDir = path.join(TEST_AGENT_DIR, 'models', 'catalog', 'total-recall');\n      fs.mkdirSync(catalogDir, { recursive: true });\n      fs.writeFileSync(path.join(catalogDir, 'gemma4.yml'), 'id: total-recall/gemma4\\naliases: [gpt-4o-compatible]\\nmetadata:\\n  runtime_model: gemma4:26b\\n');"
);
fs.writeFileSync('src/server/api.spec.mjs', apiSpec);
