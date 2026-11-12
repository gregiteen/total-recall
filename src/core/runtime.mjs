/** Generic runtime helpers and native owner delegates; harness behavior lives in its plugin. */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { logger } from './logger.mjs';
import { loadPluginModule } from './plugin-runtime.mjs';
import { brainDir, agentDir, embedModel, surfaceDir, instructionsFilePath } from './config.mjs';
import { checkBudgetSafety } from './usage-tracker.mjs';

let configOwner, configError;
try { configOwner = await loadPluginModule('meta-harness', 'reasoning-runtime'); }
catch (error) { configError = error; }
function reasoningConfigOwner() {
  if (!configOwner) throw new Error(`Metaharness reasoning is unavailable: ${configError?.message || 'install the plugin'}`);
  return configOwner;
}

export function findBinaryInPath(binaryName) {
  const extra = [path.join(os.homedir(), '.local', 'bin'), '/opt/homebrew/bin', '/usr/local/bin'];
  for (const dir of [...new Set([...(process.env.PATH || '').split(path.delimiter), ...extra].filter(Boolean))]) {
    const file = path.join(dir, binaryName);
    try { const stat = fs.statSync(file); if (stat.isFile() && (process.platform === 'win32' || (stat.mode & 0o111) !== 0)) return file; } catch { /* next directory */ }
  }
  return null;
}

export function loadRuntimeConfig(configPath) {
  return reasoningConfigOwner().loadRuntimeConfig(configPath, { brainDir, agentDir, embedding: { provider: 'google', model: embedModel },
    surfaceDir: surfaceDir(), instructionsFile: instructionsFilePath(), env: process.env, argv: process.argv });
}

export async function checkRuntimeHealth(config) {
  return (await loadPluginModule('meta-harness', 'reasoning-runtime', { activeRequired: true })).checkRuntimeHealth(config);
}

/** Compatibility auth projection only. Reasoning never consumes a broad credential projection. */
export async function loadDynamicSecrets(options = {}) {
  const { runtimeCredentials } = await loadPluginModule('auth', 'runtime-credentials');
  return runtimeCredentials({ brainDir: options.brainDir || process.env.TR_SECRETS_BRAIN || path.join(options.agentRoot || agentDir, 'skills', 'total-recall') });
}

export async function callLocalRuntime(prompt, system, config) {
  checkBudgetSafety();
  return (await loadPluginModule('meta-harness', 'reasoning-runtime', { activeRequired: true })).callLocalRuntime(prompt, system, config);
}
export async function callLocalRuntimeRaw(messages, config, tools) {
  checkBudgetSafety();
  return (await loadPluginModule('meta-harness', 'reasoning-runtime', { activeRequired: true })).callLocalRuntimeRaw(messages, config, tools);
}

/** Portable tolerant JSON parser; unchanged by the harness extraction. */
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

  // 2. Strip comments while respecting strings
  let commentStripped = '';
  let i = 0;
  let inDoubleQuote = false;
  let inSingleQuote = false;
  let escaped = false;

  while (i < str.length) {
    const char = str[i];
    const nextChar = str[i + 1];

    if (escaped) { commentStripped += char; escaped = false; i++; continue; }
    if (char === '\\') { commentStripped += char; escaped = true; i++; continue; }
    if (inDoubleQuote) { if (char === '"') inDoubleQuote = false; commentStripped += char; i++; continue; }
    if (inSingleQuote) { if (char === "'") inSingleQuote = false; commentStripped += char; i++; continue; }

    if (char === '/') {
      if (nextChar === '/') {
        i += 2;
        while (i < str.length && str[i] !== '\n' && str[i] !== '\r') i++;
        continue;
      } else if (nextChar === '*') {
        i += 2;
        while (i < str.length && !(str[i] === '*' && str[i + 1] === '/')) i++;
        i += 2;
        continue;
      } else {
        i++;
        while (i < str.length && str[i] !== '\n' && str[i] !== '\r') i++;
        continue;
      }
    }

    if (char === '"') inDoubleQuote = true;
    if (char === "'") inSingleQuote = true;
    commentStripped += char;
    i++;
  }

  // 3. Remove placeholder lines
  const lines = commentStripped.split('\n');
  const cleanedLines = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '_' || trimmed === '_,' || trimmed === ',_' || trimmed === '...' || trimmed === '...,') continue;
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
    if (escaped) { escaped = false; i++; continue; }
    if (char === '\\') { escaped = true; i++; continue; }
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
      if (i > lastIdx) segments.push({ type: 'code', value: cleaned.slice(lastIdx, i) });
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

  // 5. Transform segments
  for (const seg of segments) {
    if (seg.type === 'string') {
      if (seg.quoteChar === "'") {
        let content = seg.value.slice(1, -1);
        content = content.replace(/\\'/g, "'").replace(/"/g, '\\"');
        seg.value = `"${content}"`;
        seg.quoteChar = '"';
      }
    } else if (seg.type === 'code') {
      seg.value = seg.value.replace(/\b([a-zA-Z_$][a-zA-Z0-9_$-]*)\s*:/g, '"$1":');
      seg.value = seg.value.replace(/(:\s*)(?!true\b|false\b|null\b)\b([a-zA-Z_$][a-zA-Z0-9_$.-]*)\b(?!\s*:)/g, '$1"$2"');
    }
  }

  let repaired = segments.map(seg => seg.value).join('');
  repaired = repaired.replace(/,\s*([\]}])/g, '$1');

  // 6. Auto-balance braces/brackets
  const stack = [];
  escaped = false;
  let inStr = false;
  for (let j = 0; j < repaired.length; j++) {
    const c = repaired[j];
    if (escaped) { escaped = false; continue; }
    if (c === '\\') { escaped = true; continue; }
    if (inStr) { if (c === '"') inStr = false; continue; }
    if (c === '"') { inStr = true; continue; }
    if (c === '{' || c === '[') stack.push(c);
    else if (c === '}') { if (stack[stack.length - 1] === '{') stack.pop(); }
    else if (c === ']') { if (stack[stack.length - 1] === '[') stack.pop(); }
  }
  while (stack.length > 0) {
    const open = stack.pop();
    repaired += open === '{' ? '}' : ']';
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
