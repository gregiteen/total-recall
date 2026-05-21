import fs from 'fs';
import path from 'path';
import yaml from 'yaml';
import { getEnvVar } from './config.mjs';
import { logger } from './logger.mjs';

/**
 * Frontier Intelligence Router
 * Bypasses the local kernel (Gemma 4) to route high-complexity tasks
 * or tasks with consecutive sandbox failures to a frontier endpoint.
 */

export function loadFrontierConfig(configPath) {
  if (!fs.existsSync(configPath)) {
    throw new Error(`Frontier config not found at ${configPath}`);
  }
  const raw = fs.readFileSync(configPath, 'utf8');
  return yaml.parse(raw) || {};
}

export async function callFrontierRaw(messages, config, tools = undefined) {
  const { endpoint, model, api_key_env, api_key, temperature = 0.2 } = config;
  
  const apiKey = api_key || (api_key_env ? getEnvVar(api_key_env) : null);
  if (!apiKey && !endpoint.includes('127.0.0.1') && !endpoint.includes('localhost')) {
    throw new Error(`Missing API key in config or environment for endpoint ${endpoint}`);
  }

  const payload = {
    model,
    messages,
    temperature
  };
  if (tools && tools.length > 0) {
    payload.tools = tools;
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Frontier API error (${response.status}): ${err}`);
  }

  const json = await response.json();
  return json.choices[0].message;
}

export async function callFrontier(prompt, system, config) {
  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: prompt }
  ];
  const message = await callFrontierRaw(messages, config);
  return message.content;
}

export async function escalateToFrontier(task, failureContext, configPath) {
  const config = loadFrontierConfig(configPath);
  
  logger.info('frontier', `Escalating task '${task.slug}' to ${config.model}...`);
  
  const system = `You are the Total Recall Frontier Judge. A local agent kernel has repeatedly failed a task. 
Review the failure context, determine the root cause, and provide a direct solution or corrected code block.`;

  const prompt = `Task: ${task.target}
Category: ${task.category}
Reason for task: ${task.reason}

Failure Context:
${failureContext}

Please provide the corrected output or exact instructions to resolve the failure.`;

  const response = await callFrontier(prompt, system, config);
  return response;
}
