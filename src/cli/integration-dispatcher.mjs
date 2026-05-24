import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { agentDir } from '../core/config.mjs';
import { logger } from '../core/logger.mjs';

/**
 * Dynamic SSSS-driven Integration Dispatcher.
 * Exposes arbitrary third-party APIs as first-class CLI commands.
 *
 * @param {string} serviceName - e.g. "github", "slack", "linear"
 * @param {string} actionName - e.g. "list_issues", "post_message"
 * @param {object} cliArgs - Map of CLI arguments passed (e.g. { owner: "...", repo: "..." })
 */
export default async function dispatchIntegrationCommand(serviceName, actionName, cliArgs) {
  const resolvedAgentDir = process.env.AGENT_DIR || agentDir;
  const localFilePath = path.join(resolvedAgentDir, 'skills', 'total-recall', 'integrations', `${serviceName}.md`);
  if (!fs.existsSync(localFilePath)) {
    throw new Error(`Integration "${serviceName}" is not configured in the VFS.`);
  }

  // 1. Read and parse SSSS YAML frontmatter
  let parsed;
  try {
    parsed = matter(fs.readFileSync(localFilePath, 'utf8'));
  } catch (err) {
    throw new Error(`Failed to parse integration SSSS frontmatter: ${err.message}`);
  }

  const schema = parsed.data || {};
  if (schema.type !== 'integration') {
    throw new Error(`Invalid SSSS node type in "${serviceName}.md". Expected "integration", found "${schema.type}".`);
  }

  const endpoints = schema.endpoints || {};
  const endpointTemplate = endpoints[actionName];
  if (!endpointTemplate) {
    throw new Error(`Action "${actionName}" not found for service "${serviceName}". Available actions: ${Object.keys(endpoints).join(', ')}`);
  }

  // 2. Resolve Method and Path template (e.g. "GET /repos/{owner}/{repo}/issues")
  const parts = endpointTemplate.trim().split(/\s+/);
  if (parts.length !== 2) {
    throw new Error(`Malformed endpoint definition: "${endpointTemplate}". Expected format: "METHOD /path".`);
  }
  const [method, pathTemplate] = parts;

  // 3. Bind Path variables (e.g. {owner} -> val)
  let finalPath = pathTemplate;
  const remainingArgs = { ...cliArgs };
  
  const placeholders = pathTemplate.match(/\{([a-zA-Z0-9_-]+)\}/g) || [];
  for (const placeholder of placeholders) {
    const key = placeholder.slice(1, -1);
    const value = cliArgs[key];
    if (value === undefined) {
      throw new Error(`Missing required path variable: --${key}`);
    }
    finalPath = finalPath.replace(placeholder, encodeURIComponent(String(value)));
    delete remainingArgs[key]; // consumed by the path template
  }

  // 4. Resolve Auth Credential from Env
  let token = '';
  const envVars = schema.env_vars || [];
  for (const envVar of envVars) {
    if (process.env[envVar]) {
      token = process.env[envVar];
      break;
    }
  }

  // 5. Populate and sign headers
  const headers = {};
  if (schema.headers) {
    for (const [key, val] of Object.entries(schema.headers)) {
      if (typeof val === 'string') {
        // Substitute tokens dynamically
        headers[key] = val
          .replace('<GITHUB_TOKEN>', token)
          .replace('<SLACK_BOT_TOKEN>', token)
          .replace('<LINEAR_API_KEY>', token)
          .replace('<API_KEY>', token);
      } else {
        headers[key] = String(val);
      }
    }
  }

  // 6. Build final URL and fetch configuration
  const apiBaseUrl = (schema.api_base_url || '').replace(/\/$/, '');
  const url = new URL(`${apiBaseUrl}${finalPath}`);
  const fetchOpts = {
    method,
    headers,
    signal: AbortSignal.timeout(30000)
  };

  if (method === 'GET' || method === 'DELETE') {
    for (const [key, val] of Object.entries(remainingArgs)) {
      if (val !== undefined && val !== null) {
        url.searchParams.append(key, String(val));
      }
    }
  } else {
    // POST, PUT, PATCH
    headers['Content-Type'] ??= 'application/json';
    fetchOpts.body = JSON.stringify(remainingArgs);
  }

  logger.info({
    subsystem: 'integration-dispatcher',
    message: `Executing ${method} request to ${url.toString()}`
  });

  const res = await fetch(url.toString(), fetchOpts);
  const responseText = await res.text();

  if (!res.ok) {
    throw new Error(`HTTP Error ${res.status} (${res.statusText}): ${responseText.slice(0, 1000)}`);
  }

  try {
    return JSON.parse(responseText);
  } catch {
    return responseText;
  }
}
