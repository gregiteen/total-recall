import fs from 'fs';
import path from 'path';
import yaml from 'yaml';
import { spawnSync } from 'node:child_process';
import { logger } from './logger.mjs';

/**
 * Total Recall Local Runtime Manager
 *
 * Implements Phase 3 requirement: Support multiple local runtime
 * execution modes (Ollama, llama.cpp) for the core kernel.
 */

/**
 * Load the active runtime configuration from the vault or config dir.
 *
 * Precedence for endpoint:
 *   1. OLLAMA_ENDPOINT env var (for containerized / cloud deploys)
 *   2. Value from runtime.yml config file
 *   3. Default: http://127.0.0.1:11434/v1/chat/completions (local installs)
 */
export function loadRuntimeConfig(configPath) {
  const DEFAULT_ENDPOINT = 'http://127.0.0.1:11434/v1/chat/completions';
  const DEFAULT_MODEL = 'gemma4:26b';

  let config;
  if (!fs.existsSync(configPath)) {
    config = {
      runtime: 'ollama',
      endpoint: DEFAULT_ENDPOINT,
      model: DEFAULT_MODEL,
      temperature: 0.2
    };
  } else {
    config = yaml.parse(fs.readFileSync(configPath, 'utf8')) || {};
  }

  // Env var overrides — useful for Docker, cloud, and CI deployments
  if (process.env.OLLAMA_ENDPOINT) {
    config.endpoint = process.env.OLLAMA_ENDPOINT;
  }
  if (process.env.OLLAMA_MODEL) {
    config.model = process.env.OLLAMA_MODEL;
  }

  return config;
}

/**
 * Derive the Ollama base URL from the configured endpoint.
 * e.g. "http://127.0.0.1:11434/v1/chat/completions" → "http://127.0.0.1:11434"
 *      "https://my-cloud-ollama.example.com/v1/chat/completions" → "https://my-cloud-ollama.example.com"
 */
export function getOllamaBaseUrl(config) {
  if (config.ollama_base_url) return config.ollama_base_url;
  if (config.endpoint) {
    try {
      const u = new URL(config.endpoint);
      return `${u.protocol}//${u.host}`;
    } catch { /* fall through */ }
  }
  return 'http://127.0.0.1:11434';
}

/**
 * Check the health and availability of the configured runtime.
 */
export async function checkRuntimeHealth(config) {
  try {
    if (config.runtime === 'ollama') {
      const baseUrl = getOllamaBaseUrl(config);
      const resp = await fetch(`${baseUrl}/api/tags`);
      if (!resp.ok) return { status: 'degraded', reason: `Ollama returned ${resp.status}` };
      const data = await resp.json();
      const hasModel = data.models.some(m => m.name === config.model || m.name.startsWith(config.model));
      return hasModel 
        ? { status: 'healthy', runtime: 'ollama', active_model: config.model }
        : { status: 'degraded', reason: `Model ${config.model} not pulled in Ollama.` };
    } 
    else if (config.runtime === 'llama.cpp') {
      const endpoint = config.health_endpoint || 'http://127.0.0.1:8080/health';
      const resp = await fetch(endpoint);
      if (!resp.ok) return { status: 'degraded', reason: `llama.cpp server returned ${resp.status}` };
      return { status: 'healthy', runtime: 'llama.cpp', active_model: config.model };
    }
    else {
      return { status: 'degraded', reason: `Unknown runtime: ${config.runtime}` };
    }
  } catch (err) {
    return { status: 'degraded', reason: `Connection failed: ${err.message}` };
  }
}

/**
 * Execute a completion against the local runtime.
 * Normalizes between Ollama and llama.cpp.
 */
export async function callLocalRuntimeRaw(messages, config, tools = undefined) {
  const { runtime, endpoint, model, temperature = 0.2 } = config;

  const payload = {
    model,
    messages,
    temperature
  };

  if (tools && tools.length > 0) {
    payload.tools = tools;
  }

  // Ollama natively supports OpenAI compatible /v1/chat/completions endpoint
  // llama.cpp also natively supports /v1/chat/completions endpoint
  // So we can use standard OpenAI formatted requests for both.

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Local runtime error (${response.status}): ${err}`);
  }

  const json = await response.json();
  return json.choices[0].message;
}

/**
 * Higher level function to get a string completion.
 */
export async function callLocalRuntime(prompt, system, config) {
  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: prompt }
  ];
  const message = await callLocalRuntimeRaw(messages, config);
  return message.content;
}
