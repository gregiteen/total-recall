import fs from 'fs';
let content = fs.readFileSync('frontend/src/pages/ModelsPage.tsx', 'utf8');

content = content.replace(/<\/optgroup>\n\s*\}\);/g, '</optgroup>\n                        );\n                      });');

fs.writeFileSync('frontend/src/pages/ModelsPage.tsx', content);
