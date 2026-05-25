import fs from 'fs';
import path from 'path';

const PROJECT_ROOT = path.resolve(process.cwd());
const API_FILE = path.join(PROJECT_ROOT, 'src', 'server', 'api.mjs');
const MAP_OUTPUT = path.join(PROJECT_ROOT, '.agent', 'skills', 'repo-expert', 'api-map.json');

if (!fs.existsSync(API_FILE)) {
  console.error(`API file not found at ${API_FILE}`);
  process.exit(1);
}

const code = fs.readFileSync(API_FILE, 'utf8');

// Regex to match: apiRouter.METHOD('/path', (req, res) => {
const routeRegex = /apiRouter\.(get|post|put|delete|patch)\(['"`]([^'"`]+)['"`]/g;
let match;
const routes = [];

while ((match = routeRegex.exec(code)) !== null) {
  routes.push({
    method: match[1].toUpperCase(),
    path: match[2]
  });
}

// Ensure output directory exists
const outputDir = path.dirname(MAP_OUTPUT);
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

fs.writeFileSync(MAP_OUTPUT, JSON.stringify(routes, null, 2), 'utf8');
console.log(`Successfully mapped ${routes.length} API routes to ${MAP_OUTPUT}`);
