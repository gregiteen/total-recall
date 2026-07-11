import fs from 'fs';
let apiSpec = fs.readFileSync('src/server/api.spec.mjs', 'utf8');

apiSpec = apiSpec.replace(
  "id: total-recall/gemma4\\naliases: [gpt-4o-compatible]\\nmetadata:\\n  runtime_model: gemma4:26b\\n",
  "id: total-recall/gemma4\\nmodel_id: gpt-4o-compatible\\nmetadata:\\n  runtime_model: gemma4:26b\\n"
);

fs.writeFileSync('src/server/api.spec.mjs', apiSpec);
