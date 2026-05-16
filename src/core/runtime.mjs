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
 */
export function loadRuntimeConfig(configPath) {
  if (!fs.existsSync(configPath)) {
    // Default to Ollama Gemma 4
    return {
      runtime: 'ollama',
      endpoint: 'http://127.0.0.1:11434/v1/chat/completions',
      model: 'gemma4:26b',
      temperature: 0.2
    };
  }
  const raw = fs.readFileSync(configPath, 'utf8');
  return yaml.parse(raw) || {};
}

/**
 * Check the health and availability of the configured runtime.
 */
export async function checkRuntimeHealth(config) {
  try {
    if (config.runtime === 'ollama') {
      const resp = await fetch('http://127.0.0.1:11434/api/tags');
      if (!resp.ok) return { status: 'degraded', reason: `Ollama returned ${resp.status}` };
      const data = await resp.json();
      const hasModel = data.models.some(m => m.name === config.model || m.name.startsWith(config.model));
      return hasModel 
        ? { status: 'healthy', runtime: 'ollama', active_model: config.model }
        : { status: 'degraded', reason: `Model ${config.model} not pulled in Ollama.` };
    } 
    else if (config.runtime === 'llama.cpp') {
      // llama.cpp server usually running on 8080
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
