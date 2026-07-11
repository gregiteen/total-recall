import fs from 'fs';
let apiSpec = fs.readFileSync('src/server/api.spec.mjs', 'utf8');
apiSpec = apiSpec.replace(
  "process.env.AGENT_DIR = TEST_AGENT_DIR;",
  "process.env.AGENT_DIR = TEST_AGENT_DIR;\nprocess.env.TR_ROOT = TEST_AGENT_DIR;"
);
fs.writeFileSync('src/server/api.spec.mjs', apiSpec);
