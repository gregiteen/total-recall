import fs from 'fs';
import path from 'path';

const PROJECT_ROOT = path.resolve(process.cwd());
const MAP_INPUT = path.join(PROJECT_ROOT, '.agent', 'skills', 'repo-expert', 'api-map.json');
const TOOLS_OUTPUT = path.join(PROJECT_ROOT, 'src', 'server', 'mcp-generated.mjs');

if (!fs.existsSync(MAP_INPUT)) {
  console.error(`API map not found at ${MAP_INPUT}. Please run map-api.mjs first.`);
  process.exit(1);
}

const routes = JSON.parse(fs.readFileSync(MAP_INPUT, 'utf8'));

let toolsCode = `/**
 * Generated MCP Tools stub based on the API map.
 * You can copy these into src/server/mcp.mjs and flesh out the input schemas and logic.
 */

export function registerGeneratedTools(server) {
`;

for (const route of routes) {
  // Convert path to a safe tool name: e.g. /api/config/:name -> api_get_config_name
  const safePath = route.path
    .replace(/\//g, '_')
    .replace(/:/g, '')
    .replace(/[^a-zA-Z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
    
  const toolName = `${route.method.toLowerCase()}_${safePath}`;
  
  toolsCode += `  server.registerTool(
    '${toolName}',
    {
      title: '${route.method} ${route.path}',
      description: 'Interact with the ${route.method} ${route.path} endpoint. (Auto-generated tool stub)',
      inputSchema: {
        // TODO: Map the required parameters/body based on the API definition
      }
    },
    async (args) => {
      console.error(\`[MCP] ${toolName} called with args:\`, args);
      try {
        // TODO: Implement direct function invocation or fetch call to local API
        return {
          content: [{ type: 'text', text: \`Successfully executed ${toolName}\` }]
        };
      } catch (error) {
        console.error(\`[MCP] ${toolName} error:\`, error);
        return {
          content: [{ type: 'text', text: \`Error: \${error.message}\` }],
          isError: true
        };
      }
    }
  );\n\n`;
}

toolsCode += `}\n`;

fs.writeFileSync(TOOLS_OUTPUT, toolsCode, 'utf8');
console.log(`Successfully generated MCP tool stubs for ${routes.length} routes at ${TOOLS_OUTPUT}`);
console.log(`You can now integrate these into src/server/mcp.mjs`);
