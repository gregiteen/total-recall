import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
function getArg(flag, def = null) {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : def;
}

const repoDir = getArg('--repo');
const taskPrompt = getArg('--task', 'Implement next pending phase items from project tracker');
const model = getArg('--model', 'deepseek/deepseek-v4.1-flash');

if (!repoDir || !fs.existsSync(repoDir)) {
  console.error(`Error: repo directory "${repoDir}" does not exist.`);
  process.exit(1);
}

// 1. Resolve OpenRouter API Key
function resolveApiKey() {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;
  if (process.env.DEVELOPER_OPENROUTER_API_KEY) return process.env.DEVELOPER_OPENROUTER_API_KEY;
  try {
    const totalRecallBin = path.resolve(import.meta.dirname, '..', 'bin', 'total-recall.mjs');
    const res = spawnSync('node', [totalRecallBin, 'secret', 'get', 'DEVELOPER_OPENROUTER_API_KEY'], { encoding: 'utf8' });
    const key = (res.stdout || '').trim().split('\n').pop();
    if (key && !key.startsWith('{')) return key;
  } catch {}
  return null;
}

const apiKey = resolveApiKey();
if (!apiKey) {
  console.error('Error: Could not resolve OpenRouter API key.');
  process.exit(1);
}

// Setup logging
const logDir = path.join(process.cwd(), '.agent', 'logs', 'agents');
fs.mkdirSync(logDir, { recursive: true });
const repoName = path.basename(repoDir);
const logFile = path.join(logDir, `${repoName}-${Date.now()}.log`);
const logStream = fs.createWriteStream(logFile, { flags: 'a' });

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  logStream.write(line);
  console.log(line.trim());
}

log(`Starting OpenRouter agent worker for ${repoName} using model ${model}`);
log(`Task: ${taskPrompt}`);

// 2. Define tools
const tools = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read the contents of a file relative to the repository root',
      parameters: {
        type: 'object',
        properties: {
          file_path: { type: 'string', description: 'Relative file path' },
        },
        required: ['file_path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Create or overwrite a file relative to the repository root',
      parameters: {
        type: 'object',
        properties: {
          file_path: { type: 'string', description: 'Relative file path' },
          content: { type: 'string', description: 'File content to write' },
        },
        required: ['file_path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_command',
      description: 'Execute a shell command inside the repository root directory',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Shell command line to execute' },
        },
        required: ['command'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'task_complete',
      description: 'Signal that the task is finished',
      parameters: {
        type: 'object',
        properties: {
          summary: { type: 'string', description: 'Summary of work done' },
          files_modified: { type: 'array', items: { type: 'string' } },
        },
        required: ['summary'],
      },
    },
  },
];

function executeTool(name, toolArgs) {
  log(`Executing tool: ${name} with args: ${JSON.stringify(toolArgs)}`);
  if (name === 'read_file') {
    const full = path.resolve(repoDir, toolArgs.file_path);
    if (!fs.existsSync(full)) return { error: `File not found: ${toolArgs.file_path}` };
    const stat = fs.statSync(full);
    if (stat.isDirectory()) return { error: `Path "${toolArgs.file_path}" is a directory. Use run_command with ls to inspect directories.` };
    return { content: fs.readFileSync(full, 'utf8') };
  }
  if (name === 'write_file') {
    const full = path.resolve(repoDir, toolArgs.file_path);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, toolArgs.content, 'utf8');
    return { success: true, path: toolArgs.file_path };
  }
  if (name === 'run_command') {
    const res = spawnSync('sh', ['-c', toolArgs.command], {
      cwd: repoDir,
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024,
    });
    return {
      status: res.status,
      stdout: (res.stdout || '').slice(-2000),
      stderr: (res.stderr || '').slice(-2000),
    };
  }
  if (name === 'task_complete') {
    return { completed: true, summary: toolArgs.summary };
  }
  return { error: `Unknown tool: ${name}` };
}

// 3. System Prompt
const systemPrompt = `You are an expert autonomous software engineer working directly in the git repository: ${repoName} (${repoDir}).
Your goal is to implement the specified requirements from the project plan and project tracker.

Core Mandates:
1. SSSS FIRST: Everything is governed by the Structured Semantic Syntax System (SSSS). All persistent knowledge, schema types, and metadata adhere to SSSS specifications.
2. TOTAL RECALL CLI MANDATE: Total Recall (v3.32.4) is installed and available in PATH as 'total-recall'.
   - NEVER manually inspect, find, grep, or cat files inside the memory vault (.agent/skills/total-recall/memory-vault/).
   - ALWAYS use the CLI: run 'total-recall recall "<query>"' to search facts, decisions, rules, and documentation.
   - Use 'total-recall remember <category> "<content>"' when recording durable state.
3. TEST COMPLIANCE: Ensure any new or modified tests run with 'node --test' and pass with 0 failures.
4. MODULAR & CLEAN: Extract battle-tested, operational logic from host applications. Do not use mocks or synthetic placeholders. Keep code modular, white-label, and free of personal credentials.
5. COMPLETION: When finished, call task_complete with a concise summary.`;

const messages = [
  { role: 'system', content: systemPrompt },
  { role: 'user', content: `Task for ${repoName}:\n${taskPrompt}` },
];

async function runLoop() {
  const maxSteps = 30;
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;

  for (let step = 1; step <= maxSteps; step++) {
    log(`--- Step ${step}/${maxSteps} ---`);
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://total-recall.local',
        'X-Title': 'Total Recall Multi-Agent Orchestrator',
      },
      body: JSON.stringify({
        model,
        messages,
        tools,
        tool_choice: 'auto',
        temperature: 0.2,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      log(`API error HTTP ${res.status}: ${errText}`);
      break;
    }

    const data = await res.json();
    if (data.usage) {
      const { prompt_tokens = 0, completion_tokens = 0, total_tokens = 0 } = data.usage;
      totalPromptTokens += prompt_tokens;
      totalCompletionTokens += completion_tokens;
      log(`Tokens: prompt=${prompt_tokens}, completion=${completion_tokens}, turn_total=${total_tokens} (Accumulated: ${totalPromptTokens + totalCompletionTokens})`);
    }

    const choice = data.choices?.[0];
    if (!choice) {
      log('No choice returned from model');
      break;
    }

    const message = choice.message;
    messages.push(message);

    if (message.content) {
      log(`Model: ${message.content}`);
    }

    if (!message.tool_calls || message.tool_calls.length === 0) {
      log('No tool calls made. Finishing loop.');
      break;
    }

    let isDone = false;
    for (const toolCall of message.tool_calls) {
      const fnName = toolCall.function.name;
      let parsedArgs = {};
      try {
        parsedArgs = JSON.parse(toolCall.function.arguments);
      } catch {
        parsedArgs = {};
      }

      const result = executeTool(fnName, parsedArgs);
      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(result),
      });

      if (fnName === 'task_complete') {
        log(`Task complete signaled: ${parsedArgs.summary}`);
        isDone = true;
      }
    }

    if (isDone) {
      log('Worker completed task successfully.');
      break;
    }
  }

  // Record final cost and token ledger entry
  const costRecord = {
    timestamp: new Date().toISOString(),
    repo: repoName,
    model,
    prompt_tokens: totalPromptTokens,
    completion_tokens: totalCompletionTokens,
    total_tokens: totalPromptTokens + totalCompletionTokens,
    // DeepSeek v4.1 Flash rate: ~$0.14 / 1M prompt tokens, ~$0.28 / 1M completion tokens
    estimated_cost_usd: Number(((totalPromptTokens * 0.00000014) + (totalCompletionTokens * 0.00000028)).toFixed(6)),
  };

  try {
    const costFile = path.join(process.cwd(), '.agent', 'logs', 'agent-costs.jsonl');
    fs.appendFileSync(costFile, JSON.stringify(costRecord) + '\n', 'utf8');
    log(`Recorded cost ledger: ${JSON.stringify(costRecord)}`);
  } catch (err) {
    log(`Failed to write cost ledger: ${err.message}`);
  }

  logStream.end();
}

runLoop().catch((err) => {
  log(`Worker encountered fatal error: ${err.message}`);
  logStream.end();
  process.exit(1);
});
