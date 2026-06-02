#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const args = process.argv.slice(2);
let prompt = '';
let outputJson = false;
let requestedModel = process.env.TR_CLI_MODEL || 'default';

if (args.includes('-h') || args.includes('--help')) {
  console.log(`
Antigravity CLI Agent Wrapper — Headless Zero-Dependency Cognitive Agent

Usage:
  antigravity [options] [prompt]
  antigravity -p "prompt"

Options:
  -p, --prompt    The text prompt to generate content for
  -m, --model     Gemini API model identifier or alias (default: default / gemini-3.5-flash)
                  Supported aliases:
                    - default / gemini / flash / gemini-flash -> dynamically resolves best Flash model
                    - pro / gemini-pro / 3.1-pro             -> dynamically resolves best Pro model
  -o, --json      Output dynamic JSON response payload (choices: stream/json/default)
  --json          Output dynamic JSON response payload
  -h, --help      Show this help information

Examples:
  antigravity "Say hello"
  antigravity -p "Write an essay about AI" -m pro
  antigravity -p "Get system stats" --json
`);
  process.exit(0);
}

for (let i = 0; i < args.length; i++) {
  if (args[i] === '-p' || args[i] === '--prompt') {
    prompt = args[i + 1] || '';
    i++;
  } else if (args[i] === '-o' && args[i + 1] === 'json') {
    outputJson = true;
    i++;
  } else if (args[i] === '--json') {
    outputJson = true;
  } else if (args[i] === '-m' || args[i] === '--model') {
    requestedModel = args[i + 1] || requestedModel;
    i++;
  }
}

if (!prompt && args.length > 0) {
  prompt = args[args.length - 1];
}

if (!prompt) {
  console.error('Error: No prompt provided. Use -p "prompt"');
  process.exit(1);
}

// Robust fallback to load GOOGLE_API_KEY from .env files when executed standalone
if (!process.env.GOOGLE_API_KEY) {
  try {
    let dir = process.cwd();
    while (dir !== path.dirname(dir)) {
      const envPath = path.join(dir, '.env');
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        for (const line of content.split('\n')) {
          const match = line.match(/^\s*GOOGLE_API_KEY\s*=\s*(["']?)(.*?)\1\s*$/);
          if (match) {
            process.env.GOOGLE_API_KEY = match[2];
            break;
          }
        }
      }
      if (process.env.GOOGLE_API_KEY) break;
      dir = path.dirname(dir);
    }
  } catch {
    // Silent ignore
  }
}

const apiKey = process.env.GOOGLE_API_KEY || '';
if (!apiKey) {
  console.warn('Warning: GOOGLE_API_KEY environment variable is not configured. Attempting connection via GCP Application Default Credentials or ambient environment...');
}

// Resolve the model dynamically from the API registry based on the category/alias selected
async function resolveGenerativeModel(selectedModel) {
  const aliases = {
    gemini: 'flash',
    default: 'flash',
    flash: 'flash',
    'gemini-flash': 'flash',
    '3.5-flash': 'flash',
    pro: 'pro',
    'gemini-pro': 'pro',
    '3.1-pro': 'pro'
  };

  const category = aliases[selectedModel];
  if (!category) {
    // If it's a full model string, use it directly
    return selectedModel;
  }

  try {
    const keyParam = apiKey ? `key=${apiKey}` : '';
    const headers = {};
    if (!apiKey && process.env.GCLOUD_TOKEN) {
      headers['Authorization'] = `Bearer ${process.env.GCLOUD_TOKEN}`;
    }
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?${keyParam}`, {
      headers,
      signal: AbortSignal.timeout(5000)
    });
    if (res.ok) {
      const data = await res.json();
      const models = data.models || [];
      
      if (category === 'pro') {
        const proPreferences = [
          'gemini-3.1-pro-preview',
          'gemini-2.5-pro',
          'gemini-1.5-pro',
          'gemini-pro-latest'
        ];
        for (const p of proPreferences) {
          if (models.some(m => m.name === `models/${p}`)) {
            return p;
          }
        }
      } else {
        const flashPreferences = [
          'gemini-3.5-flash',
          'gemini-3.1-flash-lite',
          'gemini-2.5-flash',
          'gemini-2.0-flash-lite',
          'gemini-flash-latest'
        ];
        for (const p of flashPreferences) {
          if (models.some(m => m.name === `models/${p}`)) {
            return p;
          }
        }
      }
    }
  } catch {
    // Silent failover to hardcoded default targets
  }

  // Ultimate fallback
  return category === 'pro' ? 'gemini-3.1-pro-preview' : 'gemini-3.5-flash';
}

async function main() {
  try {
    const resolvedModel = await resolveGenerativeModel(requestedModel);
    const keyParam = apiKey ? `?key=${apiKey}` : '';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${resolvedModel}:generateContent${keyParam}`;

    const headers = {
      'Content-Type': 'application/json',
    };
    if (!apiKey && process.env.GCLOUD_TOKEN) {
      headers['Authorization'] = `Bearer ${process.env.GCLOUD_TOKEN}`;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }]
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini API returned status ${res.status}: ${errText}`);
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Save usage data for token monitoring/budget safety
    try {
      const promptTokens = data.usageMetadata?.promptTokenCount || 0;
      const candidatesTokens = data.usageMetadata?.candidatesTokenCount || 0;
      if (promptTokens > 0 || candidatesTokens > 0) {
        const tmpDir = path.join(os.homedir(), '.gemini', 'tmp', 'antigravity', 'chats');
        if (!fs.existsSync(tmpDir)) {
          fs.mkdirSync(tmpDir, { recursive: true });
        }
        const usageLine = JSON.stringify({
          timestamp: new Date().toISOString(),
          tokens: {
            input: promptTokens,
            output: candidatesTokens
          }
        });
        fs.appendFileSync(path.join(tmpDir, 'usage.jsonl'), usageLine + '\n', 'utf8');
      }
    } catch {
      // Silent ignore
    }

    if (outputJson) {
      console.log(JSON.stringify({ response: text }));
    } else {
      console.log(text);
    }
  } catch (err) {
    console.error('Error calling Gemini API:', err.message);
    process.exit(1);
  }
}

main();
