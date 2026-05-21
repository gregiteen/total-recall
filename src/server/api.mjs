import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import { callFrontier, callFrontierRaw, loadFrontierConfig } from '../core/frontier.mjs';
import { callLocalRuntimeRaw, loadRuntimeConfig, checkRuntimeHealth } from '../core/runtime.mjs';
import { AVAILABLE_TOOLS, handleToolCall } from './tools.mjs';
import { requireAuth, requireScope, loginHandler, logoutHandler, changePasswordHandler, apiRateLimiter } from './auth.mjs';
import { logger } from '../core/logger.mjs';
import { synthesize as synthesizeTts, isTtsEnabled, TtsNotConfiguredError } from '../core/tts.mjs';
import { KNOWN_SCOPES, loadKeys, issueKey, revokeKey } from './keys.mjs';
import { loadNodes, writeNode } from '../core/vault.mjs';
import { compileSurface } from '../core/surface.mjs';
import { runInSandbox } from '../core/sandbox.mjs';
import { resolveAgentDir } from '../cli/agent-dir.mjs';
import path from 'path';
import os from 'os';
import fs from 'fs';
import matter from 'gray-matter';
import { agentDir } from '../core/config.mjs';

const AGENT_DIR = agentDir;
const VAULT_DIR = path.join(AGENT_DIR, 'memory-vault');
const SKILLS_DIR = path.join(AGENT_DIR, 'skills');
const DERIVED_DIR = path.join(AGENT_DIR, 'memory-derived');
const INSTRUCTIONS_FILE = path.join(AGENT_DIR, 'INSTRUCTIONS.md');
const SESSIONS_DIR = path.join(AGENT_DIR, 'sessions');
const FILES_DIR = path.join(AGENT_DIR, 'files');
const TASKS_DIR = path.join(AGENT_DIR, 'scheduler', 'queue');
const CONFIG_DIR = path.join(AGENT_DIR, 'config');
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MODEL_CATALOG_DIR = path.join(ROOT, 'models', 'catalog', 'total-recall');

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function readTextResource(filePath, name) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, 'utf8');
  const stat = fs.statSync(filePath);
  return {
    name,
    content,
    sha256: sha256(content),
    bytes: stat.size,
    modified: stat.mtime.toISOString()
  };
}

function sendTextResource(res, filePath, name) {
  const resource = readTextResource(filePath, name);
  if (!resource) {
    return res.status(404).json({ error: `${name} is not available` });
  }
  return res.json(resource);
}

function baseUrl(req) {
  return `${req.protocol}://${req.get('host')}`;
}

function absoluteUrl(req, routePath) {
  return new URL(routePath, baseUrl(req)).toString();
}

function endpointManifest(req) {
  return {
    discovery: absoluteUrl(req, '/.well-known/total-recall.json'),
    chat_completions: absoluteUrl(req, '/v1/chat/completions'),
    models: absoluteUrl(req, '/v1/models'),
    health: absoluteUrl(req, '/health'),
    api_health: absoluteUrl(req, '/api/health'),
    instructions: absoluteUrl(req, '/api/instructions'),
    ssss: absoluteUrl(req, '/api/ssss'),
    memory: absoluteUrl(req, '/api/memory'),
    api_keys_dashboard: absoluteUrl(req, '/keys')
  };
}

function listFilesRecursive(root, predicate) {
  const out = [];
  if (!fs.existsSync(root)) return out;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) out.push(...listFilesRecursive(fullPath, predicate));
    else if (entry.isFile() && predicate(fullPath)) out.push(fullPath);
  }
  return out;
}

function loadCatalogModels(runtimeConfig = {}) {
  const modelFiles = listFilesRecursive(MODEL_CATALOG_DIR, file => path.basename(file) === 'MODEL.md');
  return modelFiles.map((filePath) => {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = matter(raw);
    const data = parsed.data || {};
    const folderId = path.basename(path.dirname(filePath));
    const id = data.name || `total-recall/${folderId}`;
    const aliases = [...new Set([
      id,
      data.model_id,
      data.name,
      `total-recall/${folderId}`,
      folderId
    ].filter(Boolean))];

    return {
      id,
      object: 'model',
      created: 0,
      owned_by: data.provider || 'total-recall',
      root: runtimeConfig.model || data.model_id || id,
      parent: null,
      aliases,
      metadata: {
        provider: data.provider || 'total-recall',
        provider_type: data.provider_type || 'local-runtime',
        display_name: data.display_name || data.name || id,
        model_id: data.model_id || id,
        runtime_model: runtimeConfig.model || null,
        pricing_prompt: data.pricing_prompt ?? 0,
        pricing_completion: data.pricing_completion ?? 0,
        supports_tools: data.supports_tools ?? true,
        supports_vision: data.supports_vision ?? false,
        supports_code: data.supports_code ?? true
      }
    };
  });
}

function resolveRequestedModel(requestedModel, runtimeConfig) {
  if (!requestedModel) return runtimeConfig.model;
  if (requestedModel === runtimeConfig.model) return requestedModel;

  const catalogModels = loadCatalogModels(runtimeConfig);
  const knownTotalRecallAlias = catalogModels.some(model => model.aliases.includes(requestedModel));
  return knownTotalRecallAlias ? runtimeConfig.model : requestedModel;
}

function ssssReferenceDir() {
  return path.join(SKILLS_DIR, 'ssss', 'references');
}

function listSsssReferences(req) {
  const refsDir = ssssReferenceDir();
  if (!fs.existsSync(refsDir)) return [];
  return fs.readdirSync(refsDir)
    .filter(file => file.endsWith('.md'))
    .sort()
    .map((file) => {
      const name = file.replace(/\.md$/, '');
      const resource = readTextResource(path.join(refsDir, file), name);
      return {
        name,
        url: absoluteUrl(req, `/api/ssss/references/${name}`),
        sha256: resource?.sha256 || null,
        bytes: resource?.bytes || 0,
        modified: resource?.modified || null
      };
    });
}

function safeReferencePath(name) {
  if (!/^[a-zA-Z0-9_-]+$/.test(String(name || ''))) return null;
  return path.join(ssssReferenceDir(), `${name}.md`);
}

function getSessionId(req) {
  const fromHeader = req.headers['x-session-id'];
  if (typeof fromHeader === 'string' && /^[a-zA-Z0-9_-]{4,64}$/.test(fromHeader)) {
    return fromHeader;
  }
  const cookieSession = req.cookies?.session_id;
  if (typeof cookieSession === 'string' && /^[a-zA-Z0-9_-]{4,64}$/.test(cookieSession)) {
    return cookieSession;
  }
  // Fall back to a date-based id so concurrent unauthenticated requests share a file.
  return `daily-${new Date().toISOString().split('T')[0]}`;
}

function writeSessionRecord(sessionId, record) {
  try {
    if (!fs.existsSync(SESSIONS_DIR)) {
      fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    }
    const file = path.join(SESSIONS_DIR, `${sessionId}.jsonl`);
    fs.appendFileSync(file, JSON.stringify(record) + '\n');
  } catch (err) {
    logger.error('api', `Failed to write session record: ${err.message}`);
  }
}

export const apiRouter = express.Router();

apiRouter.use('/v1', apiRateLimiter(), requireAuth);

// ─── Chat Completions ──────────────────────────────────────────────────────────

apiRouter.post('/v1/chat/completions', requireScope('chat:write'), async (req, res) => {
  try {
    const frontierConfigPath = path.join(CONFIG_DIR, 'frontier.yml');
    const runtimeConfigPath = path.join(CONFIG_DIR, 'runtime.yml');
    
    const { messages, model, temperature } = req.body;
    
    logger.info('api', '=== NEW CHAT REQUEST ===');
    logger.info('api', `Messages count: ${messages?.length || 0}`);
    if (messages && messages.length > 0) {
      const lastUserMsg = messages.filter(m => m.role === 'user').pop();
      if (lastUserMsg) logger.info('api', `User Prompt: "${lastUserMsg.content.slice(0, 150)}${lastUserMsg.content.length > 150 ? '...' : ''}"`);
    }
    
    if (!messages || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array is required' });
    }
    
    let activeConfig = null;
    let isLocal = false;

    // Determine whether to use local runtime or frontier
    if (fs.existsSync(runtimeConfigPath)) {
      const rtConfig = loadRuntimeConfig(runtimeConfigPath);
      const health = await checkRuntimeHealth(rtConfig);
      if (health.status === 'healthy') {
        activeConfig = {
          ...rtConfig,
          model: resolveRequestedModel(model, rtConfig),
          response_model: model || rtConfig.model,
          temperature: temperature || rtConfig.temperature
        };
        isLocal = true;
      }
    }
    
    if (!isLocal) {
      const fConfig = loadFrontierConfig(frontierConfigPath);
      activeConfig = fConfig.local?.endpoint ? {
        ...fConfig,
        endpoint: fConfig.local.endpoint,
        model: resolveRequestedModel(model, { model: fConfig.local.model || fConfig.model }),
        response_model: model || fConfig.local.model || fConfig.model,
        temperature: temperature || fConfig.temperature,
        api_key: null
      } : {
        ...fConfig,
        model: model || fConfig.model,
        response_model: model || fConfig.model,
        temperature: temperature || fConfig.temperature
      };
    }


    const dateStr = new Date().toLocaleString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZoneName: 'short' });
    let baseSystemPrompt = `You are Total Recall, a Sovereign AI OS running a database-free, Markdown-first Structured Semantic Syntax System (SSSS) architecture. The current date and time is ${dateStr}.
CRITICAL RULES — you have these tools and MUST use them:

BROWSER TOOLS (headless Chromium — use for web tasks):
- 'search_web': ALWAYS use for current events, news, prices, facts outside training data. Never guess.
- 'browser_navigate': Open any URL and read its full content as markdown.
- 'browser_click': Click buttons, links, or elements on the current page by CSS selector or text.
- 'browser_type': Fill in forms or search boxes on the current page.
- 'browser_get_content': Get the full text of whatever page is currently open.
- 'browser_screenshot': Take a screenshot of the current browser page.
- 'browser_eval': Run JavaScript in the current browser page to extract data or interact with APIs.

COMPUTER USE TOOLS (desktop/X11 — use to control apps or the full desktop):
- 'computer_screenshot': Take a screenshot of the entire desktop. Do this FIRST to see what's on screen.
- 'computer_left_click': Click at absolute screen coordinates (x, y).
- 'computer_double_click': Double-click at screen coordinates.
- 'computer_right_click': Right-click at screen coordinates (opens context menus).
- 'computer_mouse_move': Move the mouse without clicking.
- 'computer_type': Type text at the current cursor position.
- 'computer_key': Press a key combo (e.g. "Return", "ctrl+c", "alt+Tab").
- 'computer_scroll': Scroll up or down at screen coordinates.

CODE / MEMORY:
- 'execute_code': Run Node.js to call APIs, process data, or perform calculations.
- 'update_design': Write markdown to DESIGN.md when asked to create a UI or document.

You have a REAL browser AND full desktop control. Use them. Navigate, click, type, scrape — do not just describe what you would do. For web tasks prefer browser tools. For native apps or desktop workflows use computer_screenshot first to orient yourself.`;

    try {
      const instructionsPath = path.join(AGENT_DIR, 'INSTRUCTIONS.md');
      if (fs.existsSync(instructionsPath)) {
        const instructions = fs.readFileSync(instructionsPath, 'utf8');
        baseSystemPrompt += `\n\n=== TIER 1 HOT MEMORY INSTRUCTIONS ===\n${instructions}`;
      }

      const ssssPath = path.join(AGENT_DIR, 'skills', 'ssss', 'SKILL.md');
      if (fs.existsSync(ssssPath)) {
        const ssssContent = fs.readFileSync(ssssPath, 'utf8');
        baseSystemPrompt += `\n\n=== STRUCTURED SEMANTIC SYNTAX SYSTEM (SSSS) DOCUMENTATION ===\nYou are the orchestrator of this system. Here is the architectural specification:\n${ssssContent}`;
      }

      // Load user profile — drives all personalisation and idle work
      const profilePath = path.join(AGENT_DIR, 'memory-vault', 'preferences', 'user-profile.md');
      const prioritiesPath = path.join(AGENT_DIR, 'memory-vault', 'preferences', 'user-priorities.md');
      const interviewTaskPath = path.join(AGENT_DIR, 'scheduler', 'queue', 'onboarding-interview.md');

      // Self-aware API reference — inject brain URL so the AI can call its own endpoints
      const selfBase = baseUrl(req);
      baseSystemPrompt += `\n\n=== YOUR OWN REST API (call these directly via execute_code or HTTP tools) ===
Base URL: ${selfBase}

MEMORY:
  GET    ${selfBase}/api/memory                    — list all nodes (optional ?type=&tag=)
  GET    ${selfBase}/api/memory/:id                — get one node
  POST   ${selfBase}/api/memory                    — create node  body: {type,title,body,tags,metadata}
  PUT    ${selfBase}/api/memory/:id                — update node
  DELETE ${selfBase}/api/memory/:id                — delete node
  POST   ${selfBase}/api/memory/search             — keyword search  body: {query,type,limit}
  POST   ${selfBase}/api/memory/search/semantic    — semantic (meaning-based) search  body: {query,top_k,include_sessions}
                                                     Returns vault nodes AND session chunks ranked by similarity

RESEARCH QUEUE:
  GET    ${selfBase}/api/research                  — list all research projects (past + pending)  ?status=pending|done|...
  POST   ${selfBase}/api/research                  — queue a new research topic  body: {topic,priority,notes}
  PATCH  ${selfBase}/api/research/:id              — update status/notes/node_slug
  DELETE ${selfBase}/api/research/:id              — remove from queue

VAULT:
  POST   ${selfBase}/api/vault/compile             — recompile INSTRUCTIONS.md + rebuild all embeddings
  GET    ${selfBase}/api/vault/nodes               — list all SSSS nodes with frontmatter
  GET    ${selfBase}/api/vault/surface             — get compiled surface text
  GET    ${selfBase}/api/vault/status              — node count, last compile time

SESSIONS:
  GET    ${selfBase}/api/sessions                  — list ingested sessions
  GET    ${selfBase}/api/sessions/:id              — get session messages
  POST   ${selfBase}/api/sessions/ingest           — ingest a session  body: {source,messages:[{role,content}]}
  DELETE ${selfBase}/api/sessions/:id              — delete session

BRAIN:
  GET    ${selfBase}/api/brain/export              — download full brain as .tar.gz  ?include=vault,derived,sessions,config,skills

CHAT (OpenAI-compatible):
  POST   ${selfBase}/v1/chat/completions           — send a chat message to yourself
  GET    ${selfBase}/v1/models                     — list available models

OTHER:
  GET    ${selfBase}/health                        — health check (vault stats, embedding index sizes, ollama status)
  GET    ${selfBase}/.well-known/total-recall.json — discovery manifest
  GET    ${selfBase}/api/keys                      — list API keys (admin)

Authentication: include  Authorization: Bearer <token>  on all requests (already set for your current session).
Use execute_code to call these endpoints with node's built-in fetch() — you are your own memory system.`;

      if (fs.existsSync(profilePath)) {
        const profile = fs.readFileSync(profilePath, 'utf8');
        baseSystemPrompt += `\n\n=== USER PROFILE ===\n${profile}`;
        if (fs.existsSync(prioritiesPath)) {
          const priorities = fs.readFileSync(prioritiesPath, 'utf8');
          baseSystemPrompt += `\n\n=== USER PRIORITIES & GOALS ===\n${priorities}`;
        }
      } else if (fs.existsSync(interviewTaskPath)) {
        // No profile yet — enter interview mode
        const interviewTask = fs.readFileSync(interviewTaskPath, 'utf8');
        baseSystemPrompt += `\n\n=== ONBOARDING INTERVIEW MODE ===
This user has not been onboarded yet. You MUST conduct the onboarding interview before doing anything else.
DO NOT answer any other questions until the interview is complete.
Ask questions one at a time, warmly and conversationally. Listen carefully. Reflect back what you hear.
After the interview, write the user's answers to:
  - ${AGENT_DIR}/memory-vault/preferences/user-profile.md
  - ${AGENT_DIR}/memory-vault/preferences/user-priorities.md
  - ${AGENT_DIR}/memory-vault/preferences/user-interests.md
Then mark ${interviewTaskPath} as status: done.

INTERVIEW TASK:
${interviewTask}`;
      }
    } catch (e) {
      logger.error('api', `Failed to load system documentation: ${e.message}`);
    }

    let currentMessages = [...messages];
    if (currentMessages.length > 0 && currentMessages[0].role === 'system') {
      currentMessages[0].content = `${baseSystemPrompt}\n\n${currentMessages[0].content}`;
    } else {
      currentMessages.unshift({ role: 'system', content: baseSystemPrompt });
    }
    let finalMessage = null;
    const startTime = Date.now();

    // Tool loop (up to 5 iterations to prevent infinite loops)
    for (let i = 0; i < 5; i++) {
      logger.info('api', `Invoking ${isLocal ? 'local' : 'frontier'} model (Iteration ${i + 1})...`);
      const message = isLocal 
        ? await callLocalRuntimeRaw(currentMessages, activeConfig, AVAILABLE_TOOLS)
        : await callFrontierRaw(currentMessages, activeConfig, AVAILABLE_TOOLS);
      currentMessages.push(message);

      if (message.tool_calls && message.tool_calls.length > 0) {
        // Execute tools
        for (const toolCall of message.tool_calls) {
          logger.info('api', `Executing tool: ${toolCall.function.name}`);
          const toolResult = await handleToolCall(toolCall);
          currentMessages.push({
            role: 'tool',
            content: toolResult,
            tool_call_id: toolCall.id
          });
        }
      } else {
        finalMessage = message;
        break;
      }
    }

    if (!finalMessage) {
      finalMessage = currentMessages[currentMessages.length - 1];
    }
    
    const elapsedMs = Date.now() - startTime;
    const elapsed = (elapsedMs / 1000).toFixed(2);
    logger.info('api', `=== CHAT RESPONSE GENERATED (${elapsed}s) ===`);
    if (finalMessage.content) {
      logger.info('api', `Response: "${finalMessage.content.slice(0, 150)}${finalMessage.content.length > 150 ? '...' : ''}"`);
    } else if (finalMessage.tool_calls) {
      logger.info('api', `Response: [Triggered ${finalMessage.tool_calls.length} tool calls]`);
    }

    // Persist this exchange so dream-cycle Light Sleep can scan it for candidates.
    const sessionId = getSessionId(req);
    const promptText = messages.filter(m => m.role !== 'system').map(m => m.content).join('\n');
    const promptTokens = Math.ceil((promptText.length || 0) / 4);
    const completionTokens = Math.ceil(((finalMessage.content || '').length || 0) / 4);
    writeSessionRecord(sessionId, {
      id: `exchange-${crypto.randomUUID()}`,
      session_id: sessionId,
      timestamp: new Date().toISOString(),
      model: activeConfig.model,
      latency_ms: elapsedMs,
      messages: currentMessages,
      response: finalMessage,
      tokens: promptTokens + completionTokens
    });
    // Emit latency + tokens so the watchdog log monitor can react to anomalies.
    logger.info('api', 'chat exchange completed', {
      session_id: sessionId,
      latency_ms: elapsedMs,
      tokens: promptTokens + completionTokens
    });

    res.json({
      id: `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: activeConfig.response_model || activeConfig.model,
      choices: [
        {
          index: 0,
          message: finalMessage,
          finish_reason: finalMessage.tool_calls ? 'tool_calls' : 'stop'
        }
      ]
    });
  } catch (error) {
    logger.error('api', 'API Error', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

apiRouter.get('/v1/chat/history', requireAuth, requireScope('chat:read'), (req, res) => {
  try {
    const sessionId = getSessionId(req);
    const file = path.join(SESSIONS_DIR, `${sessionId}.jsonl`);
    if (!fs.existsSync(file)) {
      return res.json({ messages: [] });
    }
    
    // Read the file and parse the last valid JSON line
    const content = fs.readFileSync(file, 'utf8').trim().split('\n');
    if (content.length === 0 || !content[0]) {
      return res.json({ messages: [] });
    }
    
    // The last exchange contains the cumulative messages
    const lastLine = content[content.length - 1];
    const record = JSON.parse(lastLine);
    
    // Filter out system messages so they don't clutter the UI
    const chatHistory = (record.messages || [])
      .filter(m => m.role !== 'system')
      .map((m, idx) => ({
        id: `hist-${idx}`,
        role: m.role,
        content: m.content,
        timestamp: new Date(record.timestamp).getTime(),
        versions: [m.content],
        currentVersionIndex: 0
      }));
      
    res.json({ messages: chatHistory });
  } catch (err) {
    logger.error('api', 'Error loading chat history', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});
