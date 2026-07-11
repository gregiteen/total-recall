import fs from 'fs';
let code = fs.readFileSync('src/server/api.spec.mjs', 'utf8');

code = code.replace(
  "expect(spec.body.content).toContain('TOTAL_RECALL_SPEC_FIXTURE_TOKEN');",
  "expect(spec.body.content).toContain('TOTAL_RECALL_SSSS_FIXTURE_TOKEN');"
);

fs.writeFileSync('src/server/api.spec.mjs', code);
