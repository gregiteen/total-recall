import fs from 'fs';
let content = fs.readFileSync('frontend/src/pages/ApiKeysPage.tsx', 'utf8');
content = content.replace(/These keys are stored locally and injected into the CLI reasoning agents on dispatch\.\n              <\/span>\n        <\/div>\n      \)\}\n    <\/div>\n  \);\n\}/, `These keys are stored locally and injected into the CLI reasoning agents on dispatch.
              </span>
            </div>
        </div>
      )}
    </div>
  );
}`);
fs.writeFileSync('frontend/src/pages/ApiKeysPage.tsx', content);
