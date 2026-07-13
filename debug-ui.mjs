import fs from 'fs';
const modelsPageContent = fs.readFileSync('frontend/src/pages/ModelsPage.tsx', 'utf8');

const cloudPanelMatch = modelsPageContent.match(/\{\/\* Cloud API Keys Panel \*\/\}([\s\S]*?)<\/div>\s*<\/div>\s*<UsageChart/);
let cloudPanel = cloudPanelMatch[1].trim();
cloudPanel += '\n            </div>'; // Add back the closing </div> for the card!

// Just print the number of open <div and closing </div
const opens = (cloudPanel.match(/<div/g) || []).length;
const closes = (cloudPanel.match(/<\/div>/g) || []).length;
console.log('divs open:', opens, 'divs close:', closes);
