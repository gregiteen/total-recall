import fs from 'fs';
let content = fs.readFileSync('frontend/src/pages/ModelsPage.tsx', 'utf8');

// Replace the Cloud API Keys Panel div with a form
content = content.replace(
  /\{?\/\* Cloud API Keys Panel \*\/\}?\n\s*<div className="card"/,
  '{/* Cloud API Keys Panel */}\n            <form className="card" onSubmit={(e) => e.preventDefault()}'
);

// We need to find where this div closes. It closes just before the UsageChart.
// Wait, the UsageChart is at the end of the grid. Let's just find the UsageChart and replace the closing div before it.
content = content.replace(
  /<\/div>\n\n\s*<UsageChart/g,
  '</form>\n\n          <UsageChart'
);

fs.writeFileSync('frontend/src/pages/ModelsPage.tsx', content);
