import fs from 'fs';
let apiSpec = fs.readFileSync('src/core/okf-adapter.spec.mjs', 'utf8');
apiSpec = apiSpec.replace(
  "expect(files.length).toBe(0);",
  "if (files.length > 0) console.error('WRITTEN FILES:', files); expect(files.length).toBe(0);"
);
fs.writeFileSync('src/core/okf-adapter.spec.mjs', apiSpec);
