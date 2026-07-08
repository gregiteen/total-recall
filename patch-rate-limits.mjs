import fs from 'fs';
import path from 'path';

// 1. Update the default in auth.mjs
let authPath = 'src/server/auth.mjs';
let content = fs.readFileSync(authPath, 'utf8');
content = content.replace(/api_requests_per_minute: 60/g, 'api_requests_per_minute: 1200');
content = content.replace(/api_requests_per_minute \|\| 60/g, 'api_requests_per_minute || 1200');
fs.writeFileSync(authPath, content);

// 2. Update their security.yml
let secPath = process.env.HOME + '/.agent/skills/total-recall/config/security.yml';
if (fs.existsSync(secPath)) {
  let secContent = fs.readFileSync(secPath, 'utf8');
  secContent = secContent.replace(/api_requests_per_minute:\s*60/g, 'api_requests_per_minute: 1200');
  fs.writeFileSync(secPath, secContent);
}

