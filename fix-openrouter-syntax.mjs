import fs from 'fs';
let content = fs.readFileSync('frontend/src/pages/ModelsPage.tsx', 'utf8');

// The line is: `                      ));`
// We need to change it to: `                      });`
content = content.replace(/<\/optgroup>\n\s*\)\);/g, '</optgroup>\n                      });');

fs.writeFileSync('frontend/src/pages/ModelsPage.tsx', content);
