import fs from 'fs';
let content = fs.readFileSync('frontend/src/pages/ModelsPage.tsx', 'utf8');

// Add disabled to gemini select
content = content.replace(
  /<select\n\s*value=\{configData\?.brain\?.gemini_model \|\| ''\}\n\s*onChange/g,
  '<select\n                  disabled={!configData?.secrets?.google_api_key}\n                  value={configData?.brain?.gemini_model || \'\'}\n                  onChange'
);

// Add disabled to claude select
content = content.replace(
  /<select\n\s*value=\{configData\?.brain\?.claude_model \|\| ''\}\n\s*onChange/g,
  '<select\n                  disabled={!configData?.secrets?.anthropic_api_key}\n                  value={configData?.brain?.claude_model || \'\'}\n                  onChange'
);

// Add disabled to openai select
content = content.replace(
  /<select\n\s*value=\{configData\?.brain\?.openai_model \|\| ''\}\n\s*onChange/g,
  '<select\n                  disabled={!configData?.secrets?.openai_api_key}\n                  value={configData?.brain?.openai_model || \'\'}\n                  onChange'
);

fs.writeFileSync('frontend/src/pages/ModelsPage.tsx', content);
