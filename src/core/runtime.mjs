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

/**
 * Safely clean and parse JSON produced by LLMs, which might contain
 * trailing commas, standalone placeholder lines (like '_'), or other formatting quirks.
 */
export function cleanAndParseJSON(jsonStr) {
  if (typeof jsonStr !== 'string') {
    return jsonStr;
  }

  let str = jsonStr.trim();

  // 1. Extract JSON from markdown code block if present
  const codeBlockMatch = str.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) {
    str = codeBlockMatch[1].trim();
  } else {
    // Otherwise, find the first occurrence of { or [
    const firstBrace = str.indexOf('{');
    const firstBracket = str.indexOf('[');
    let startIdx = -1;
    if (firstBrace !== -1 && firstBracket !== -1) {
      startIdx = Math.min(firstBrace, firstBracket);
    } else if (firstBrace !== -1) {
      startIdx = firstBrace;
    } else if (firstBracket !== -1) {
      startIdx = firstBracket;
    }
    if (startIdx !== -1) {
      str = str.slice(startIdx).trim();
    }
  }

  // 2. Strip comments (single-line // and multi-line /* */) while respecting strings
  let commentStripped = '';
  let i = 0;
  let inDoubleQuote = false;
  let inSingleQuote = false;
  let escaped = false;

  while (i < str.length) {
    const char = str[i];
    const nextChar = str[i + 1];

    if (escaped) {
      commentStripped += char;
      escaped = false;
      i++;
      continue;
    }

    if (char === '\\') {
      commentStripped += char;
      escaped = true;
      i++;
      continue;
    }

    if (inDoubleQuote) {
      if (char === '"') {
        inDoubleQuote = false;
      }
      commentStripped += char;
      i++;
      continue;
    }

    if (inSingleQuote) {
      if (char === "'") {
        inSingleQuote = false;
      }
      commentStripped += char;
      i++;
      continue;
    }

    // Check for comments outside of strings
    if (char === '/' && nextChar === '/') {
      i += 2;
      while (i < str.length && str[i] !== '\n' && str[i] !== '\r') {
        i++;
      }
      continue;
    }

    if (char === '/' && nextChar === '*') {
      i += 2;
      while (i < str.length && !(str[i] === '*' && str[i + 1] === '/')) {
        i++;
      }
      i += 2; // skip */
      continue;
    }

    if (char === '"') {
      inDoubleQuote = true;
      commentStripped += char;
      i++;
      continue;
    }

    if (char === "'") {
      inSingleQuote = true;
      commentStripped += char;
      i++;
      continue;
    }

    commentStripped += char;
    i++;
  }

  // 3. Process line by line to remove standalone placeholders or bad lines
  const lines = commentStripped.split('\n');
  const cleanedLines = [];
  for (const line of lines) {
    const trimmed = line.trim();
    // Skip placeholder lines outside of actual string content
    if (trimmed === '_' || trimmed === '_,' || trimmed === ',_' || trimmed === '...' || trimmed === '...,') {
      continue;
    }
    cleanedLines.push(line);
  }
  const cleaned = cleanedLines.join('\n');

  // 4. Tokenize into string literals and structural code blocks
  const segments = [];
  let lastIdx = 0;
  i = 0;
  let inQuote = false;
  let quoteChar = null;
  escaped = false;

  while (i < cleaned.length) {
    const char = cleaned[i];
    if (escaped) {
      escaped = false;
      i++;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      i++;
      continue;
    }
    if (inQuote) {
      if (char === quoteChar) {
        segments.push({ type: 'string', value: cleaned.slice(lastIdx, i + 1), quoteChar });
        inQuote = false;
        lastIdx = i + 1;
      }
      i++;
      continue;
    }
    if (char === '"' || char === "'") {
      if (i > lastIdx) {
        segments.push({ type: 'code', value: cleaned.slice(lastIdx, i) });
      }
      inQuote = true;
      quoteChar = char;
      lastIdx = i;
      i++;
      continue;
    }
    i++;
  }
  if (i > lastIdx) {
    if (inQuote) {
      segments.push({ type: 'string', value: cleaned.slice(lastIdx) + quoteChar, quoteChar });
    } else {
      segments.push({ type: 'code', value: cleaned.slice(lastIdx) });
    }
  }

  // 5. Transform segments (quote keys/values, normalize strings)
  for (const seg of segments) {
    if (seg.type === 'string') {
      if (seg.quoteChar === "'") {
        let content = seg.value.slice(1, -1);
        content = content.replace(/\\'/g, "'").replace(/"/g, '\\"');
        seg.value = `"${content}"`;
        seg.quoteChar = '"';
      }
    } else if (seg.type === 'code') {
      // Quote unquoted keys (e.g. key: -> "key":)
      seg.value = seg.value.replace(/\b([a-zA-Z_$][a-zA-Z0-9_$-]*)\s*:/g, '"$1":');
      // Quote unquoted values (e.g. : pending -> : "pending")
      seg.value = seg.value.replace(/(:\s*)(?!true\b|false\b|null\b)\b([a-zA-Z_$][a-zA-Z0-9_$.-]*)\b(?!\s*:)/g, '$1"$2"');
    }
  }

  let repaired = segments.map(seg => seg.value).join('');

  // 6. Remove trailing commas before closing brackets/braces
  repaired = repaired.replace(/,\s*([\]}])/g, '$1');

  // 7. Auto-balance braces/brackets
  const stack = [];
  escaped = false;
  let inStr = false;
  for (let j = 0; j < repaired.length; j++) {
    const c = repaired[j];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (c === '\\') {
      escaped = true;
      continue;
    }
    if (inStr) {
      if (c === '"') {
        inStr = false;
      }
      continue;
    }
    if (c === '"') {
      inStr = true;
      continue;
    }

    if (c === '{' || c === '[') {
      stack.push(c);
    } else if (c === '}') {
      if (stack[stack.length - 1] === '{') {
        stack.pop();
      }
    } else if (c === ']') {
      if (stack[stack.length - 1] === '[') {
        stack.pop();
      }
    }
  }

  while (stack.length > 0) {
    const open = stack.pop();
    if (open === '{') {
      repaired += '}';
    } else if (open === '[') {
      repaired += ']';
    }
  }

  try {
    return JSON.parse(repaired);
  } catch (err) {
    logger.error('cleanAndParseJSON failed to parse repaired JSON', {
      original: jsonStr,
      repaired,
      error: err.message
    });
    throw err;
  }
}

