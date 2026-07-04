#!/usr/bin/env node
// Antigravity CLI Agent Wrapper — routes through the running Antigravity IDE
// via agentapi, using the user's logged-in Google account.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
let prompt = '';
let outputJson = false;
let requestedModel = process.env.TR_CLI_MODEL || 'flash';

if (args.includes('-h') || args.includes('--help')) {
  console.log(`
Antigravity CLI Agent Wrapper — Headless via agentapi (logged-in account)

Usage:
  antigravity [options] [prompt]
  antigravity -p "prompt"

Options:
  -p, --prompt    The text prompt to generate content for
  -m, --model     Model: flash_lite, flash, pro (default: flash)
  -o json         Output JSON response payload
  --json          Output JSON response payload
  -h, --help      Show this help information
`);
  process.exit(0);
}

// Ignored flags for compatibility with tr-cli-agents dispatch
const IGNORED = new Set(['--sandbox=false', '--yolo']);

for (let i = 0; i < args.length; i++) {
  if (IGNORED.has(args[i])) continue;
  if (args[i] === '-p' || args[i] === '--prompt') { prompt = args[i + 1] || ''; i++; }
  else if (args[i] === '-o' && args[i + 1] === 'json') { outputJson = true; i++; }
  else if (args[i] === '--json') { outputJson = true; }
  else if (args[i] === '-m' || args[i] === '--model') { requestedModel = args[i + 1] || requestedModel; i++; }
}

if (!prompt && args.length > 0) {
  // Last non-flag arg is the prompt
  for (let i = args.length - 1; i >= 0; i--) {
    if (!args[i].startsWith('-') && !IGNORED.has(args[i])) { prompt = args[i]; break; }
  }
}

if (!prompt) {
  console.error('Error: No prompt provided. Use -p "prompt"');
  process.exit(1);
}

// Map model aliases
const modelMap = {
  default: 'flash', gemini: 'flash', 'gemini-flash': 'flash',
  'gemini-3.5-flash': 'flash', '3.5-flash': 'flash',
  pro: 'pro', 'gemini-pro': 'pro', '3.1-pro': 'pro',
  lite: 'flash_lite', 'flash-lite': 'flash_lite',
};
const model = modelMap[requestedModel] || requestedModel;

// Spawn agentapi new-conversation and capture the response
const result = spawnSync('agentapi', [
  'new-conversation',
  `--model=${model}`,
  '--title=antigravity-cli',
  prompt,
], {
  encoding: 'utf8',
  timeout: 300_000,
  maxBuffer: 10 * 1024 * 1024,
  env: process.env,
});

if (result.status !== 0) {
  const err = result.stderr || result.stdout || 'agentapi failed';
  console.error('Error:', err);
  process.exit(1);
}

const raw = result.stdout?.trim() || '';

// Parse agentapi response
let text = raw;
try {
  const parsed = JSON.parse(raw);
  // agentapi returns { response: { conversationId, content } }
  if (parsed.response?.content) text = parsed.response.content;
  else if (parsed.content) text = parsed.content;
  else if (parsed.response) text = typeof parsed.response === 'string' ? parsed.response : JSON.stringify(parsed.response);
} catch {
  // Not JSON, use raw output
}

if (outputJson) {
  console.log(JSON.stringify({ response: text }));
} else {
  console.log(text);
}
