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
  -o, --json      Output dynamic JSON response payload
  --json          Output dynamic JSON response payload
  -h, --help      Show this help information
`);
  process.exit(0);
}

// Ignored flags for compat with tr-cli-agents dispatch
const IGNORED = new Set(['--sandbox=false', '--yolo']);

for (let i = 0; i < args.length; i++) {
  if (IGNORED.has(args[i])) continue;
  if (args[i] === '-p' || args[i] === '--prompt') { prompt = args[i + 1] || ''; i++; }
  else if (args[i] === '-o' && args[i + 1] === 'json') { outputJson = true; i++; }
  else if (args[i] === '--json') { outputJson = true; }
  else if (args[i] === '-m' || args[i] === '--model') { requestedModel = args[i + 1] || requestedModel; i++; }
}

if (!prompt && args.length > 0) {
  for (let i = args.length - 1; i >= 0; i--) {
    if (!args[i].startsWith('-') && !IGNORED.has(args[i])) { prompt = args[i]; break; }
  }
}

if (!prompt) {
  console.error('Error: No prompt provided. Use -p "prompt"');
  process.exit(1);
}

// Load GOOGLE_API_KEY from env or .env files
if (!process.env.GOOGLE_API_KEY) {
  try {
    let dir = process.cwd();
    while (dir !== path.dirname(dir)) {
      const envPath = path.join(dir, '.env');
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        for (const line of content.split('\n')) {
          const match = line.match(/^\s*GOOGLE_API_KEY\s*=\s*(["']?)(.*?)\1\s*$/);
          if (match) { process.env.GOOGLE_API_KEY = match[2]; break; }
        }
      }
      if (process.env.GOOGLE_API_KEY) break;
      dir = path.dirname(dir);
    }
  } catch {}
}

const apiKey = process.env.GOOGLE_API_KEY || '';
if (!apiKey) {
  console.error('Error: GOOGLE_API_KEY not set.');
  process.exit(1);
}

// Model alias resolution
const aliases = {
  gemini: 'gemini-3.5-flash', default: 'gemini-3.5-flash',
  flash: 'gemini-3.5-flash', 'gemini-flash': 'gemini-3.5-flash', '3.5-flash': 'gemini-3.5-flash',
  pro: 'gemini-3.1-pro-preview', 'gemini-pro': 'gemini-3.1-pro-preview', '3.1-pro': 'gemini-3.1-pro-preview',
};
const resolvedModel = aliases[requestedModel] || requestedModel;

async function main() {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${resolvedModel}:generateContent?key=${apiKey}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini API returned status ${res.status}: ${errText}`);
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Save usage data for budget safety
    try {
      const promptTokens = data.usageMetadata?.promptTokenCount || 0;
      const candidatesTokens = data.usageMetadata?.candidatesTokenCount || 0;
      if (promptTokens > 0 || candidatesTokens > 0) {
        const tmpDir = path.join(os.homedir(), '.gemini', 'tmp', 'antigravity', 'chats');
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
        const usageLine = JSON.stringify({
          timestamp: new Date().toISOString(),
          tokens: { input: promptTokens, output: candidatesTokens }
        });
        fs.appendFileSync(path.join(tmpDir, 'usage.jsonl'), usageLine + '\n', 'utf8');
      }
    } catch {}

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
